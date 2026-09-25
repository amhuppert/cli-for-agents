import type { Invocation } from "./commands.js";
import type { HandlerGuidance, WireGuidance } from "./guidance/index.js";
import type { AnyPayload, Payload, AnyBinaryArtifactRequest } from "./disclosure.js";
import type { Brand } from "./internal/brand.js";
import { assertArtifactMetadata, assertFields, assertIdentifier, assertInvocation, assertNonnegativeInteger, assertRecord, assertSerializedLimit, assertText, frozenJson } from "./internal/validation.js";
import { checkedSha256 } from "./values.js";
import type { JsonData, JsonValue, NonEmpty, Sha256 } from "./values.js";

/** Canonical finite kernel catalog: every owner imports this table, never a sibling map. */
export const kernelErrors = frozenJson({
  KERNEL_USAGE: { exitClass: "usage", description: "The invocation does not match the declared CLI contract." },
  KERNEL_CONTRACT: { exitClass: "failed", description: "An application or protocol value violated its declared contract." },
  KERNEL_INPUT: { exitClass: "usage", description: "Local file, JSON or schema input could not be validated." },
  KERNEL_CANCELLED: { exitClass: "failed", description: "The operation was cancelled." },
  KERNEL_HANDLER: { exitClass: "failed", description: "The handler did not return an acknowledged outcome." },
  KERNEL_CONTEXT: { exitClass: "connection", description: "The required application context could not be acquired." },
  KERNEL_GUIDANCE: { exitClass: "failed", description: "Required guidance conflicted or could not be collected." },
  KERNEL_OUTPUT: { exitClass: "failed", description: "The bounded response could not be rendered or delivered." },
  KERNEL_RELEASE: { exitClass: "failed", description: "The application context could not be released." },
} as const satisfies ErrorDefinitions);
export type KernelCode = keyof typeof kernelErrors;
/** Serialized UTF-8 JSON limits. Constructors/ingress reject mandatory overflow. */
export const protocolLimits = Object.freeze({
  defaultOutput: 32768, minimumOutput: 8192, instruction: 1024,
  reminders: 1024, recovery: 1024, references: 1024, manifest: 2048,
  diagnosticSummary: 512,
} as const);
export type FamilyCode<D extends ErrorDefinitions> = (keyof D & string) | KernelCode;
export type Effect = "read" | "write";
export type ExitClass = "failed" | "usage" | "connection" | "version";
export type ExitCode = 0 | 1 | 2 | 3 | 4;
export type ErrorDefinitions = Readonly<Record<string, { readonly exitClass: ExitClass; readonly description: string }>>;
export type Issue = {
  readonly code: string;
  readonly message: string;
  readonly path?: readonly (string | number)[];
};
export type ErrorOptions = {
  readonly message: string;
  /** One sentence explaining the restriction, shown only on refusal. */
  readonly why?: string;
  readonly issues?: readonly Issue[];
  readonly details?: JsonValue;
};
/** Catalog description supplies default why; explicit contextual why overrides it.
 * Doctor is attached centrally. A continuation only supplements that registered read.
 */
export type CliError<Code extends string = string, Class extends ExitClass = ExitClass> =
  Class extends ExitClass ? Readonly<ErrorOptions & {
    code: Code;
    exitClass: Class;
    readonly continuation?: Invocation<"read">;
    readonly recovery?: never;
  }> & Brand<"CliError"> : never;
export interface ErrorCatalog<D extends ErrorDefinitions> {
  readonly definitions: D;
  readonly error: <const K extends keyof D & string>(
    code: K, options: ErrorOptions & { readonly continuation?: Invocation<"read">; readonly recovery?: never },
  ) => CliError<K, D[K]["exitClass"]>;
}
/** Secondary failures never change the existing primary code, class or rationale. */
export type SecondaryFailure = { readonly code: KernelCode; readonly message: string };
export type ResponseError<Code extends string = string, Class extends ExitClass = ExitClass> =
  Class extends ExitClass ? CliError<Code, Class> & {
    readonly why: string;
    readonly secondary: readonly SecondaryFailure[];
  } & (Class extends "connection" ? { readonly doctor: Invocation<"read"> } : { readonly doctor?: never }) : never;
