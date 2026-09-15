/** Isolated invalid cases: each expected error pins one declaration/input boundary. */
import { bytes, commandsFor, defineErrors, invocation, type CommandSpec, type HandlerModule, type CallerInputs, type ParsedInputs, type Flag } from "cli-for-agents";
declare function accepts<T>(value: T): void;
const define = commandsFor<{ app: undefined }>()({ errors: defineErrors({}), globalFlags: {} }).defineCommand;
const base = { path: "inspect", effects: "read", requires: "app", summary: "Inspect", description: "Inspect", args: [], flags: {} } as const satisfies CommandSpec;
const required = { ...base, args: [{ name: "terms", description: "Terms", value: { kind: "string" }, variadic: true }], flags: { label: { description: "Labels", value: { kind: "string" }, required: true, repeatable: true } } } as const;
accepts<CallerInputs<typeof required>>({ args: { terms: ["one"] }, flags: { label: ["a"] } });
// @ts-expect-error Required variadics cannot be empty.
accepts<CallerInputs<typeof required>>({ args: { terms: [] }, flags: { label: ["a"] } });
// @ts-expect-error Required repeatable flags require at least one value.
accepts<CallerInputs<typeof required>>({ args: { terms: ["one"] }, flags: { label: [] } });
// @ts-expect-error No passthrough channel exists without opt-in.
accepts<CallerInputs<typeof base>>({ passthrough: ["--unknown"] });
const defaults = { ...base, flags: { limit: { description: "Limit", value: { kind: "integer" }, default: 10 } } } as const;
// @ts-expect-error Handlers must receive the resolved default.
accepts<ParsedInputs<typeof defaults>>({ args: {}, flags: {} });
const derived = { ...base, flags: { body: { description: "Body", value: { kind: "string" }, required: true, fileSource: { maxBytes: bytes(100) } } } } as const;
declare const derivedModule: HandlerModule<typeof derived, undefined, {}>;
const body = define(derived, { examples: [{ why: "Read", flags: { "body-file": "-" } }], handler: async () => derivedModule });
invocation(body, { flags: { body: "inline" } });
invocation(body, { flags: { "body-file": "-" } });
// @ts-expect-error Required derived inputs need one source.
invocation(body, {});
const both = { flags: { body: "inline", "body-file": "note.md" } };
// @ts-expect-error Inline and file sources remain exclusive through variables.
invocation(body, both);
// @ts-expect-error Generated file names never reach the parsed handler.
accepts<ParsedInputs<typeof derived>>({ args: {}, flags: { "body-file": "-" } });

