/** Each rejected boundary has a corresponding valid shape in family-positive. */
import { commandsFor, defineErrors, bytes, elide, invocation, mutation, type Invocation, type PayloadDeclaration, type ReadHandler, type HandlerInput, type Preparation, type AnyCommitReport, type FamilyCode, type ErrorCatalog, type ErrorDefinitions } from "cli-for-agents";
import { createCli, type ContextProviders } from "cli-for-agents/runtime";
import { family, errors, globalFlags, spec, handler, command, noneSpec, providers, optionalContextOptions, type Contexts, type OptionalContexts } from "./family-positive.js";
declare function accepts<T>(value: T): void;
const foreign = defineErrors({ FOREIGN: { exitClass: "failed", description: "Foreign" } });
const foreignError = foreign.error("FOREIGN", { message: "Foreign" });
const foreignHandler = { run: async () => ({ ok: false, error: foreignError } as const) };
// @ts-expect-error A bound read handler cannot return an unrelated catalog's code.
family.defineCommand(spec, { examples: [{ why: "Inspect" }], handler: async () => ({ default: foreignHandler }) });
// @ts-expect-error Context selection is restricted to the family's literal keys.
family.defineCommand({ ...spec, requires: "missing" }, { examples: [{ why: "Inspect" }], handler: async () => ({ default: handler }) });
const wrongApp: ReadHandler<typeof spec, { readonly accountId: string }, typeof errors.definitions, typeof globalFlags> = { run: async () => ({ ok: true, data: null }) };
// @ts-expect-error The selected context must satisfy the lazy handler's services.
family.defineCommand(spec, { examples: [{ why: "Inspect" }], handler: async () => ({ default: wrongApp }) });
declare const noneInput: HandlerInput<typeof noneSpec, Contexts, typeof errors.definitions, typeof globalFlags>;
// @ts-expect-error requires:none removes app from handler input.
noneInput.app;
// @ts-expect-error ctx.errors exposes only the bound domain catalog.
noneInput.ctx.errors.error("FOREIGN", { message: "Foreign" });
// @ts-expect-error Handler host has no process stdout handle.
noneInput.ctx.host.stdout;
// @ts-expect-error Handler context has no process exit handle.
noneInput.ctx.exit(0);
// @ts-expect-error Resolved global URL is a string, not a numeric flag.
accepts<number>(noneInput.ctx.globals.endpoint);
// @ts-expect-error Global secrets cannot be serialized into suggestions.
invocation(command, { flags: { token: "private" } });
const unknownGlobal = { flags: { endpoint: "https://example.com", typo: true } };
// @ts-expect-error Variable-held global input still has an exact inventory.
invocation(command, unknownGlobal);

