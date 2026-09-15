import type { StandardSchema } from "../input.js";

/** Lazy executable objects are captured by descriptors without invoking accessors. */
export function captureExecutable(value: unknown, separatelyCaptured: readonly string[] = []): { readonly fields: Record<string, unknown>; readonly valid: boolean } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Expected a lazy module record.");
  const fields: Record<string, unknown> = Object.create(null); let valid = true;
  for (const key of Reflect.ownKeys(value)) {
    // Acquisition captures release independently because methods need not be enumerable.
    if (typeof key === "string" && separatelyCaptured.includes(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !descriptor?.enumerable || !("value" in descriptor)) { valid = false; continue; }
    fields[key] = descriptor.value;
  }
  return { fields, valid };
}
export function executableRecord(value: unknown): Record<string, unknown> {
  const captured = captureExecutable(value);
  if (!captured.valid) throw new TypeError("Expected executable data properties.");
  return captured.fields;
}
export type LazyPayload = { readonly kind: "read" | "write"; readonly decode: StandardSchema<unknown>; readonly handler: Readonly<Record<string, unknown>> };
const payloadModules = new WeakMap<object, LazyPayload>();
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
  const token = Object.freeze({});
  payloadModules.set(token, Object.freeze({ kind, decode, handler: Object.freeze(checked) }));
  return token;
}
export function payloadModule(token: unknown, kind: "read" | "write"): LazyPayload {
  if (token === null || typeof token !== "object") throw new TypeError("Unknown payload module.");
  const module = payloadModules.get(token);
  if (!module || module.kind !== kind) throw new TypeError("Unknown or mismatched payload module.");
  return module;
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
