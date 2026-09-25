import type { ExecutionResult } from "./execution.js";
import type { EvaluatedGuidance, HandlerGuidance, FinalGuidance, GuidanceConflict, ConflictSink, ConflictingInstruction, GuidanceCandidate, Reminder, ReminderList, Hint, WireGuidance } from "../guidance/index.js";
import { hint, instruction } from "../guidance/index.js";
import type { AnyBinaryArtifactRequest } from "../disclosure.js";
import type { Invocation } from "../commands.js";
import type { AnyEnvelope, Issue, SecondaryFailure, ResponseError } from "../results.js";
import { decodeWireEnvelope, kernelError, protocolLimits } from "../results.js";
import type { JsonValue } from "../values.js";
import type { Brand } from "./brand.js";
import { assertFields, assertInvocation, assertRecord, assertSerializedLimit, assertText, frozenJson } from "./validation.js";
import { referenceTokens, renderReference } from "./invocations.js";

export type ArbitrationInput = {
  readonly commandPath: string;
  readonly handler: HandlerGuidance;
  /** The one batch evaluated for this run, when guidance is configured. */
  readonly evaluated?: EvaluatedGuidance;
  /** Kernel-generated advice, already rebound; handler and rule hints win over it. */
  readonly fallbackHint?: Hint;
  readonly conflictSink: ConflictSink;
};
export type ArbitratedGuidance = Brand<"ArbitratedGuidance"> & {
  readonly guidance: FinalGuidance;
  readonly conflict?: GuidanceConflict;
  readonly issues: readonly Issue[];
  /** Contract-invalid sources are isolated without losing other valid protocol. */
  readonly failures?: readonly SecondaryFailure[];
};
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
function byRule(a: GuidanceCandidate, b: GuidanceCandidate): number {
  return compare(a.provenance.ruleId, b.provenance.ruleId) || compare(JSON.stringify(a.value), JSON.stringify(b.value));
}

