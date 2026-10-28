import { commandsFor, defineErrors, invocation, validationInvocation, type HandlerContext } from "cli-for-agents";
import { promptCommand, promptSpec } from "./input-positive.js";

// @ts-expect-error A payload source is required.
invocation(promptCommand, {});
// @ts-expect-error JSON and inline text are exclusive.
invocation(promptCommand, { file: "task.json", flags: { prompt: "work" } });
// @ts-expect-error JSON and text file are exclusive.
validationInvocation(promptCommand, { file: "task.json", flags: { "prompt-file": "task.txt" } });
// @ts-expect-error Inline text and text file are exclusive.
invocation(promptCommand, { flags: { prompt: "work", "prompt-file": "task.txt" } });
// @ts-expect-error Text must be a string.
invocation(promptCommand, { flags: { prompt: 1 } });
// @ts-expect-error Undeclared flags remain forbidden.
invocation(promptCommand, { flags: { prompt: "work", unexpected: true } });
declare const handler: HandlerContext<typeof promptSpec, never>;
// @ts-expect-error Generated payload text is only available in decoded payload.
handler.flags.prompt;

const family = commandsFor<{}>()({ errors: defineErrors({}), globalFlags: {} });
const collision = { ...promptSpec, flags: { prompt: { description: "Collision", value: { kind: "boolean" } } } } as const;
// @ts-expect-error Domain flags cannot collide with payload alternatives.
family.defineCommand(collision, { examples: [{ file: "task.json", why: "Task" }], handler: async () => { throw Error("Compile only"); } });
const wide = { ...promptSpec, payload: { ...promptSpec.payload, textInput: { ...promptSpec.payload.textInput, flag: "prompt" as string } } };
// @ts-expect-error Generated names must remain literal.
family.defineCommand(wide, { examples: [{ file: "task.json", why: "Task" }], handler: async () => { throw Error("Compile only"); } });
