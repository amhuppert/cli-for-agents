import { recoveryFacts } from "cli-for-agents";
/** Isolated unsuppressed runner/renderer and lazy decoder controls. */
import { bytes, commandsFor, defineErrors, mutation, payloadRead, runner, writeRunner, type HandlerInput, type PayloadHandlerInput, type StandardSchema, type Prepared, type Sha256, type ReadHandler } from "cli-for-agents";
declare function accepts<T>(value: T): void;
const errors = defineErrors({});
export const family = commandsFor<{}>()({ errors, globalFlags: {} });
export const readSpec = { path: "read", requires: "none", effects: "read", summary: "Read", description: "Read", args: [], flags: {}, levels: { full: { output: "bounded" } } } as const;
type Input = HandlerInput<typeof readSpec, never, {}>;
interface Summary { readonly count: number }
interface Detail { readonly names: readonly string[] }
export const read: ReadHandler<typeof readSpec, never, {}> = {
  run: runner<Input, Summary, never>({ run: async () => ({ ok: true, data: { count: 1 } }), text: data => String(data.count) }),
  levels: { full: runner<Input, Detail, never>({ run: async () => ({ ok: true, data: { names: [] } }), text: data => data.names.join(",") }) },
};
family.defineCommand(readSpec, { examples: [{ why: "Read" }], handler: async () => ({ default: read }) });
export const scalar = { path: "write", requires: "none", effects: "write", summary: "Write", description: "Write", args: [], flags: {} } as const;
family.defineCommand(scalar, { examples: [{ why: "Write" }], handler: async () => ({ default: {
  run: writeRunner<HandlerInput<typeof scalar, never, {}>, Summary, never>({ run: async () => ({ effect: "applied", result: { ok: true, data: { count: 1 } }, recovery: recoveryFacts([{ kind: "operation", id: "reported-1" }]) }), text: data => String(data.count) }),
} }) });
interface Payload { readonly name: string }
export const schema: StandardSchema<Payload> = { "~standard": { version: 1, vendor: "fixture", validate: () => ({ value: { name: "validated" } }) } };
export const payloadSpec = { ...readSpec, path: "query", payload: { maxBytes: bytes(1024) } } as const;
type Query = PayloadHandlerInput<typeof payloadSpec, never, Payload, {}>;
export const query = payloadRead<typeof payloadSpec, never, Payload, {}>({
  decode: schema,
  run: runner<Query, Summary, never>({ run: async ({ payload }) => ({ ok: true, data: { count: payload.name.length } }), text: data => String(data.count) }),
  levels: { full: async ({ payload }) => ({ ok: true, data: { names: [payload.name] } }) },
});
export const payloadCommand = family.defineCommand(payloadSpec, { examples: [{ why: "Query", file: "-" }], handler: async () => ({ default: query }) });
export const mutationSpec = { ...scalar, payload: { maxBytes: bytes(1024), validatePath: "validate write" } } as const;
export const mutator = mutation<typeof mutationSpec, never, string, {}, {}, Payload>({
  decode: schema,
  prepare: async ({ payload }) => ({ ok: true, value: payload.name }),
  commit: async ({ prepared }) => {
    accepts<string>(prepared.value);
    accepts<Sha256>(prepared.payloadHash);
    return { effect: "applied", result: { ok: true, data: null }, recovery: recoveryFacts([{ kind: "operation", id: "reported-1" }]) };
  },
});
family.defineCommand(mutationSpec, { examples: [{ why: "Write", file: "payload.json" }], handler: async () => ({ default: mutator }) });
declare const prepared: Prepared<"write", string>;
accepts<Prepared<"write", string>>(prepared);