const output = { maxBytes: bytes(32768), artifacts: { directory: ".cache", forbiddenRoots: [] } };
const options = { name: "family", version: "0", family, commands: [command], doctor: invocation(command, {}), contexts: providers, output };
createCli(options);
// @ts-expect-error All context keys have exactly one provider.
createCli({ ...options, contexts: { local: providers.local } });
// @ts-expect-error Optional app values do not make their context provider optional.
accepts<ContextProviders<OptionalContexts, typeof errors.definitions, typeof globalFlags>>({});
// @ts-expect-error A command selecting an optional context still needs its provider.
createCli({ ...optionalContextOptions, contexts: {} });
const swapped = { local: providers.remote, remote: providers.local };
// @ts-expect-error Keyed providers cannot be swapped across unrelated app types.
createCli({ ...options, contexts: swapped });
const badProviders = { ...providers, remote: async () => ({ ok: false, error: foreignError } as const) };
// @ts-expect-error Provider failures are bounded to the same code set.
accepts<ContextProviders<Contexts, typeof errors.definitions, typeof globalFlags>>(badProviders);
// @ts-expect-error Foreign provider codes fail at createCli too.
createCli({ ...options, contexts: badProviders });
const foreignFamily = commandsFor<Contexts>()({ errors: foreign, globalFlags });
const foreignCommand = foreignFamily.defineCommand(spec, { examples: [{ why: "Read" }], handler: async () => ({ default: foreignHandler }) });
// @ts-expect-error A command from an unrelated catalog cannot join this family.
createCli({ ...options, commands: [foreignCommand] });
// @ts-expect-error createCli cannot replace the catalog already bound by the family.
createCli({ ...options, errors: foreign });
// @ts-expect-error Preparation rejects foreign domain failures.
accepts<Preparation<string, FamilyCode<typeof errors.definitions>>>({ ok: false, error: foreignError });
// @ts-expect-error Commit failures retain the family's bounded domain codes.
accepts<AnyCommitReport<FamilyCode<typeof errors.definitions>>>({ effect: "not_applied", result: { ok: false, error: foreignError } });
const write = { ...spec, path: "apply", effects: "write", payload: { maxBytes: bytes(100), validatePath: "validate", examples: [{ payload: {}, why: "Example payload" }] } } as const;
const foreignMutation = mutation<typeof write, Contexts["remote"], string, typeof foreign.definitions, typeof globalFlags>({
  decode: { "~standard": { version: 1, vendor: "fixture", validate: () => { throw new Error("Compile-only decoder"); } } },
  prepare: async () => ({ ok: false, error: foreignError }),
  commit: async () => ({ effect: "not_applied", result: { ok: false, error: foreignError } }),
});
// @ts-expect-error Opaque mutation erasure must retain the foreign code mismatch.
family.defineCommand(write, { examples: [{ why: "Apply", file: "request.json" }], handler: async () => ({ default: foreignMutation }) });
const collision = { ...spec, flags: { endpoint: { description: "Collision", value: { kind: "boolean" } } } } as const;
declare const collisionHandler: ReadHandler<typeof collision, Contexts["remote"], typeof errors.definitions, typeof globalFlags>;
// @ts-expect-error A local flag cannot override a global name/kind.
family.defineCommand(collision, { examples: [{ why: "Read" }], handler: async () => ({ default: collisionHandler }) });
const selectorCollision = { ...spec, levels: { endpoint: { output: "bounded" } } } as const;
declare const selectorHandler: ReadHandler<typeof selectorCollision, Contexts["remote"], typeof errors.definitions, typeof globalFlags>;
// @ts-expect-error Derived level selectors cannot collide with globals.
family.defineCommand(selectorCollision, { examples: [{ why: "Read" }], handler: async () => ({ default: selectorHandler }) });
// @ts-expect-error Framework flag names cannot be global flags either.
commandsFor<Contexts>()({ errors, globalFlags: { json: { description: "JSON", value: { kind: "boolean" } } } });
// @ts-expect-error The none context key is reserved for no acquisition.
commandsFor<{ none: string }>()({ errors, globalFlags: {} });
// @ts-expect-error Context inventories must remain closed.
commandsFor<Record<string, string>>()({ errors, globalFlags: {} });
declare const widenedErrors: ErrorCatalog<ErrorDefinitions>;
// @ts-expect-error A widened catalog cannot establish a bounded family code set.
commandsFor<Contexts>()({ errors: widenedErrors, globalFlags: {} });
// @ts-expect-error Domain catalogs cannot shadow a reserved kernel code.
defineErrors({ KERNEL_INPUT: { exitClass: "failed", description: "Shadow" } });

import { runForTest, type TestHost } from "cli-for-agents/testing";
import { cli } from "./family-positive.js";
declare const testHost: TestHost;
// @ts-expect-error Testkit context values must satisfy the bound context map too.
runForTest(cli, [], { contexts: { local: { directory: "/tmp" }, remote: { accountId: "wrong" } }, host: testHost, format: "json" });

import type { DisclosureException, ContractFixtures, TestRunResult } from "cli-for-agents/testing";
// @ts-expect-error Exceptions require the target command.
accepts<DisclosureException>({ extraFields: ["receipt"], rationale: "Compatibility", deleteWhen: "Migration" });
// @ts-expect-error Exceptions require a rationale.
accepts<DisclosureException>({ command: "inspect", extraFields: ["receipt"], deleteWhen: "Migration" });
// @ts-expect-error Exceptions require a deletion condition.
accepts<DisclosureException>({ command: "inspect", extraFields: ["receipt"], rationale: "Compatibility" });
// @ts-expect-error Exceptions require at least one extra disclosure field.
accepts<DisclosureException>({ command: "inspect", extraFields: [], rationale: "Compatibility", deleteWhen: "Migration" });
// @ts-expect-error An exception cannot disable the output byte bound.
accepts<DisclosureException>({ command: "inspect", extraFields: ["receipt"], rationale: "Compatibility", deleteWhen: "Migration", disableByteBound: true });
// @ts-expect-error Consumers must supply all seven executable scenarios.
accepts<ContractFixtures>({});
declare const textCapture: Extract<TestRunResult, { readonly format: "text" }>;
// @ts-expect-error A text run does not expose a JSON envelope.
accepts<import("cli-for-agents").AnyEnvelope>(textCapture.envelope);
declare const writeInvocation: Invocation<"write">;
// @ts-expect-error A payload declaration shows at least one example of its file.
accepts<PayloadDeclaration>({ maxBytes: bytes(100) });
// @ts-expect-error Payload examples are nonempty.
accepts<PayloadDeclaration>({ maxBytes: bytes(100), examples: [] });
// @ts-expect-error A payload schema reference names a read.
accepts<PayloadDeclaration>({ maxBytes: bytes(100), examples: [{ payload: {}, why: "Apply" }], schema: writeInvocation });
// @ts-expect-error An elided value is revealed only by a read.
elide("text", { maxBytes: bytes(1), reveal: writeInvocation });
