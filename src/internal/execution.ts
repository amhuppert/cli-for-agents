import { recordTestEvent } from "./test-observation.js";
import type { ErrorDefinitions, FamilyCode, OperationOutcome, UnknownAcknowledgment, Issue, SecondaryFailure } from "../results.js";
import type { ContextProviders, ResolvedRunRequest, PostOperationContext, SelectedContext } from "../runtime/index.js";
import type { EvaluatedGuidance } from "../guidance/index.js";
import type { ResolvedArtifactPolicy } from "../disclosure.js";
import type { Flag } from "../input.js";
import type { Sha256 } from "../values.js";
import type { Brand } from "./brand.js";
import { commandErrors } from "./declarations.js";
import { executableRecord, primaryRenderer, selectRunner } from "./runner-modules.js";
import { checkedResult, checkedWrite, observeWrite, checkedPreparation } from "./execution-reports.js";
import { assertFields, frozenJson } from "./validation.js";
import type { AnyResult, OperationEffect, KernelCode } from "../results.js";
import type { JsonValue } from "../values.js";
import { resolveLocalInput } from "./local-input.js";
import type { InputDiagnostic } from "./local-input.js";
import { kernelError, kernelErrors, checkedError, unknownAcknowledgmentFact } from "../results.js";
import type { ParsedInvocation } from "./registry.js";

/** Only execution stamps this after validating module reports and run-scoped tokens. */
export type ExecutionResult<Code extends string = string> = OperationOutcome<Code> & Brand<"ExecutionResult"> & {
  /** Exact checked runner/level renderer closed over validated data (or binary
   * summary) only. Response calls this after release; artifact-delivery bounds the assembled output.
   * Default structural rendering uses the same seam; throws are secondary output failures. */
  readonly renderPrimary: () => string;
  /** Help, version and exit-code text is framework output, not a handler primary. */
  readonly offline: boolean;
};
/** Uses only registry path and the already-computed payload hash; no durable ID is invented. */
export function unknownAcknowledgment<Contexts, Code extends string, G extends Readonly<Record<string, Flag>>>(invocation: ParsedInvocation<Contexts, Code, G>, payloadHash?: Sha256): UnknownAcknowledgment {
  return unknownAcknowledgmentFact(invocation.command.spec.path, payloadHash);
}
/** Hook facts must be detached from app before the finalizer; delivery is host-only. */
export type PostOperationFacts = {
  /** Missing when no guidance is configured or the provider failed. */
  readonly guidance?: EvaluatedGuidance;
  /** Missing when policy resolution fails; collected guidance still survives. */
  readonly artifacts?: ResolvedArtifactPolicy;
  readonly issues: readonly Issue[];
};
/** The runtime hook catches each collection/policy failure and returns accumulated
 * guidance/issues even when policy resolution fails. Do not throw away earlier
 * valid batches because a later step rejects; execution finalizes after settlement. */
export type PostOperationHook<Contexts> = (input: PostOperationContext<Contexts>) => Promise<PostOperationFacts>;
export type CompletedExecution<Code extends string = string> = {
  readonly execution: ExecutionResult<Code>;
  readonly secondary: readonly SecondaryFailure[];
} & (
  | { readonly postOperation: "completed"; readonly facts: PostOperationFacts }
  | { readonly postOperation: "failed"; readonly facts?: PostOperationFacts }
  | { readonly postOperation: "skipped"; readonly facts?: never }
);
/** Local input/schema validation precedes acquisition. The caller supplies guidance
 * collection and policy resolution as postOperation. After a successful acquisition,
 * await that hook and invoke optional release exactly once in a finally path,
 * including rejection/cancellation. Release failure is secondary, never destructive.
 * No hook or context acquisition is needed for local validation refusals (skipped).
 */

