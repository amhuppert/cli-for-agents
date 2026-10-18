import { recordTestEvent } from "./test-observation.js";
import type { ParsedInvocation } from "./registry.js";
import type { InputFileSource, ResolvedRunRequest } from "../runtime/index.js";
import type { CheckedInput, InputSource } from "./input-model.js";
import { scalar } from "./input-model.js";
import type { Issue, KernelCode } from "../results.js";
import { kernelError, protocolLimits } from "../results.js";
import { commandData } from "./declarations.js";
import { defaultExport, executableRecord, payloadModule, schemaResult } from "./runner-modules.js";
import type { LazyPayload } from "./runner-modules.js";
import { assertRecord, boundedSummary, frozenJson, thrownName } from "./validation.js";
import { hasCode, InputOverflowError } from "./host.js";
import { checkedSha256 } from "../values.js";
import type { Sha256 } from "../values.js";
import type { Flag } from "../input.js";
export type LocalInput = {
  readonly args: CheckedInput["args"]; readonly flags: CheckedInput["flags"]; readonly globals: CheckedInput["globals"];
  readonly inputFiles: readonly InputFileSource[];
  readonly payload?: unknown; readonly payloadHash?: Sha256; readonly module: Readonly<Record<string, unknown>>; readonly decoder?: LazyPayload;
};
export type InputDiagnostic = { readonly message: string; readonly why: string };
/** A contract failure keeps the caught error (a handler module that cannot load, a
 * malformed decoder result) so execution can report its cause. */
export type LocalResolution = { readonly ok: true; readonly input: LocalInput }
  | { readonly ok: false; readonly code: KernelCode; readonly issues?: readonly Issue[]; readonly diagnostic?: InputDiagnostic; readonly error?: unknown };

