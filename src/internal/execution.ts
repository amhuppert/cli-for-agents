import { recordTestEvent } from "./test-observation.js";
import type { ErrorDefinitions, FamilyCode, OperationOutcome, UnknownAcknowledgment, Issue, SecondaryFailure } from "../results.js";
import type { ContextProviders, ResolvedRunRequest, PostOperationContext, SelectedContext } from "../runtime/index.js";
import type { EvaluatedGuidance } from "../guidance/index.js";
import type { ResolvedArtifactPolicy } from "../disclosure.js";
import type { Flag } from "../input.js";
import type { Sha256 } from "../values.js";
import type { Brand } from "./brand.js";
import { checkResolvedArtifactPolicy } from "./artifacts.js";
import { checkParsedInvocation } from "./registry.js";
import { commandErrors } from "./declarations.js";
import { executableRecord, captureExecutable, primaryRenderer, selectRunner } from "./runner-modules.js";
import { checkedResult, checkedWrite, observeWrite, checkedPreparation } from "./execution-reports.js";
import { preparationScope, mintPreparation, usePreparation } from "./preparations.js";
import { assertFields, frozenJson } from "./validation.js";
import type { AnyResult, OperationEffect, KernelCode } from "../results.js";
import type { JsonValue } from "../values.js";
import { resolveLocalInput } from "./local-input.js";
import { kernelError, kernelErrors, checkedError, unknownAcknowledgmentFact } from "../results.js";
import type { ParsedInvocation } from "./registry.js";

