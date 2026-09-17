import { commandsFor, defineErrors, invocation, type Failure, type Preparation } from "cli-for-agents";
import { hint, instruction } from "cli-for-agents/guidance";

const errors = defineErrors({ REFUSED: { exitClass: "failed", description: "Review required" } });
const family = commandsFor()({ errors, globalFlags: {} });
const status = family.defineCommand({ path: "status", summary: "Read status", description: "Inspect state", requires: "none", effects: "read", args: [], flags: {} }, { examples: [{ why: "Inspect state" }], handler: async () => ({ default: { run: async () => ({ ok: true, data: {} }) } }) });
declare function accepts<T>(value: T): void;
const refusal: Failure<never, "REFUSED"> = { ok: false, error: errors.error("REFUSED", { message: "Review first" }), instruction: instruction("reviewer", "Open review") };
accepts<Preparation<{ connection: object }, "REFUSED">>(refusal);
accepts<Preparation<void, "REFUSED">>({ ok: false, error: refusal.error, hint: hint(invocation(status, {}), "Inspect review status") });