export function defineErrors<const D extends ErrorDefinitions>(definitions: D & (string extends keyof D ? never : unknown) & Record<Extract<keyof D, KernelCode>, never>): ErrorCatalog<D> {
  const snapshot: D = frozenJson(definitions);
  assertRecord(snapshot);
  for (const [code, definition] of Object.entries(snapshot)) {
    assertIdentifier(code);
    assertSummary(code);
    if (Object.hasOwn(kernelErrors, code)) throw new TypeError("Domain catalogs cannot redefine kernel codes.");
    assertRecord(definition);
    assertFields(definition, ["exitClass", "description"]);
    if (!["failed", "usage", "connection", "version"].includes(definition.exitClass)) {
      throw new TypeError("Invalid catalog exit class.");
    }
    assertSummary(definition.description);
  }
  const error: ErrorCatalog<D>["error"] = (code, options) => {
    if (typeof code !== "string" || !Object.hasOwn(snapshot, code)) throw new TypeError("Unknown domain error code.");
    return catalogError(snapshot, code, options);
  };
  return Object.freeze({ definitions: snapshot, error });
}

/** Private package seam: all kernel failures share the catalog constructor. */
export function kernelError<K extends KernelCode>(code: K, options: ErrorOptions): CliError<K, typeof kernelErrors[K]["exitClass"]> {
  return catalogError(kernelErrors, code, options);
}
function catalogError<D extends ErrorDefinitions, K extends keyof D & string>(definitions: D, code: K,
  options: ErrorOptions & { readonly continuation?: Invocation<"read"> },
): CliError<K, D[K]["exitClass"]> {
  if (!Object.hasOwn(definitions, code)) throw new TypeError("Unknown error code.");
  const checked = frozenJson(options);
  assertRecord(checked);
  assertFields(checked, ["message"], ["why", "issues", "details", "continuation"]);
  assertSummary(checked.message);
  if (Object.hasOwn(checked, "why")) assertSummary(checked.why);
  if (Object.hasOwn(checked, "issues")) assertIssues(checked.issues);
  if (Object.hasOwn(checked, "continuation")) {
    assertInvocation(checked.continuation, "read");
    assertSerializedLimit({ continuation: checked.continuation }, protocolLimits.references);
  }
  const definition = definitions[code]!;
  // The canonical checked owner establishes code/class correlation for both catalogs.
  return Object.freeze({ ...checked, code, exitClass: definition.exitClass,
    why: checked.why ?? definition.description }) as CliError<K, D[K]["exitClass"]>;
}

/** Validate an erased report against its bound catalog before restoring an error brand. */
export function checkedError(value: unknown, catalog: ErrorCatalog<ErrorDefinitions>): CliError {
  const snapshot = frozenJson(value); assertRecord(snapshot);
  assertFields(snapshot, ["code", "exitClass", "message"], ["why", "issues", "details", "continuation"]);
  const code = snapshot["code"];
  if (typeof code !== "string") throw new TypeError("Expected an error code.");
  const definitions = Object.hasOwn(kernelErrors, code) ? kernelErrors : catalog.definitions;
  if (!Object.hasOwn(definitions, code) || definitions[code as keyof typeof definitions]?.exitClass !== snapshot["exitClass"]) throw new TypeError("Foreign code or mismatched exit class.");
  const { code: _code, exitClass: _class, ...options } = snapshot;
  // Shape and all option values are checked by the sole catalog constructor.
  return catalogError(definitions, code as keyof typeof definitions & string, options as ErrorOptions);
}
/** Private constructor: execution supplies only a provenance-checked registered path. */
export function unknownAcknowledgmentFact(commandPath: string, payloadHash?: Sha256): UnknownAcknowledgment {
  assertText(commandPath);
  if (commandPath.split(" ").some(part => !part || /\s/u.test(part))) throw new TypeError("Invalid command path.");
  if (payloadHash !== undefined) checkedSha256(payloadHash);
  const fact = frozenJson({ kind: "unknown_acknowledgment" as const, commandPath,
    ...(payloadHash === undefined ? {} : { payloadHash }), advice: "inspect_before_retry" as const });
  assertSerializedLimit(fact, protocolLimits.recovery);
  return fact as UnknownAcknowledgment;
}

function assertSummary(value: unknown): asserts value is string {
  assertText(value);
  assertSerializedLimit(value, protocolLimits.diagnosticSummary);
}

