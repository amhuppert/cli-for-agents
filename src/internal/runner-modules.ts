import type { StandardSchema } from "../input.js";
import type { Issue } from "../results.js";
import { kernelError } from "../results.js";
import { assertFields, assertNonnegativeInteger } from "./validation.js";

/** Application modules are the author's own objects; copy their own fields as they are. */
export function executableRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Expected a module record.");
  return { ...value } as Record<string, unknown>;
}
export type LazyPayload = { readonly kind: "read" | "write"; readonly decode: StandardSchema<unknown>; readonly handler: Readonly<Record<string, unknown>> };
export function makePayloadModule(handler: unknown, kind: "read" | "write"): object {
  const checked = executableRecord(handler);
  const schema = checked["decode"];
  if (schema === null || typeof schema !== "object") throw new TypeError("Expected a schema object.");
  // Standard Schema is structural: libraries may implement its protocol with getters
  // or prototype properties. Only read the declared protocol, never enumerate a schema.
  const protocol: unknown = Reflect.get(schema, "~standard");
  if (protocol === null || typeof protocol !== "object") throw new TypeError("Expected Standard Schema v1.");
  const version: unknown = Reflect.get(protocol, "version");
  const vendor: unknown = Reflect.get(protocol, "vendor");
  const validate: unknown = Reflect.get(protocol, "validate");
  if (version !== 1 || typeof vendor !== "string" || !vendor || typeof validate !== "function") throw new TypeError("Expected Standard Schema v1.");
  const required = kind === "read" ? ["decode", "run"] : ["decode", "prepare", "commit"];
  const allowed = kind === "read" ? [...required, "levels"] : required;
  if (required.some(key => !(key in checked)) || Object.keys(checked).some(key => !allowed.includes(key))) throw new TypeError("Invalid payload runner shape.");
  for (const key of required.filter(key => key !== "decode")) if (typeof checked[key] !== "function") throw new TypeError("Expected runner function.");
  if (checked["levels"] !== undefined) {
    const levels = executableRecord(checked["levels"]);
    if (Object.values(levels).some(value => typeof value !== "function")) throw new TypeError("Expected level runner functions.");
    checked["levels"] = Object.freeze(levels);
  }
  // Version/vendor/function are checked before retaining the erased schema contract.
  const decode = Object.freeze({ "~standard": Object.freeze({ version: 1 as const, vendor,
    validate: validate.bind(protocol) as StandardSchema<unknown>["~standard"]["validate"] }) });
  const module: LazyPayload = Object.freeze({ kind, decode, handler: Object.freeze(checked) });
  return module;
}
/** The default export of a command's lazy handler module. */
export function defaultExport(loaded: unknown): unknown {
  if (loaded === null || typeof loaded !== "object" || !("default" in loaded)) throw new TypeError("Expected a lazy module with a default export.");
  return loaded.default;
}
/** Interpret a Standard Schema result: the decoded value, or its issues normalized and
 * bounded by the error catalog. A result of any other shape is a TypeError. */
export function schemaResult(result: unknown): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly issues: readonly Issue[] } {
  const checked = executableRecord(result);
  if (checked["issues"] === undefined) {
    assertFields(checked, ["value"], ["issues"]);
    return { ok: true, value: checked["value"] };
  }
  assertFields(checked, ["issues"]);
  const value = checked["issues"];
  if (!Array.isArray(value) || !value.length) throw new TypeError("Expected schema issues.");
  const issues = value.map(entry => {
    const issue = executableRecord(entry);
    if (typeof issue["message"] !== "string") throw new TypeError("Expected schema issue message.");
    const path = issue["path"];
    if (path !== undefined && !Array.isArray(path)) throw new TypeError("Expected schema issue path.");
    const normalized = path?.map((part: unknown) => {
      const key: unknown = typeof part === "object" && part !== null ? executableRecord(part)["key"] : part;
      if (typeof key === "symbol") return String(key);
      if (typeof key !== "string") assertNonnegativeInteger(key);
      return key;
    });
    return { code: "schema", message: issue["message"], ...(normalized === undefined ? {} : { path: normalized }) };
  });
  // The catalog owner checks diagnostic bounds and normalized path shape.
  return { ok: false, issues: kernelError("KERNEL_INPUT", { message: "Payload schema validation failed.", issues }).issues! };
}
export function payloadModule(token: unknown, kind: "read" | "write"): LazyPayload {
  if (token === null || typeof token !== "object" || !("kind" in token) || token.kind !== kind
    || !("decode" in token) || !("handler" in token)) throw new TypeError("Unknown or mismatched payload module.");
  return token as LazyPayload;
}

type ErasedRunner = (input: unknown) => Promise<unknown>;
const renderers = new WeakMap<ErasedRunner, (data: import("../values.js").JsonValue) => unknown>();
export function makeRenderedRunner(definition: unknown): ErasedRunner {
  const checked = executableRecord(definition);
  if (typeof checked["run"] !== "function" || checked["text"] !== undefined && typeof checked["text"] !== "function"
    || Object.keys(checked).some(key => key !== "run" && key !== "text")) throw new TypeError("Invalid rendered runner.");
  const run = checked["run"];
  const wrapped: ErasedRunner = async input => run(input);
  if (typeof checked["text"] === "function") {
    const text = checked["text"];
    renderers.set(wrapped, data => text(data));
  }
  return wrapped;
}
export function primaryRenderer(run: ErasedRunner, data: import("../values.js").JsonValue | undefined): () => string {
  const text = renderers.get(run);
  return () => {
    if (data === undefined) return "";
    const rendered: unknown = text ? text(data) : JSON.stringify(data, null, 2);
    if (typeof rendered !== "string") throw new TypeError("Renderer must return text.");
    return rendered;
  };
}
export function selectRunner(module: Readonly<Record<string, unknown>>, spec: import("../commands.js").CommandSpec, level?: string): ErasedRunner {
  if (spec.payload && spec.effects === "write") {
    if (typeof module["prepare"] !== "function" || typeof module["commit"] !== "function") throw new TypeError("Invalid mutation module.");
    return module["prepare"] as ErasedRunner;
  }
  const allowed = spec.payload ? ["decode", "run", "levels"] : ["run", "levels"];
  if (Object.keys(module).some(key => !allowed.includes(key)) || typeof module["run"] !== "function") throw new TypeError("Invalid direct runner module.");
  const levels = module["levels"] === undefined ? {} : executableRecord(module["levels"]);
  const declared = Object.keys(spec.levels ?? {});
  if (Object.keys(levels).length !== declared.length || declared.some(key => typeof levels[key] !== "function")) throw new TypeError("Runner levels must match declarations.");
  const selected = level === undefined ? module["run"] : levels[level];
  if (typeof selected !== "function") throw new TypeError("Missing selected runner.");
  return selected as ErasedRunner;
}
