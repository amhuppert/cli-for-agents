import { bytes, commandsFor, defineErrors, invocation, mutation, recoveryFacts, type Failure, type Preparation } from "cli-for-agents";
import { hint, instruction } from "cli-for-agents/guidance";

const errors = defineErrors({ REFUSED: { exitClass: "failed", description: "Review required" } });
const family = commandsFor()({ errors, globalFlags: {} });
const status = family.defineCommand({ path: "status", summary: "Read status", description: "Inspect state", requires: "none", effects: "read", args: [], flags: {} }, { examples: [{ why: "Inspect state" }], handler: async () => ({ default: { run: async () => ({ ok: true, data: {} }) } }) });
declare function accepts<T>(value: T): void;
const refusal: Failure<never, "REFUSED"> = { ok: false, error: errors.error("REFUSED", { message: "Review first" }), instruction: instruction("reviewer", "Open review") };
accepts<Preparation<{ connection: object }, "REFUSED">>(refusal);
accepts<Preparation<void, "REFUSED">>({ ok: false, error: refusal.error, hint: hint(invocation(status, {}), "Inspect review status") });

// Successful preparations may add a JSON-safe preview and check-only guidance; the value stays opaque.
interface Counts { readonly records: number; readonly planned: readonly string[] }
declare const counts: Counts;
accepts<Preparation<Map<string, object>, "REFUSED", Counts>>({ ok: true, value: new Map(), preview: counts });
accepts<Preparation<{ close(): void }>>({ ok: true, value: { close() {} }, preview: { records: 2, nested: [null, true, "x"] } });
accepts<Preparation<{ close(): void }>>({ ok: true, value: { close() {} }, preview: null });
accepts<Preparation<void, "REFUSED">>({ ok: true, value: undefined, hint: hint(invocation(status, {}), "Inspect status before applying") });
accepts<Preparation<void, "REFUSED">>({ ok: true, value: undefined, instruction: instruction("reviewer", "Confirm the planned changes") });
const previewSpec = { path: "save", summary: "Save", description: "Save a payload", requires: "none", effects: "write", args: [], flags: {}, payload: { maxBytes: bytes(64), validatePath: "save-check", examples: [{ payload: {}, why: "Example payload" }] } } as const;
family.defineCommand(previewSpec, { examples: [{ file: "input.json", why: "Save" }], handler: async () => ({ default: mutation<typeof previewSpec, undefined, Map<string, number>, typeof errors.definitions, {}, { readonly items: readonly number[] }, Counts>({
  decode: { "~standard": { version: 1, vendor: "fixture", validate: value => ({ value: value as { readonly items: readonly number[] } }) } },
  prepare: async ({ payload }) => ({ ok: true, value: new Map([["items", payload.items.length]]), preview: { records: payload.items.length, planned: ["insert"] } }),
  commit: async ({ prepared }) => ({ effect: "applied", recovery: recoveryFacts([{ kind: "save", id: String(prepared.value.get("items")) }]), result: { ok: true, data: {} } }),
}) }) });
family.defineCommand({ ...previewSpec, path: "store", payload: { maxBytes: bytes(64), validatePath: "store-check", examples: [{ payload: {}, why: "Example payload" }] } }, { examples: [{ file: "input.json", why: "Store" }], handler: async () => ({ default: mutation({
  decode: { "~standard": { version: 1, vendor: "fixture", validate: value => ({ value }) } },
  prepare: async () => ({ ok: true, value: new Set<string>(), preview: { records: 1 } }),
  commit: async () => ({ effect: "applied", recovery: recoveryFacts([{ kind: "store", id: "one" }]), result: { ok: true, data: {} } }),
}) }) });
