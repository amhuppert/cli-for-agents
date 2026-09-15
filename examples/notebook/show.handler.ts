import type { ReadHandler } from "cli-for-agents";
import type { App } from "./app.js";
import type { showSpec, errors } from "./commands.js";

/** Compile-only example: runtime work intentionally waits for contract review. */
const handler: ReadHandler<typeof showSpec, App, typeof errors.definitions> = {
  run: async (_input) => { throw new Error("Example handler is a stub"); },
  levels: { full: async (_input) => { throw new Error("Example handler is a stub"); } },
};
export default handler;