class ContractFailure extends Error {}
function failure(code: KernelCode, issues?: readonly Issue[], diagnostic?: InputDiagnostic): AnyResult {
  return Object.freeze({ ok: false, error: kernelError(code, { message: kernelErrors[code].description, ...diagnostic, ...(issues ? { issues } : {}) }) });
}
function outcome(result: AnyResult, operation: OperationEffect, renderPrimary: () => string = () => "", offline = false): ExecutionResult {
  if (result.ok && operation.effect !== "read" && operation.effect !== "applied") throw new TypeError("Invalid successful effect.");
  // Result/effect correlation is checked at this sole execution provenance boundary.
  return Object.freeze({ result, operation: Object.freeze(operation), renderPrimary, offline }) as ExecutionResult;
}
/** Composition may repair optional references while preserving the observed operation. */
export function withExecutionResult(execution: ExecutionResult, result: AnyResult): ExecutionResult {
  return outcome(result, execution.operation, execution.renderPrimary, execution.offline);
}
/** Offline routes have no application operation; reuse the execution outcome owner. */
export function offlineExecution(data: JsonValue, render: () => string): ExecutionResult {
  return outcome({ ok: true, data: frozenJson(data) }, { effect: "read" }, render, true);
}
export function usageExecution(issues: readonly Issue[]): ExecutionResult {
  // Parser explanations can include a large registry inventory. Optional prose
  // must not prevent construction of the bounded usage response.
  let result: AnyResult;
  try { result = failure("KERNEL_USAGE", issues); }
  catch { result = failure("KERNEL_USAGE", [{ code: "KERNEL_USAGE", message: "Usage details omitted; use --help to inspect accepted commands and inputs." }]); }
  return outcome(result, { effect: "read" });
}
function secondary(code: KernelCode): SecondaryFailure { return Object.freeze({ code, message: kernelErrors[code].description }); }
export async function execute<Contexts, D extends ErrorDefinitions, G extends Readonly<Record<string, Flag>>>(
  invocation: ParsedInvocation<Contexts, FamilyCode<D>, G>, request: ResolvedRunRequest,
  contexts: ContextProviders<Contexts, D, G>, postOperation: PostOperationHook<Contexts>,
): Promise<CompletedExecution<FamilyCode<D>>> {
  const spec = invocation.command.spec;
  const initial: OperationEffect = { effect: spec.effects === "write" && !invocation.validation ? "not_applied" : "read" };
  const errors = commandErrors(invocation.command);
  const local = await resolveLocalInput(invocation, request);
  const skipped = (result: AnyResult): CompletedExecution<FamilyCode<D>> => ({ execution: outcome(result, initial) as ExecutionResult<FamilyCode<D>>, secondary: [], postOperation: "skipped" });
  if (!local.ok) return skipped(failure(local.code, local.issues, local.diagnostic));
  let run: (input: unknown) => Promise<unknown>;
  let unknownEffect: Extract<OperationEffect, { effect: "unknown" }> | undefined;
  try {
    run = selectRunner(local.input.module, spec, invocation.input.level);
    if (spec.effects === "write" && !invocation.validation) unknownEffect = {
      effect: "unknown", recovery: unknownAcknowledgment(invocation, local.input.payloadHash),
    };
  }
  catch { return skipped(failure("KERNEL_CONTRACT")); }
  let release: (() => unknown) | undefined;
  let selected: SelectedContext<Contexts> = { requires: "none" };
  if (spec.requires !== "none") {
    let providerValue: unknown;
    try {
      request.signal.throwIfAborted();
      const providers = executableRecord(contexts);
      const provider = providers[spec.requires];
      if (typeof provider !== "function") return skipped(failure("KERNEL_CONTRACT"));
      recordTestEvent(request.signal, { type: "context.acquire", commandPath: spec.path });
      providerValue = await provider({ globals: local.input.globals, env: request.env, host: request.host, signal: request.signal });
    } catch { return skipped(failure(request.signal.aborted ? "KERNEL_CANCELLED" : "KERNEL_CONTEXT")); }
    try {
      if (providerValue === null || typeof providerValue !== "object") throw new TypeError("Invalid acquisition result.");
      const acquired = providerValue as { readonly ok?: unknown; readonly app?: unknown; readonly error?: unknown; readonly release?: unknown };
      // Arm cleanup before requiring app, so a malformed result is still released.
      const finalize = acquired.release;
      if (acquired.ok === true && typeof finalize === "function") release = () => Reflect.apply(finalize, providerValue, []);
      if (acquired.ok === false) return skipped({ ok: false, error: checkedError(acquired.error, errors) });
      if (acquired.ok !== true || !("app" in acquired)) throw new TypeError("Invalid acquisition result.");
      if (finalize !== undefined && typeof finalize !== "function") throw new TypeError("Invalid finalizer.");
      selected = { requires: spec.requires as keyof Contexts & string,
        app: acquired.app as Contexts[keyof Contexts & string] } as SelectedContext<Contexts>;
    } catch {
      const failures: SecondaryFailure[] = [];
      if (release) { try { recordTestEvent(request.signal, { type: "context.release", commandPath: spec.path }); await release(); } catch { failures.push(secondary("KERNEL_RELEASE")); } }
      return { ...skipped(failure("KERNEL_CONTRACT")), secondary: Object.freeze(failures) };
    }
  }
  let operation = initial;
  let result: AnyResult;
  let render = () => "";
  try {
    request.signal.throwIfAborted();
    const ctx = Object.freeze({ command: invocation.command, errors, args: local.input.args, flags: local.input.flags,
      globals: local.input.globals, inputFiles: local.input.inputFiles, env: request.env, host: request.host,
      clock: Object.freeze({ now: request.host.now, sleep: request.host.sleep }), signal: request.signal,
      ...(spec.passthrough ? { passthrough: invocation.input.passthrough ?? [] } : {}) });
    const input = Object.freeze({ ctx, ...(selected.requires === "none" ? {} : { app: selected.app }),
      ...(local.input.decoder ? { payload: local.input.payload } : {}) });
    const payloadMutation = local.input.decoder?.kind === "write";
    let writeReport = spec.effects === "write" && !payloadMutation;
    if (writeReport) operation = unknownEffect!;
    let returned: unknown = await run(input);
    if (payloadMutation) {
      let preparation;
      try { preparation = checkedPreparation(returned, errors); }
      catch { throw new ContractFailure(); }
      if (!preparation.ok) returned = preparation;
      else if (invocation.validation) returned = { ok: true, data: { valid: true, payloadHash: local.input.payloadHash } };
      else {
        request.signal.throwIfAborted();
        const hash = local.input.payloadHash;
        if (!hash) throw new ContractFailure();
        const prepared = Object.freeze({ value: preparation.value, payloadHash: hash });
        // The checked mutation wrapper retains the actual commit runner/renderer pairing.
        run = local.input.module["commit"] as (input: unknown) => Promise<unknown>;
        operation = unknownEffect!;
        returned = await run(Object.freeze({ ...input, prepared }));
        writeReport = true;
      }
    }
    try {
      if (writeReport) {
        const report = executableRecord(returned);
        operation = observeWrite(report, operation);
        result = checkedWrite(report, operation, errors, spec.output === "binary");
      } else result = checkedResult(returned, errors, spec.output === "binary");
      const data: JsonValue | undefined = result.ok && result.binary ? result.binary.summary : result.data;
      render = primaryRenderer(run, data);
    } catch { result = failure("KERNEL_CONTRACT"); }
  } catch (error) { result = failure(request.signal.aborted ? "KERNEL_CANCELLED" : error instanceof ContractFailure ? "KERNEL_CONTRACT" : "KERNEL_HANDLER"); }
  const execution = outcome(result, operation, render) as ExecutionResult<FamilyCode<D>>;
  const failures: SecondaryFailure[] = [];
  let facts: PostOperationFacts | undefined;
  try {
    // A selected key was checked against the actual provider map before app binding.
    const hookInput = Object.freeze({ ...selected, command: invocation.command, outcome: execution, inputFiles: local.input.inputFiles,
      env: request.env, host: request.host, signal: request.signal }) as PostOperationContext<Contexts>;
    const returned = await postOperation(hookInput);
    const captured = executableRecord(returned);
    assertFields(captured, ["issues"], ["guidance", "artifacts"]);
    const guidance = captured["guidance"] as EvaluatedGuidance | undefined;
    if (!Array.isArray(captured["issues"]) || guidance !== undefined && (typeof guidance !== "object" || guidance === null || Array.isArray(guidance))) {
      throw new TypeError("Invalid post-operation facts.");
    }
    const artifacts = captured["artifacts"] as ResolvedArtifactPolicy | undefined;
    facts = Object.freeze({ issues: frozenJson(returned.issues), ...(guidance !== undefined ? { guidance: frozenJson(guidance) } : {}),
      ...(artifacts !== undefined ? { artifacts } : {}) });
  } catch {
    facts = undefined;
    failures.push(secondary(request.signal.aborted ? "KERNEL_CANCELLED" : "KERNEL_GUIDANCE"));
  } finally {
    if (release) {
      try { recordTestEvent(request.signal, { type: "context.release", commandPath: spec.path }); await release(); }
      catch { failures.push(secondary("KERNEL_RELEASE")); }
    }
  }
  return Object.freeze({ execution, secondary: Object.freeze(failures),
    ...(facts ? { postOperation: "completed" as const, facts } : { postOperation: "failed" as const }) });
}
