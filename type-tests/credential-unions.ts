/** Regression probes: uncertain declarations must be safe in every possible branch. */
import { bytes, commandsFor, defineErrors, invocation, validationInvocation, type Flag, type HandlerModule } from "cli-for-agents";
const errors = defineErrors({});
const family = commandsFor<{}>()({ errors, globalFlags: {} });
const base = {
  path: "apply", requires: "none", effects: "write", summary: "Apply", description: "Apply",
  args: [], flags: {}, payload: { maxBytes: bytes(100), validatePath: "validate" },
} as const;
// A parameter keeps the declared type from being narrowed to its initializer.
export function widenedCredential(token: Flag) {
  const spec = { ...base, flags: { token } };
  const command = family.defineCommand(spec, {
    examples: [{ why: "Apply", file: "request.json" }],
    handler: async (): Promise<HandlerModule<typeof spec, never, {}>> => { throw new Error("Compile only"); },
  });
  // @ts-expect-error Flag may be required and does not guarantee an ambient fallback.
  invocation(command, { file: "request.json" });
  // @ts-expect-error The same omission is unsafe on the validation twin.
  validationInvocation(command, { file: "request.json" });
  // @ts-expect-error A possibly-secret value cannot be serialized.
  invocation(command, { file: "request.json", flags: { token: "private" } });
  const globalFamily = commandsFor<{}>()({ errors, globalFlags: { token } });
  const globalCommand = globalFamily.defineCommand(base, {
    examples: [{ why: "Apply", file: "request.json" }],
    handler: async (): Promise<HandlerModule<typeof base, never, {}, { token: Flag }>> => { throw new Error("Compile only"); },
  });
  // @ts-expect-error Family globals must retain the same uncertain requiredness.
  invocation(globalCommand, { file: "request.json" });
  // @ts-expect-error Global credentials cannot disappear from a validation invocation.
  validationInvocation(globalCommand, { file: "request.json" });
}

type TextFlag = { readonly description: string; readonly value: { readonly kind: "string" } };
type SecretOrPublic = (TextFlag & { readonly secret: true }) | (TextFlag & { readonly required: false });
export function unionVisibility(token: SecretOrPublic) {
  const spec = { ...base, flags: { token } };
  const command = family.defineCommand(spec, {
    examples: [{ why: "Apply", file: "request.json" }],
    handler: async (): Promise<HandlerModule<typeof spec, never, {}>> => { throw new Error("Compile only"); },
  });
  // @ts-expect-error A secret/public union is possibly secret even when secret is not a shared key.
  invocation(command, { file: "request.json", flags: { token: "private" } });
  // @ts-expect-error Validation invocations must not serialize the secret branch either.
  validationInvocation(command, { file: "request.json", flags: { token: "private" } });
  const globalFamily = commandsFor<{}>()({ errors, globalFlags: { token } });
  const globalCommand = globalFamily.defineCommand(base, {
    examples: [{ why: "Apply", file: "request.json" }],
    handler: async (): Promise<HandlerModule<typeof base, never, {}, { token: SecretOrPublic }>> => { throw new Error("Compile only"); },
  });
  // @ts-expect-error Union-valued globals must not serialize a possible credential.
  invocation(globalCommand, { file: "request.json", flags: { token: "private" } });
  // @ts-expect-error The global validation twin shares the secret guard.
  validationInvocation(globalCommand, { file: "request.json", flags: { token: "private" } });
}

type PartialFallback = TextFlag & { readonly required: true; readonly secret: true } & (
  | { readonly credential: { readonly env: "API_TOKEN" } }
  | { readonly credential?: never }
);
export function unionFallback(token: PartialFallback) {
  const spec = { ...base, flags: { token } };
  const command = family.defineCommand(spec, {
    examples: [{ why: "Apply", file: "request.json", flags: { token: "example" } }],
    handler: async (): Promise<HandlerModule<typeof spec, never, {}>> => { throw new Error("Compile only"); },
  });
  // @ts-expect-error Fallback on only one required branch does not make omission runnable.
  invocation(command, { file: "request.json" });
  // @ts-expect-error The validation twin also needs a fallback in every required branch.
  validationInvocation(command, { file: "request.json" });
  const globalFamily = commandsFor<{}>()({ errors, globalFlags: { token } });
  const globalCommand = globalFamily.defineCommand(base, {
    examples: [{ why: "Apply", file: "request.json", flags: { token: "example" } }],
    handler: async (): Promise<HandlerModule<typeof base, never, {}, { token: PartialFallback }>> => { throw new Error("Compile only"); },
  });
  // @ts-expect-error A global fallback must cover every required branch.
  invocation(globalCommand, { file: "request.json" });
  // @ts-expect-error Global validation invocation cannot select only the safe branch.
  validationInvocation(globalCommand, { file: "request.json" });
}

type MixedRequiredness = TextFlag & { readonly secret: true; readonly required: boolean };
export function widenedRequiredness(token: MixedRequiredness) {
  const spec = { ...base, flags: { token } };
  const command = family.defineCommand(spec, {
    examples: [{ why: "Apply", file: "request.json", flags: { token: "example" } }],
    handler: async (): Promise<HandlerModule<typeof spec, never, {}>> => { throw new Error("Compile only"); },
  });
  // @ts-expect-error Boolean requiredness includes true, so omission needs a guaranteed fallback.
  invocation(command, { file: "request.json" });
}