function assertIssues(value: unknown): void {
  if (!Array.isArray(value)) throw new TypeError("Expected an issue list.");
  for (const issue of value) {
    assertRecord(issue);
    assertFields(issue, ["code", "message"], ["path"]);
    assertIdentifier(issue["code"]);
    assertSummary(issue["code"]);
    assertSummary(issue["message"]);
    if (Object.hasOwn(issue, "path")) {
      const path = issue["path"];
      if (!Array.isArray(path)) throw new TypeError("Expected an issue path.");
      for (const part of path) {
        if (typeof part !== "string") assertNonnegativeInteger(part);
      }
    }
  }
}

type HandlerOnly = {
  readonly reminders?: never;
  readonly payload?: never;
  readonly effect?: never;
  readonly exitCode?: never;
  readonly why?: never;
};
type SuccessShape<Data> = HandlerOnly & HandlerGuidance & {
  readonly ok: true;
  readonly error?: never;
  /** Nonfatal diagnostics only. Error diagnostics belong to CliError. */
  readonly issues?: readonly Issue[];
} & (
  | { readonly data: Data; readonly binary?: never }
  | { readonly binary: AnyBinaryArtifactRequest & { readonly summary: Data }; readonly data?: never }
);
type FailureShape<Data, Code extends string = string> = HandlerOnly & HandlerGuidance & {
  readonly ok: false;
  readonly error: CliError<Code>;
  readonly data?: Data;
  readonly binary?: never;
  readonly issues?: never;
};
type ResultShape<Data, Code extends string = string> = SuccessShape<Data> | FailureShape<Data, Code>;

/** Domain output before arbitration, rendering, or delivery; ordinary DTO interfaces work. */
export type Success<Data> = SuccessShape<JsonData<Data>>;
export type Failure<Data, Code extends string = string> = FailureShape<JsonData<Data>, Code>;
export type Result<Data, Code extends string = string> = ResultShape<JsonData<Data>, Code>;
/** Framework boundaries accept already-checked JSON without recursively remapping JsonValue. */
export type AnySuccess = SuccessShape<JsonValue>;
export type AnyFailure<Code extends string = string> = FailureShape<JsonValue, Code>;
export type AnyResult<Code extends string = string> = ResultShape<JsonValue, Code>;

/** Only execution can stamp preparation, after prepare succeeds for this command. */
export type Prepared<Path extends string, Data> = Brand<"Prepared", Path> & {
  readonly value: Data;
  readonly payloadHash: Sha256;
};
/** The value stays opaque and reaches only commit. A validation twin returns the optional
 * JSON-safe preview and successful guidance; a refusal applies to check and write alike. */
export type Preparation<Data, Code extends string = string, Preview = JsonValue> =
  | ({ readonly ok: true; readonly value: Data; readonly preview?: JsonData<Preview>; readonly error?: never } & HandlerGuidance)
  | (Failure<never, Code> & { readonly value?: never; readonly preview?: never });

/** Only app-reported identifiers may claim durable recovery; never synthesize an ID. */
export type RecoveryReference = { readonly kind: string; readonly id: string };
export type ReportedRecovery = Brand<"ReportedRecovery"> & {
  readonly kind: "reported";
  readonly references: NonEmpty<RecoveryReference>;
};
/** Validate serialized size <= protocolLimits.recovery before branding. */
export function recoveryFacts(references: NonEmpty<RecoveryReference>): ReportedRecovery {
  const facts: { readonly kind: "reported"; readonly references: NonEmpty<RecoveryReference> } = frozenJson({ kind: "reported", references });
  if (!Array.isArray(facts.references) || facts.references.length === 0) throw new TypeError("Recovery requires reported references.");
  for (const reference of facts.references) {
    assertRecord(reference);
    assertFields(reference, ["kind", "id"]);
    assertIdentifier(reference["kind"]);
    assertIdentifier(reference["id"]);
  }
  assertSerializedLimit(facts, protocolLimits.recovery);
  return facts as ReportedRecovery;
}
/** Private execution creates this from registered metadata, excluding all raw/secret inputs. */
export type UnknownAcknowledgment = Brand<"UnknownAcknowledgment"> & {
  readonly kind: "unknown_acknowledgment";
  readonly commandPath: string;
  readonly payloadHash?: Sha256;
  readonly advice: "inspect_before_retry";
};
export type CompactRecovery = ReportedRecovery | UnknownAcknowledgment;
/** The sole effect model for application reports, execution and response assembly. */
export type OperationEffect =
  | { readonly effect: "read"; readonly recovery?: never }
  | { readonly effect: "not_applied"; readonly recovery?: never }
  | { readonly effect: "applied"; readonly recovery: ReportedRecovery }
  | { readonly effect: "unknown"; readonly recovery: CompactRecovery };
