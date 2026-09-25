/** Preparation previews are JSON DTOs beside an opaque value; failures carry neither. */
import { commandsFor, defineErrors, invocation, type Preparation } from "cli-for-agents";
import { hint, instruction } from "cli-for-agents/guidance";

declare function accepts<T>(value: T): void;
const errors = defineErrors({ REFUSED: { exitClass: "failed", description: "Review required" } });
const family = commandsFor()({ errors, globalFlags: {} });
const status = family.defineCommand({ path: "status", summary: "Read status", description: "Inspect state", requires: "none", effects: "read", args: [], flags: {} }, { examples: [{ why: "Inspect state" }], handler: async () => ({ default: { run: async () => ({ ok: true, data: {} }) } }) });
const refused = errors.error("REFUSED", { message: "Review first" });
// @ts-expect-error A preview is JSON data, not an opaque handle.
accepts<Preparation<object>>({ ok: true, value: {}, preview: new Map<string, number>() });
// @ts-expect-error Preview DTOs cannot carry functions.
accepts<Preparation<object, string, { readonly run: () => void }>>({ ok: true, value: {}, preview: { run: () => {} } });
// @ts-expect-error Preview DTOs cannot carry bigint values.
accepts<Preparation<object>>({ ok: true, value: {}, preview: { count: 1n } });
// @ts-expect-error An absent preview is omitted, not undefined.
accepts<Preparation<object>>({ ok: true, value: {}, preview: undefined });
// @ts-expect-error Typed previews reject a mismatched DTO.
accepts<Preparation<object, string, { readonly records: number }>>({ ok: true, value: {}, preview: { records: "two" } });
// @ts-expect-error A refusal has no preview.
accepts<Preparation<object, "REFUSED">>({ ok: false, error: refused, preview: {} });
// @ts-expect-error A refusal has no prepared value.
accepts<Preparation<object, "REFUSED">>({ ok: false, error: refused, value: {} });
// @ts-expect-error Successful preparation cannot combine a hint with required protocol.
accepts<Preparation<object>>({ ok: true, value: {}, hint: hint(invocation(status, {}), "Inspect"), instruction: instruction("owner", "Stop") });
// @ts-expect-error Handlers cannot author reminders.
accepts<Preparation<object>>({ ok: true, value: {}, reminders: ["Keep this true"] });
// @ts-expect-error Successful preparation does not return result data.
accepts<Preparation<object>>({ ok: true, value: {}, data: {} });