/** The only arbiter: handler guidance and rule candidates enter once. */
export async function arbitrate(input: ArbitrationInput): Promise<ArbitratedGuidance> {
  const issues: Issue[] = [];
  const failures: SecondaryFailure[] = [];
  const invalid = (message: string): void => { failures.push({ code: "KERNEL_CONTRACT", message }); };
  const instructions: ConflictingInstruction[] = [];
  let handlerHint: Hint | undefined;
  try {
    const handler = frozenJson(input.handler);
    assertRecord(handler);
    assertFields(handler, [], ["hint", "instruction"]);
    if (handler.hint && handler.instruction) throw new TypeError("Mixed handler guidance.");
    if (handler.instruction !== undefined) {
      assertFields(handler.instruction, ["ownerId", "text"]);
      const value = instruction(handler.instruction.ownerId, handler.instruction.text);
      instructions.push({ instruction: value, provenance: { kind: "handler", ownerId: value.ownerId } });
    }
    if (handler.hint !== undefined) {
      assertFields(handler.hint, ["action", "invocation"]);
      handlerHint = hint(handler.hint.invocation, handler.hint.action);
    }
  } catch { invalid("Invalid handler guidance."); }
  const candidates: GuidanceCandidate[] = [];
  if (input.evaluated) {
    if (input.evaluated.commandPath !== input.commandPath) invalid("Wrong guidance command.");
    else {
      candidates.push(...input.evaluated.candidates);
      issues.push(...input.evaluated.issues.map(issue => ({ ...issue, path: ["guidance", ...issue.path ?? []] })));
    }
  }
  candidates.sort(byRule);
  for (const candidate of candidates) {
    if (candidate.tier === "instruction") instructions.push({ instruction: candidate.value, provenance: { kind: "rule", ...candidate.provenance } });
  }
  // Equality is required action text, not owner ID. Preserve all competing owners
  // when texts differ; repeated identical source entries do not duplicate events.
  const unique = instructions.filter((entry, index) => instructions.findIndex(other => JSON.stringify(other) === JSON.stringify(entry)) === index);
  let conflict: GuidanceConflict | undefined;
  let selectedInstruction = unique[0]?.instruction;
  if (new Set(unique.map(entry => entry.instruction.text)).size > 1) {
    const [first, second, ...rest] = unique;
    if (!first || !second) throw new TypeError("Conflict requires competing instructions.");
    conflict = frozenJson({ instructions: [first, second, ...rest] });
    selectedInstruction = instruction("kernel.guidance-conflict", "Stop and report conflicting required instructions before continuing.");
    if (typeof input.conflictSink === "function") {
      try { await input.conflictSink(frozenJson({ type: "guidance.conflict", commandPath: input.commandPath, conflict })); }
      catch { issues.push({ code: "KERNEL_GUIDANCE", message: "Guidance conflict sink failed.", path: ["guidance", "conflictSink"] }); }
    }
  }
  if (typeof input.conflictSink !== "function") invalid("Response arbitration requires a conflict sink.");
  const reminders: Reminder[] = [];
  const texts = new Set<string>();
  const ranked = candidates.filter(candidate => candidate.tier === "reminder")
    .sort((a, b) => b.priority - a.priority || byRule(a, b));
  for (const candidate of ranked) {
    if (texts.has(candidate.value.text)) continue;
    texts.add(candidate.value.text);
    reminders.push(candidate.value);
    if (reminders.length === 2) break;
  }
  try { assertSerializedLimit(reminders, protocolLimits.reminders); }
  catch { invalid("Selected reminders exceed their combined protocol limit."); reminders.length = 0; }
  let fallbackHint: Hint | undefined;
  if (input.fallbackHint !== undefined) {
    try { fallbackHint = hint(input.fallbackHint.invocation, input.fallbackHint.action); }
    catch { invalid("Invalid fallback hint."); }
  }
  const selectedHint = handlerHint ?? candidates.find(candidate => candidate.tier === "hint")?.value ?? fallbackHint;
  const selectedReminders: ReminderList = reminders[0] ? reminders[1] ? [reminders[0], reminders[1]] : [reminders[0]] : [];
  const guidance: FinalGuidance = { reminders: selectedReminders,
    ...(selectedInstruction ? { instruction: selectedInstruction } : selectedHint ? { hint: selectedHint } : {}) };
  // Complete selection and checks establish the private arbitration brand.
  const selected: Omit<ArbitratedGuidance, keyof Brand<"ArbitratedGuidance">> = { guidance, ...(conflict ? { conflict } : {}), issues, failures };
  return frozenJson(selected) as ArbitratedGuidance;
}

