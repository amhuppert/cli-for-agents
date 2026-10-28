/** Positive-only caller and parsed input controls; never suppress diagnostics here. */
import { bytes, commandsFor, defineErrors, invocation, type CommandSpec, type HandlerModule, type CallerInputs, type ParsedInputs } from "cli-for-agents";
declare function accepts<T>(value: T): void;
const spec = {
  path: "input inspect", effects: "read", requires: "app", summary: "Inspect", description: "Inspect input.",
  args: [{ name: "terms", description: "Terms", value: { kind: "string" }, variadic: true, required: false }],
  flags: {
    limit: { description: "Limit", value: { kind: "integer", min: 1 }, default: 10 },
    url: { description: "Endpoint", value: { kind: "url" } },
    label: { description: "Labels", value: { kind: "enum", values: ["a", "b"] }, repeatable: true },
    body: { description: "Body", value: { kind: "string" }, fileSource: { maxBytes: bytes(100) } },
    document: { description: "Document", value: { kind: "file", maxBytes: bytes(100) } },
  },
  passthrough: true,
  levels: { context: { output: "bounded" }, full: { selectors: ["context", "full"], output: "artifact-eligible" } },
} as const satisfies CommandSpec;
accepts<CallerInputs<typeof spec>>({});
accepts<CallerInputs<typeof spec>>({ flags: { "body-file": "-", document: "note.md", url: "https://example.com", label: ["a", "b"] }, passthrough: ["--unknown", "", "a b"] });
declare const parsed: ParsedInputs<typeof spec>;
accepts<number>(parsed.flags.limit);
accepts<readonly ("a" | "b")[]>(parsed.flags.label);
accepts<readonly string[]>(parsed.args.terms);
accepts<readonly string[]>(parsed.passthrough);
accepts<string | undefined>(parsed.flags.body);
declare const handler: HandlerModule<typeof spec, undefined, {}>;
const command = commandsFor<{ app: undefined }>()({ errors: defineErrors({}), globalFlags: {} }).defineCommand(spec, { examples: [{ why: "Use defaults" }], handler: async () => handler });
invocation(command, {});
invocation(command, { flags: { "body-file": "-" }, level: "full" });

const defaultArgs = {
  path: "defaults", requires: "app", effects: "read", summary: "Defaults", description: "Defaults",
  args: [{ name: "format", description: "Format", value: { kind: "enum", values: ["text", "json"] }, default: "text" }], flags: {},
} as const satisfies CommandSpec;
accepts<CallerInputs<typeof defaultArgs>>({});
declare const resolvedArgs: ParsedInputs<typeof defaultArgs>;
accepts<"text" | "json">(resolvedArgs.args.format);
const rawFile = { ...defaultArgs, args: [{ name: "document", description: "Document", value: { kind: "file", maxBytes: bytes(100) } }] } as const;
accepts<CallerInputs<typeof rawFile>>({ args: { document: "-" } });
declare const resolvedFile: ParsedInputs<typeof rawFile>;
accepts<string>(resolvedFile.args.document);
const plain = { ...defaultArgs, args: [], flags: {} } as const;
accepts<CallerInputs<typeof plain>>({});
declare const plainHandler: HandlerModule<typeof plain, undefined, {}>;
const plainCommand = commandsFor<{ app: undefined }>()({ errors: defineErrors({}), globalFlags: {} }).defineCommand(plain, {
  examples: [{ why: "Use empty input" }], handler: async () => plainHandler,
});
invocation(plainCommand, {});

// Union declarations remain usable when every possible branch proves safe omission.
import { validationInvocation, type Flag } from "cli-for-agents";
type CredentialText = { readonly description: string; readonly value: { readonly kind: "string" } };
type SafeFallbackUnion = CredentialText & { readonly secret: true; readonly required: true } & (
  | { readonly credential: { readonly env: "API_TOKEN" } }
  | { readonly credential: { readonly env: "SERVICE_TOKEN" } }
);
type OptionalVisibilityUnion = (CredentialText & { readonly secret: true }) | (CredentialText & { readonly required: false });
export function safeCredentialUnions(ambient: SafeFallbackUnion, optional: OptionalVisibilityUnion, widenedOptional: Flag & { readonly required: false }) {
  const family = commandsFor<{}>()({ errors: defineErrors({}), globalFlags: { ambient, optional, widenedOptional } });
  const spec = {
    path: "safe apply", requires: "none", effects: "write", summary: "Apply", description: "Apply",
    args: [], flags: { ambient, optional, widenedOptional }, payload: { maxBytes: bytes(100), validatePath: "safe validate", examples: [{ payload: {}, why: "Example payload" }] },
  } as const;
  const localFamily = commandsFor<{}>()({ errors: defineErrors({}), globalFlags: {} });
  const local = localFamily.defineCommand(spec, {
    examples: [{ why: "Use ambient credentials", file: "request.json" }],
    handler: async (): Promise<HandlerModule<typeof spec, never, {}>> => { throw new Error("Compile only"); },
  });
  invocation(local, { file: "request.json" });
  validationInvocation(local, { file: "request.json" });
  const globalSpec = { ...spec, flags: {} };
  const global = family.defineCommand(globalSpec, {
    examples: [{ why: "Use ambient credentials", file: "request.json" }],
    handler: async (): Promise<HandlerModule<typeof globalSpec, never, {}, typeof family.globalFlags>> => { throw new Error("Compile only"); },
  });
  invocation(global, { file: "request.json" });
  validationInvocation(global, { file: "request.json" });
}

export const promptSpec = {
  path: "launch", requires: "none", effects: "write", summary: "Launch", description: "Launch a task",
  args: [], flags: { verbose: { description: "Verbose", value: { kind: "boolean" } } },
  payload: { maxBytes: bytes(100), validatePath: "launch-check", textInput: { flag: "prompt", field: "brief", description: "Task" }, examples: [{ payload: { brief: "work" }, why: "A task" }] },
} as const;
declare const promptHandler: HandlerModule<typeof promptSpec, never, {}>;
export const promptCommand = commandsFor<{}>()({ errors: defineErrors({}), globalFlags: {} }).defineCommand(promptSpec, {
  examples: [{ file: "task.json", why: "JSON task" }, { flags: { prompt: "work", verbose: true }, why: "Inline task" }, { flags: { "prompt-file": "task.txt" }, why: "File task" }],
  handler: async () => promptHandler,
});
invocation(promptCommand, { file: "task.json" });
invocation(promptCommand, { flags: { prompt: "work", verbose: true } });
invocation(promptCommand, { flags: { "prompt-file": "task.txt" } });
validationInvocation(promptCommand, { flags: { prompt: "work" } });
validationInvocation(promptCommand, { flags: { "prompt-file": "task.txt" } });