export type SuccessfulEffect = Extract<OperationEffect, { readonly effect: "read" | "applied" }>;
export type WriteEffect = Exclude<OperationEffect, { readonly effect: "read" }>;
/** Application reports facts; only execution establishes invocation provenance. */
type CommitReportShape<Data, Code extends string = string> = {
  [E in WriteEffect["effect"]]: Extract<WriteEffect, { readonly effect: E }> & {
    readonly result: E extends "applied" ? ResultShape<Data, Code> : FailureShape<Data, Code>;
  }
}[WriteEffect["effect"]];
export type CommitReport<Data, Code extends string = string> = CommitReportShape<JsonData<Data>, Code>;
export type AnyCommitReport<Code extends string = string> = CommitReportShape<JsonValue, Code>;
/** Outcome correlation reused by execution; failures can retain applied/unknown effects. */
export type OperationOutcome<Code extends string = string> =
  | { readonly result: AnySuccess; readonly operation: SuccessfulEffect }
  | { readonly result: AnyFailure<Code>; readonly operation: OperationEffect };

type EnvelopeShape<Body> = Brand<"Envelope"> & WireGuidance & { readonly why?: never } & (
  | ({ readonly ok: true; readonly payload: Body; readonly issues: readonly Issue[]; readonly error?: never } & SuccessfulEffect)
  | ({ readonly ok: false; readonly payload?: Body; readonly error: ResponseError; readonly issues?: never } & OperationEffect)
);
/** Serialized response contract. Only the pipeline can create a valid envelope. */
export type Envelope<Data> = EnvelopeShape<Payload<Data>>;
export type AnyEnvelope = EnvelopeShape<AnyPayload>;