/** Structured handoff, not a final byte-bound promise. Delivery owns spill and limits. */
export type AssembledResponse = Brand<"AssembledResponse"> & {
  readonly envelope: AnyEnvelope;
  readonly guidance: FinalGuidance;
  readonly primaryText: string;
  readonly executable: string;
  readonly binary?: AnyBinaryArtifactRequest;
};
/** Runtime calls this after release; artifact-delivery consumes the result as-is. */
export async function assembleResponse(execution: ExecutionResult, options: {
  readonly guidance: ArbitratedGuidance;
  readonly doctor: Invocation<"read">;
  readonly executable: string;
  readonly secondary: readonly SecondaryFailure[];
}): Promise<AssembledResponse> {
  const { result, operation } = execution;
  const { guidance, conflict } = options.guidance;
  const failures: SecondaryFailure[] = [
    ...(conflict ? [{ code: "KERNEL_GUIDANCE" as const, message: "Required instructions conflict." }] : []),
    ...options.guidance.failures ?? [], ...options.secondary,
  ];
  const issues = [...(result.ok ? result.issues : result.error.issues) ?? [], ...options.guidance.issues];
  let data: JsonValue | undefined;
  let invalidData = false;
  try {
    const value = result.binary ? result.binary.summary : result.data;
    if (result.ok || value !== undefined) data = frozenJson(value);
  } catch {
    invalidData = true;
    failures.push({ code: "KERNEL_CONTRACT", message: "Invalid JSON response data." });
  }
  let primaryText = "";
  if (!invalidData) {
    try {
      const rendered: unknown = execution.renderPrimary();
      // Observe invalid native promises without accepting asynchronous renderers.
      if (rendered instanceof Promise) void rendered.catch(() => {});
      if (execution.offline) {
        // Help/version/catalog text is framework output from accepted metadata,
        // not a handler primary. Keep its labels and Unicode separators intact.
        if (typeof rendered !== "string") throw new TypeError("Expected offline text.");
        assertText(rendered.replaceAll("\n", ""));
        primaryText = rendered.replace(/\n+$/, "");
      } else {
        assertPrimaryText(rendered);
        primaryText = neutralizeReservedLabels(rendered.trimEnd());
      }
    } catch { failures.push({ code: "KERNEL_OUTPUT", message: "Primary rendering failed." }); }
  }
  const texts = guidance.reminders.map(value => value.text);
  const wire: WireGuidance = { reminders: texts[0] ? texts[1] ? [texts[0], texts[1]] : [texts[0]] : [],
    ...(guidance.instruction ? { instruction: guidance.instruction.text } : guidance.hint
      ? { hint: `${guidance.hint.action}: ${renderReference(guidance.hint.invocation, options.executable)}` } : {}) };
  const payload = data !== undefined ? { payload: { kind: "inline" as const, data } } : {};
  const first = failures[0];
  const error = !result.ok ? result.error : first ? kernelError(first.code, { message: first.message,
    ...(conflict ? { details: { conflict } } : {}) }) : undefined;
  type Unbranded<T> = T extends unknown ? Omit<T, keyof Brand<"Envelope">> : never;
  let envelope: Unbranded<AnyEnvelope>;
  if (error) {
    const { continuation, ...primaryError } = error;
    const references: { doctor?: Invocation<"read">; continuation?: Invocation<"read"> } =
      error.exitClass === "connection" ? { doctor: options.doctor } : {};
    // Registration guarantees the mandatory doctor fits on its own. A later
    // continuation cannot displace it or prevent an operation report returning.
    if (references.doctor) assertInvocation(references.doctor, "read");
    assertSerializedLimit(references, protocolLimits.references);
    if (continuation) {
      try {
        assertInvocation(continuation, "read");
        assertSerializedLimit({ ...references, continuation }, protocolLimits.references);
        references.continuation = continuation;
      } catch {
        failures.push({ code: "KERNEL_CONTRACT", message: "Continuation omitted: response references violate the combined protocol limit or shape." });
      }
    }
    assertText(error.why);
    const detail = conflict ? { details: { ...(error.details !== undefined && !result.ok ? { domain: error.details } : {}), conflict } } : {};
    const responseError: ResponseError = primaryError.exitClass === "connection"
      ? { ...primaryError, ...detail, ...references, doctor: options.doctor, why: error.why, issues, secondary: result.ok ? failures.slice(1) : failures }
      : { ...primaryError, ...detail, ...(references.continuation ? { continuation: references.continuation } : {}), why: error.why, issues, secondary: result.ok ? failures.slice(1) : failures };
    envelope = frozenJson({ ok: false, ...operation, ...payload, ...wire, error: responseError });
  } else {
    if (operation.effect !== "read" && operation.effect !== "applied" || data === undefined) throw new TypeError("Invalid successful operation.");
    envelope = frozenJson({ ok: true, ...operation, payload: { kind: "inline", data }, ...wire, issues });
  }
  return Object.freeze({ envelope: decodeWireEnvelope(envelope), guidance, primaryText, executable: options.executable,
    ...(result.binary ? { binary: result.binary } : {}) }) as AssembledResponse;
}