/** Only execution stamps this after validating module reports and run-scoped tokens. */
export type ExecutionResult<Code extends string = string> = OperationOutcome<Code> & Brand<"ExecutionResult"> & {
  /** Exact checked runner/level renderer closed over validated data (or binary
   * summary) only. Response calls this after release; artifact-delivery bounds the assembled output.
   * Default structural rendering uses the same seam; throws are secondary output failures. */
  readonly renderPrimary: () => string;
};
/** Uses only registry path and the already-computed payload hash; no durable ID is invented. */
export function unknownAcknowledgment<Contexts, Code extends string, G extends Readonly<Record<string, Flag>>>(invocation: ParsedInvocation<Contexts, Code, G>, payloadHash?: Sha256): UnknownAcknowledgment {
  checkParsedInvocation(invocation);
  return unknownAcknowledgmentFact(invocation.command.spec.path, payloadHash);
}
/** Hook facts must be detached from app before the finalizer; delivery is host-only. */
export type PostOperationFacts = {
  readonly guidance: readonly EvaluatedGuidance[];
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
function failure(code: KernelCode, issues?: readonly Issue[]): AnyResult {
  return Object.freeze({ ok: false, error: kernelError(code, { message: kernelErrors[code].description, ...(issues ? { issues } : {}) }) });
}
function outcome(result: AnyResult, operation: OperationEffect, renderPrimary: () => string = () => ""): ExecutionResult {
  if (result.ok && operation.effect !== "read" && operation.effect !== "applied") throw new TypeError("Invalid successful effect.");
  // Result/effect correlation is checked at this sole execution provenance boundary.
  return Object.freeze({ result, operation: Object.freeze(operation), renderPrimary }) as ExecutionResult;
}
// Only the offline constructor grants this origin; handler DTO fields cannot
// opt out of the response owner's primary-renderer protocol restrictions.
const offlineExecutions = new WeakSet<object>();
export function isOfflineExecution(execution: ExecutionResult): boolean {
  return offlineExecutions.has(execution);
}
/** Composition may repair optional references while preserving the observed operation. */
export function withExecutionResult(execution: ExecutionResult, result: AnyResult): ExecutionResult {
  const retained = outcome(result, execution.operation, execution.renderPrimary);
  if (isOfflineExecution(execution)) offlineExecutions.add(retained);
  return retained;
}
/** Offline routes have no application operation; reuse the execution outcome owner. */
export function offlineExecution(data: JsonValue, render: () => string): ExecutionResult {
  const execution = outcome({ ok: true, data: frozenJson(data) }, { effect: "read" }, render);
  offlineExecutions.add(execution);
  return execution;
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
/** Find the nearest property without invoking getters or bypassing a shadowing accessor. */
function acquisitionProperty(value: object, key: string): PropertyDescriptor | undefined {
  const visited = new Set<object>();
  let current: object | null = value;
  while (current !== null) {
    if (visited.has(current)) throw new TypeError("Cyclic acquisition prototype.");
    visited.add(current);
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) return descriptor;
    current = Object.getPrototypeOf(current) as object | null;
  }
  return undefined;
}
export async function execute<Contexts, D extends ErrorDefinitions, G extends Readonly<Record<string, Flag>>>(
  invocation: ParsedInvocation<Contexts, FamilyCode<D>, G>, request: ResolvedRunRequest,
  contexts: ContextProviders<Contexts, D, G>, postOperation: PostOperationHook<Contexts>,
): Promise<CompletedExecution<FamilyCode<D>>> {
  // Reject foreign/copy tokens before consulting their claimed command metadata.
  checkParsedInvocation(invocation);
  const spec = invocation.command.spec;
  const initial: OperationEffect = { effect: spec.effects === "write" && !invocation.validation ? "not_applied" : "read" };
  const errors = commandErrors(invocation.command);
  const local = await resolveLocalInput(invocation, request);
  const skipped = (result: AnyResult): CompletedExecution<FamilyCode<D>> => ({ execution: outcome(result, initial) as ExecutionResult<FamilyCode<D>>, secondary: [], postOperation: "skipped" });
  if (!local.ok) return skipped(failure(local.code, local.issues));
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
      const releaseProperty = acquisitionProperty(providerValue, "release");
      const finalize: unknown = releaseProperty?.value;
      // Arm cleanup before enumerating metadata or requiring app. A class method or
      // non-enumerable release is still available when the rest of the result is invalid.
      if (acquisitionProperty(providerValue, "ok")?.value === true && typeof finalize === "function") {
        release = () => Reflect.apply(finalize, providerValue, []);
      }
      const captured = captureExecutable(providerValue, ["release"]);
      const acquired = captured.fields;
      if (acquired["ok"] === false) {
        if (!captured.valid || releaseProperty) throw new TypeError("Invalid acquisition properties.");
        assertFields(acquired, ["ok", "error"]);
        return skipped({ ok: false, error: checkedError(acquired["error"], errors) });
      }
      if (acquired["ok"] !== true || !Object.hasOwn(acquired, "app")) throw new TypeError("Invalid acquisition result.");
      if (!captured.valid) throw new TypeError("Invalid acquisition properties.");
      assertFields(acquired, ["ok", "app"]);
      if (releaseProperty && (!("value" in releaseProperty) || finalize !== undefined && typeof finalize !== "function")) throw new TypeError("Invalid finalizer.");
      selected = { requires: spec.requires as keyof Contexts & string,
        app: acquired["app"] as Contexts[keyof Contexts & string] } as SelectedContext<Contexts>;
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
      globals: local.input.globals, env: request.env, host: request.host,
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
        const scope = preparationScope(invocation.command, hash);
        const prepared = mintPreparation(scope, preparation.value);
        // The checked mutation wrapper retains the actual commit runner/renderer pairing.
        run = local.input.module["commit"] as (input: unknown) => Promise<unknown>;
        returned = await usePreparation(scope, prepared, hash, async token => {
          operation = unknownEffect!;
          return run(Object.freeze({ ...input, prepared: token }));
        });
        writeReport = true;
      }
    }
    try {
      if (writeReport) {
        const report = captureExecutable(returned);
        operation = observeWrite(report.fields, operation);
        if (!report.valid) throw new TypeError("Invalid commit report properties.");
        result = checkedWrite(report.fields, operation, errors, spec.output === "binary");
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
    const hookInput = Object.freeze({ ...selected, command: invocation.command, outcome: execution,
      env: request.env, host: request.host, signal: request.signal }) as PostOperationContext<Contexts>;
    const returned = await postOperation(hookInput);
    const captured = executableRecord(returned);
    assertFields(captured, ["guidance", "issues"], ["artifacts"]);
    if (!Array.isArray(captured["guidance"]) || !Array.isArray(captured["issues"])) throw new TypeError("Invalid post-operation facts.");
    const artifacts = captured["artifacts"];
    if (artifacts !== undefined) checkResolvedArtifactPolicy(artifacts);
    // Candidate/diagnostic DTOs are detached, but the checked host-only policy
    // retains its owner's identity. JSON cloning it would invalidate delivery.
    facts = Object.freeze({ guidance: frozenJson(returned.guidance), issues: frozenJson(returned.issues),
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