/** Wire admission validates shape and bounds, not registry or filesystem authority. */
export function decodeWireEnvelope(value: unknown): AnyEnvelope {
  const envelope = frozenJson(value);
  assertRecord(envelope);
  const ok = envelope["ok"];
  if (typeof ok !== "boolean") throw new TypeError("Expected envelope status.");
  assertFields(envelope, ["ok", "effect", "reminders", ...(ok ? ["payload", "issues"] : ["error"])],
    ["recovery", "hint", "instruction", ...(!ok ? ["payload"] : [])]);
  const effect = envelope["effect"];
  if (effect === "read" || effect === "not_applied") {
    if (Object.hasOwn(envelope, "recovery") || ok && effect !== "read") throw new TypeError("Invalid effect recovery.");
  } else if (effect === "applied" || effect === "unknown") {
    if (ok && effect === "unknown") throw new TypeError("Success requires an acknowledged effect.");
    const recovery = envelope["recovery"];
    assertRecord(recovery);
    if (recovery["kind"] === "reported") {
      assertFields(recovery, ["kind", "references"]);
      const references = recovery["references"];
      if (!Array.isArray(references) || references.length === 0) throw new TypeError("Expected reported references.");
      const checked = references.map((reference: unknown) => {
        assertRecord(reference);
        assertFields(reference, ["kind", "id"]);
        const kind = reference["kind"], id = reference["id"];
        assertIdentifier(kind);
        assertIdentifier(id);
        return { kind, id };
      });
      const [first, ...rest] = checked;
      if (!first) throw new TypeError("Expected reported references.");
      recoveryFacts([first, ...rest]);
    } else if (recovery["kind"] === "unknown_acknowledgment" && effect === "unknown") {
      assertFields(recovery, ["kind", "commandPath", "advice"], ["payloadHash"]);
      const path = recovery["commandPath"];
      assertText(path);
      if (path.split(" ").some(part => !part || /\s/u.test(part))
        || recovery["advice"] !== "inspect_before_retry") throw new TypeError("Invalid acknowledgment recovery.");
      if (Object.hasOwn(recovery, "payloadHash")) assertWireHash(recovery["payloadHash"]);
    } else throw new TypeError("Invalid recovery kind.");
    assertSerializedLimit(recovery, protocolLimits.recovery);
  } else throw new TypeError("Invalid operation effect.");

  const reminders = envelope["reminders"];
  if (!Array.isArray(reminders) || reminders.length > 2 || new Set(reminders).size !== reminders.length) {
    throw new TypeError("Expected at most two distinct reminders.");
  }
  for (const reminder of reminders) assertText(reminder);
  assertSerializedLimit(reminders, protocolLimits.reminders);
  if (Object.hasOwn(envelope, "instruction")) {
    if (Object.hasOwn(envelope, "hint")) throw new TypeError("Instruction suppresses hint.");
    assertText(envelope["instruction"]);
    assertSerializedLimit(envelope["instruction"], protocolLimits.instruction);
  }
  if (Object.hasOwn(envelope, "hint")) assertText(envelope["hint"]);
  if (Object.hasOwn(envelope, "payload")) {
    const payload = envelope["payload"];
    assertRecord(payload);
    if (payload["kind"] === "inline") assertFields(payload, ["kind", "data"]);
    else if (payload["kind"] === "artifact") {
      assertFields(payload, ["kind", "summary", "artifact"], ["spill"]);
      const artifact = payload["artifact"];
      assertRecord(artifact);
      assertFields(artifact, ["path", "format", "mediaType", "bytes", "sha256", "reason", "contains"]);
      const path = artifact["path"];
      assertText(path);
      if (!path.startsWith("/") || path.split("/").some(part => part === "." || part === "..")) throw new TypeError("Expected an absolute artifact path.");
      assertArtifactMetadata(artifact);
      assertNonnegativeInteger(artifact["bytes"]);
      assertWireHash(artifact["sha256"]);
      assertSerializedLimit(artifact, protocolLimits.manifest);
      // Automatic spills always disclose the attempted size; other artifacts never do.
      if (artifact["reason"] === "stdout_budget_exceeded") {
        const spill = payload["spill"];
        assertRecord(spill);
        assertFields(spill, ["format", "inlineBytes", "maxBytes"]);
        assertWireEnum(spill["format"], ["text", "json"]);
        const inlineBytes = spill["inlineBytes"], maxBytes = spill["maxBytes"];
        assertNonnegativeInteger(inlineBytes); assertNonnegativeInteger(maxBytes);
        if (maxBytes < protocolLimits.minimumOutput || inlineBytes <= maxBytes) throw new TypeError("Invalid spill metadata.");
      } else if (Object.hasOwn(payload, "spill")) throw new TypeError("Only automatic spills carry spill metadata.");
    } else throw new TypeError("Invalid payload kind.");
  }
  if (ok) assertIssues(envelope["issues"]);
  else {
    const error = envelope["error"];
    assertRecord(error);
    assertFields(error, ["code", "exitClass", "message", "why", "secondary"], ["issues", "details", "doctor", "continuation"]);
    const code = error["code"];
    assertIdentifier(code);
    assertSummary(code);
    assertSummary(error["message"]);
    assertSummary(error["why"]);
    assertWireEnum(error["exitClass"], ["failed", "usage", "connection", "version"]);
    if (Object.hasOwn(kernelErrors, code) && kernelErrors[code as KernelCode].exitClass !== error["exitClass"]) throw new TypeError("Kernel classification mismatch.");
    if (Object.hasOwn(error, "issues")) assertIssues(error["issues"]);
    const secondary = error["secondary"];
    if (!Array.isArray(secondary)) throw new TypeError("Expected secondary failures.");
    for (const failure of secondary) {
      assertRecord(failure);
      assertFields(failure, ["code", "message"]);
      if (typeof failure["code"] !== "string" || !Object.hasOwn(kernelErrors, failure["code"])) throw new TypeError("Expected secondary kernel code.");
      assertSummary(failure["message"]);
    }
    if (error["exitClass"] === "connection") assertInvocation(error["doctor"], "read");
    else if (Object.hasOwn(error, "doctor")) throw new TypeError("Doctor belongs to connection failures.");
    if (Object.hasOwn(error, "continuation")) assertInvocation(error["continuation"], "read");
    assertSerializedLimit({ ...(Object.hasOwn(error, "doctor") ? { doctor: error["doctor"] } : {}),
      ...(Object.hasOwn(error, "continuation") ? { continuation: error["continuation"] } : {}) }, protocolLimits.references);
  }
  // Only this complete check establishes the wire brand; references remain unbound.
  return envelope as AnyEnvelope;
}

function assertWireHash(value: unknown): void {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError("Expected a SHA256 digest.");
}

function assertWireEnum(value: unknown, choices: readonly string[]): void {
  if (typeof value !== "string" || !choices.includes(value)) throw new TypeError("Invalid wire discriminant.");
}

