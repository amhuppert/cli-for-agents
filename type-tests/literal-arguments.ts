import { commandsFor, defineErrors, id, invocation, type CommandSpec, type HandlerModule } from "cli-for-agents";

const define = commandsFor<{ app: undefined }>()({ errors: defineErrors({}), globalFlags: {} }).defineCommand;
const spec = {
  path: "node show",
  summary: "Inspect a node.",
  description: "Use a stable node ID to inspect one node.",
  effects: "read", requires: "app",
  args: [{ name: "id", description: "Node ID.", value: { kind: "id", domain: "node" }, required: true }],
  flags: {},
} as const satisfies CommandSpec;
declare const handler: HandlerModule<typeof spec, undefined, {}>;
const valid = define(spec, {
  examples: [{ args: { id: "n_1" }, flags: {}, why: "Inspect a stable handle." }],
  handler: async () => handler,
});
invocation(valid, { args: { id: id("node", "n_1") }, flags: {} });

const widened = {
  ...spec,
  args: [{ ...spec.args[0], name: "id" as string }],
} as const;
declare const widenedHandler: HandlerModule<typeof widened, undefined, {}>;
// @ts-expect-error Widening an argument name erases the accepted-key inventory.
define(widened, {
  examples: [{ args: { typo: "n_1" }, flags: {}, why: "A typo must not become an accepted argument." }],
  handler: async () => widenedHandler,
});

const wrongInput = { args: { typo: id("node", "n_1") }, flags: {} };
// @ts-expect-error A variable cannot bypass the literal argument inventory.
invocation(valid, wrongInput);
