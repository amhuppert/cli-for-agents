import { mutation } from "cli-for-agents";
import type { App, ClaimInput } from "./app.js";
import type { applySpec, errors } from "./commands.js";

/** The schema would load here. The declaration never imports application/schema code. */
export default mutation<typeof applySpec, App, ClaimInput, typeof errors.definitions>({
  decode: { "~standard": { version: 1, vendor: "fixture", validate: () => { throw new Error("Compile-only decoder"); } } },
  prepare: async (_input) => { throw new Error("Example preparation is a stub"); },
  commit: async (_input) => { throw new Error("Example commit is a stub"); },
});