/** Unbounded pure projection. Only artifact delivery can turn this into RunResult. */
export function renderResponse(response: AssembledResponse, format: "text" | "json", compactReferences = false): {
  readonly stdout: string; readonly stderr: string; readonly exitCode: import("../results.js").ExitCode;
} {
  const { envelope, executable } = response;
  const exitCode = envelope.ok ? 0 : ({ failed: 1, usage: 2, connection: 3, version: 4 } as const)[envelope.error.exitClass];
  if (format === "json") return { stdout: `${JSON.stringify(envelope)}\n`, stderr: "", exitCode };
  const lines: string[] = [];
  if (!envelope.ok) {
    const error = envelope.error;
    // A rationale identical to the message adds no information; JSON retains it.
    lines.push(`error: ${error.code}: ${lineText(error.message)}`, ...(error.why === error.message ? [] : [`why: ${lineText(error.why)}`]));
    // Shell-quoted references already preserve token boundaries. Prose escaping
    // after quoting would change allowed Unicode characters inside the tokens.
    for (const [label, reference] of [["doctor", error.doctor], ["continuation", error.continuation]] as const) {
      if (reference) lines.push(compactReferences
        ? `${label} argv: ${JSON.stringify(referenceTokens(reference, reference.passthrough !== undefined))}`
        : `${label}: ${renderReference(reference, executable)}`);
    }
    lines.push(`effect: ${envelope.effect}`);
    if (envelope.recovery) lines.push(`recovery: ${compactText(envelope.recovery)}`);
  }
  if (envelope.ok && envelope.effect === "applied") {
    lines.push(`effect: ${envelope.effect}`, `recovery: ${compactText(envelope.recovery)}`);
  }
  if (response.primaryText) lines.push(response.primaryText);
  const issues = envelope.ok ? envelope.issues : envelope.error.issues ?? [];
  for (const issue of issues) lines.push(`issue: ${issue.code}: ${lineText(issue.message)}${issue.path ? ` (${compactText(issue.path)})` : ""}`);
  if (!envelope.ok) {
    if (envelope.error.details !== undefined) lines.push(`details: ${compactText(envelope.error.details)}`);
    for (const secondary of envelope.error.secondary) lines.push(`secondary: ${secondary.code}: ${lineText(secondary.message)}`);
  }
  for (const reminder of envelope.reminders) lines.push(`reminder: ${lineText(reminder)}`);
  if (envelope.instruction) lines.push(`instruction: ${lineText(envelope.instruction)}`);
  else if (envelope.hint) lines.push(`hint: ${envelope.hint}`);
  const text = lines.length ? `${lines.join("\n")}\n` : "";
  return envelope.ok ? { stdout: text, stderr: "", exitCode } : { stdout: "", stderr: text, exitCode };
}

function assertPrimaryText(value: unknown): asserts value is string {
  if (typeof value !== "string" || /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(value.replaceAll("\n", "")))
    throw new TypeError("Primary text contains controls or is not text.");
}
function neutralizeReservedLabels(value: string): string {
  return value.replace(/(^|\n)(?=\s*(?:hint|reminder|instruction|error|issue|why|doctor(?: argv)?|continuation(?: argv)?|secondary|effect|recovery|details|notice|artifact):)/gi, "$1| ");
}

/** Escape prose/JSON display fields only; never rewrite a shell invocation. */
function lineText(value: string): string { return value.replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029"); }
function compactText(value: unknown): string { return lineText(JSON.stringify(value)); }

/** Deterministic fallback over already validated JSON DTOs. */
export function renderStructural(data: unknown): string {
  const sorted = (value: JsonValue): JsonValue => {
    if (Array.isArray(value)) return value.map(sorted);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => compare(a, b)).map(([key, child]) => [key, sorted(child)]));
    }
    return value;
  };
  return lineText(JSON.stringify(sorted(frozenJson(data) as JsonValue), null, 2));
}