/** A local input stage failure described without file contents or raw exception text. */
class InputFailure extends TypeError {
  constructor(readonly diagnostic: InputDiagnostic) { super(diagnostic.why); }
}
function readCause(error: unknown, maxBytes: number): string {
  if (error instanceof InputOverflowError) return `input exceeds the ${maxBytes}-byte limit.`;
  if (hasCode(error, "ENOENT")) return "file does not exist.";
  if (hasCode(error, "EISDIR")) return "path is a directory, not a file.";
  if (hasCode(error, "ENOTDIR")) return "a parent path component is not a directory.";
  if (hasCode(error, "EACCES") || hasCode(error, "EPERM")) return "OS denied read access.";
  const code = error instanceof Error && "code" in error && typeof error.code === "string" && /^E[A-Z]{1,15}$/.test(error.code) ? ` (${error.code})` : "";
  return `file read failed${code}; check that it is a readable regular file.`;
}
/** Parser prose can quote source text, so keep only its leading reason and derive the location. */
function jsonCause(error: unknown, text: string): string {
  const message = error instanceof SyntaxError ? error.message : "";
  const reason = /^Unexpected token\b/.test(message) ? "Unexpected token"
    : message.split(/ in JSON\b|, "/u)[0]!.replace(/[\p{Cc}\p{Cs}]/gu, "").trim().slice(0, 160) || "invalid JSON syntax";
  const position = /\bat position (\d+)\b/.exec(message)?.[1];
  if (position === undefined || Number(position) > text.length) return `${reason}.`;
  const before = text.slice(0, Number(position)).split("\n");
  return `${reason} at line ${before.length} column ${before.at(-1)!.length + 1}.`;
}

export async function resolveLocalInput<Contexts, Code extends string, G extends Readonly<Record<string, Flag>>>(
  invocation: ParsedInvocation<Contexts, Code, G>, request: ResolvedRunRequest,
): Promise<LocalResolution> {
  let phase: KernelCode = "KERNEL_CONTRACT";
  try {
    const { input, command } = invocation;
    const { model, handler } = commandData(command);
    const fail = (source: InputSource, message: string, cause: string): InputFailure => {
      const definition = source.kind === "argument" || source.kind === "payload" ? undefined : model.flags[source.name]!.definition;
      const subject = source.kind === "payload" ? "Payload --file" : source.kind === "argument" ? `Argument <${source.name}>`
        : `${definition!.secret ? "Secret " : ""}${source.kind === "global" ? "global" : "flag"} --${source.name}${definition!.value.kind === "file" ? "" : "-file"}`;
      const label = subject.charAt(0).toUpperCase() + subject.slice(1);
      if (definition?.secret) return new InputFailure({ message, why: `${label} ${cause}` });
      return new InputFailure({ message, why: boundedSummary(
        path => `${label} ${source.path === "-" ? "stdin" : JSON.stringify(path(source.path))} ${cause}`,
        `${label} ${cause} Its path exceeds the diagnostic limit.`, protocolLimits.diagnosticSummary) });
    };
    const args = { ...input.args }; const flags = { ...input.flags }; const globals = { ...input.globals };
    phase = "KERNEL_INPUT";
    request.signal.throwIfAborted();
    if (input.sources.filter(source => source.path === "-").length > 1) throw new TypeError("Multiple stdin consumers.");
    for (const credential of input.credentials) {
      const value = Object.hasOwn(request.env, credential.env) ? request.env[credential.env] : undefined;
      if (value === undefined) { if (credential.required) throw new TypeError("Missing credential."); continue; }
      const definition = model.flags[credential.name]!.definition;
      (credential.global ? globals : flags)[credential.name] = scalar(definition.value, value);
    }
    for (const [name, entry] of Object.entries(model.flags)) {
      if (!entry.definition.fileSource) continue;
      const values = entry.global ? globals : flags;
      if (Object.hasOwn(values, name) && new TextEncoder().encode(String(values[name])).byteLength > entry.definition.fileSource.maxBytes) {
        throw new TypeError("Inline text exceeds its source byte limit.");
      }
    }
    let payload: unknown; let payloadBytes: Uint8Array | undefined;
    for (const source of input.sources) {
      request.signal.throwIfAborted();
      let data: unknown;
      try {
        data = await (source.path === "-" ? request.host.files.readStdin(source.maxBytes, request.signal)
          : request.host.files.read(source.path, source.maxBytes, request.signal));
      } catch (error) { throw fail(source, "Input file could not be read.", `could not be read: ${readCause(error, source.maxBytes)}`); }
      request.signal.throwIfAborted();
      if (!(data instanceof Uint8Array)) throw new TypeError("Invalid bounded read.");
      if (data.byteLength > source.maxBytes) throw fail(source, "Input file could not be read.", `could not be read: ${readCause(new InputOverflowError(), source.maxBytes)}`);
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data); }
      catch { throw fail(source, "Input is not valid UTF-8.", "is not valid UTF-8 text."); }
      if (source.kind === "payload") {
        let parsed: unknown;
        try { parsed = JSON.parse(text); }
        catch (error) { throw fail(source, "Input is not valid JSON.", `is not valid JSON: ${jsonCause(error, text)}`); }
        payload = frozenJson(parsed); payloadBytes = new Uint8Array(data);
      } else if (source.kind === "argument") args[source.name] = text;
      else {
        const definition = model.flags[source.name]!.definition;
        let value: ReturnType<typeof scalar> | string = text;
        if (definition.value.kind !== "file") {
          try { value = scalar(definition.value, text); }
          catch { throw fail(source, "Input file value is invalid.", `contents are not a valid value for --${source.name}.`); }
        }
        (source.kind === "global" ? globals : flags)[source.name] = value;
      }
    }
    phase = "KERNEL_CONTRACT";
    recordTestEvent(request.signal, { type: "handler.load", commandPath: command.spec.path });
    const loaded: unknown = await handler();
    request.signal.throwIfAborted();
    const exported = defaultExport(loaded);
    let module: Readonly<Record<string, unknown>>; let decoder: LazyPayload | undefined;
    if (model.spec.payload) {
      decoder = payloadModule(exported, model.spec.effects);
      module = decoder.handler;
      phase = "KERNEL_INPUT";
      let result: unknown;
      try { result = await decoder.decode["~standard"].validate(payload); }
      catch (error) {
        throw fail(input.sources.find(source => source.kind === "payload")!, "Payload decoder failed.", `decoder threw ${thrownName(error) ?? "a non-Error value"} instead of returning schema issues.`);
      }
      request.signal.throwIfAborted();
      phase = "KERNEL_CONTRACT";
      const decoded = schemaResult(result);
      if (!decoded.ok) return { ok: false, code: "KERNEL_INPUT", issues: decoded.issues };
      payload = decoded.value;
    } else module = Object.freeze(executableRecord(exported));
    let payloadHash: Sha256 | undefined;
    if (decoder?.kind === "write") {
      if (!payloadBytes) throw new TypeError("Missing payload bytes.");
      payloadHash = checkedSha256(await request.host.sha256(payloadBytes));
      request.signal.throwIfAborted();
    }
    const inputFiles = input.sources
      .filter(source => source.kind === "argument" || source.kind === "payload" || !model.flags[source.name]?.definition.secret)
      .map(({ kind, name, path }) => ({ kind, name, path }));
    const resolved = frozenJson({ args, flags, globals, inputFiles }); assertRecord(resolved);
    return { ok: true, input: Object.freeze({ ...resolved, module, ...(decoder ? { decoder, payload } : {}), ...(payloadHash ? { payloadHash } : {}) }) };
  } catch (error) {
    if (request.signal.aborted) return { ok: false, code: "KERNEL_CANCELLED" };
    if (error instanceof InputFailure) {
      // The catalog owner checks the summary bounds; an unreportable detail keeps the plain refusal.
      try { kernelError("KERNEL_INPUT", error.diagnostic); return { ok: false, code: "KERNEL_INPUT", diagnostic: error.diagnostic }; } catch {}
    }
    return { ok: false, code: phase, ...(phase === "KERNEL_CONTRACT" ? { error } : {}) };
  }
}