const invalidDefault = { ...base, flags: { count: { description: "Count", value: { kind: "integer" }, default: "ten" } } } as const;
declare const defaultModule: HandlerModule<typeof invalidDefault, undefined, {}>;
// @ts-expect-error Default must match the declared value kind.
define(invalidDefault, { examples: [{ why: "Read" }], handler: async () => defaultModule });
const requiredDefault = { ...base, flags: { count: { description: "Count", value: { kind: "integer" }, required: true, default: 1 } } } as const;
declare const requiredDefaultModule: HandlerModule<typeof requiredDefault, undefined, {}>;
// @ts-expect-error Required and default are mutually exclusive.
define(requiredDefault, { examples: [{ why: "Read" }], handler: async () => requiredDefaultModule });
const repeatDefault = { ...base, flags: { count: { description: "Count", value: { kind: "integer" }, repeatable: true, default: 1 } } } as const;
declare const repeatDefaultModule: HandlerModule<typeof repeatDefault, undefined, {}>;
// @ts-expect-error Repeated inputs cannot declare scalar defaults.
define(repeatDefault, { examples: [{ why: "Read" }], handler: async () => repeatDefaultModule });
const repeatFile = { ...derived, flags: { body: { ...derived.flags.body, repeatable: true } } } as const;
declare const repeatFileModule: HandlerModule<typeof repeatFile, undefined, {}>;
// @ts-expect-error Derived file alternatives cannot repeat.
define(repeatFile, { examples: [{ why: "Read", flags: { "body-file": "-" } }], handler: async () => repeatFileModule });
const collision = { ...derived, flags: { ...derived.flags, "body-file": { description: "Collision", value: { kind: "string" } } } } as const;
declare const collisionModule: HandlerModule<typeof collision, undefined, {}>;
// @ts-expect-error A domain flag cannot claim a derived spelling.
define(collision, { examples: [{ why: "Read", flags: { body: "text" } }], handler: async () => collisionModule });
const selectorCollision = { ...base, flags: { full: { description: "Filter", value: { kind: "string" } } }, levels: { full: { output: "bounded" } } } as const;
declare const selectorModule: HandlerModule<typeof selectorCollision, undefined, {}>;
// @ts-expect-error Level selectors cannot collide with value flags.
define(selectorCollision, { examples: [{ why: "Read" }], handler: async () => selectorModule });
const badOrder = { ...required, flags: {}, args: [...required.args, { name: "tail", description: "Tail", value: { kind: "string" } }] } as const;
declare const orderModule: HandlerModule<typeof badOrder, undefined, {}>;
// @ts-expect-error A variadic must be final.
define(badOrder, { examples: [{ why: "Read", args: { terms: ["a"], tail: "b" } }], handler: async () => orderModule });
const optionalOrder = { ...base, args: [{ name: "first", description: "First", value: { kind: "string" }, required: false }, { name: "second", description: "Second", value: { kind: "string" } }] } as const;
declare const optionalModule: HandlerModule<typeof optionalOrder, undefined, {}>;
// @ts-expect-error Required positionals cannot follow optional ones.
define(optionalOrder, { examples: [{ why: "Read", args: { second: "b" } }], handler: async () => optionalModule });
const values: readonly [string, ...string[]] = ["a", "b"];
const openEnum = { ...base, flags: { choice: { description: "Choice", value: { kind: "enum", values } } } } as const;
declare const enumModule: HandlerModule<typeof openEnum, undefined, {}>;
// @ts-expect-error Enum inventory must stay finite and literal.
define(openEnum, { examples: [{ why: "Read" }], handler: async () => enumModule });
const flags: Record<string, Flag> = {};
const open = { ...base, flags };
declare const openModule: HandlerModule<typeof open, undefined, {}>;
// @ts-expect-error An open inventory cannot prove absence of reserved/generated collisions.
define(open, { examples: [{ why: "Read" }], handler: async () => openModule });
// @ts-expect-error Explicit combined selectors must be nonempty.
accepts<CommandSpec>({ ...base, levels: { full: { selectors: [], output: "bounded" } } });

const credential = { ...base, flags: { token: { description: "Credential", value: { kind: "string" }, required: true, secret: true, credential: { env: "API_TOKEN" } } } } as const;
declare const credentialModule: HandlerModule<typeof credential, undefined, {}>;
const authenticated = define(credential, { examples: [{ why: "Authenticate", flags: { token: "example-token" } }], handler: async () => credentialModule });
invocation(authenticated, {});
// @ts-expect-error Ambient fallback does not authorize serializing a secret.
invocation(authenticated, { flags: { token: "private" } });
const bare = { ...base, flags: { token: { description: "Credential", value: { kind: "string" }, required: true, secret: true } } } as const;
declare const bareModule: HandlerModule<typeof bare, undefined, {}>;
const bareCommand = define(bare, { examples: [{ why: "Authenticate", flags: { token: "example-token" } }], handler: async () => bareModule });
// @ts-expect-error A required secret cannot be omitted without a declared fallback.
invocation(bareCommand, {});
// @ts-expect-error Nor may it be embedded in a hint.
invocation(bareCommand, { flags: { token: "private" } });

const exampleTypo = { why: "Read", flags: { limit: 1, typo: true } };
declare const defaultsModule: HandlerModule<typeof defaults, undefined, {}>;
// @ts-expect-error Variable-held examples cannot smuggle unknown flags into help.
define(defaults, { examples: [exampleTypo], handler: async () => defaultsModule });
const topLevelTypo = { why: "Read", extra: "ignored" };
declare const baseModule: HandlerModule<typeof base, undefined, {}>;
// @ts-expect-error Variable-held examples retain an exact top-level inventory.
define(base, { examples: [topLevelTypo], handler: async () => baseModule });

const selectors: readonly [string, ...string[]] = ["context", "full"];
const wideSelectors = { ...base, levels: { full: { selectors, output: "bounded" } } } as const;
declare const wideSelectorModule: HandlerModule<typeof wideSelectors, undefined, {}>;
// @ts-expect-error Widened selector tokens cannot establish the generated-name inventory.
define(wideSelectors, { examples: [{ why: "Read" }], handler: async () => wideSelectorModule });
const selectorArray: readonly string[] = ["context", "full"];
// @ts-expect-error Combined selector declarations require a nonempty tuple, not an array.
accepts<CommandSpec>({ ...base, levels: { full: { selectors: selectorArray, output: "bounded" } } });
