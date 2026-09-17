import { recoveryFacts } from "cli-for-agents";
/** Unsuppressed family/provider/handler positives, compiled in their own program. */
import { commandsFor, defineErrors, bytes, invocation, mutation, type CommandSpec, type ReadHandler, type FamilyCode, type CliError, type AnyResult, type Result, type Preparation, type AnyCommitReport } from "cli-for-agents";
import { createCli, type ContextProviders, type GuidanceProvider, type GuidanceSources, type Host } from "cli-for-agents/runtime";
import type { EvaluatedGuidance } from "cli-for-agents/guidance";
declare function accepts<T>(value: T): void;
export type Contexts = { local: { readonly directory: string }; remote: { readonly endpoint: string } };
declare const serverGuidance: EvaluatedGuidance;
declare const localGuidance: EvaluatedGuidance;
accepts<GuidanceSources>(serverGuidance);
accepts<GuidanceSources>([serverGuidance, localGuidance]);
accepts<GuidanceProvider<Contexts>>(async () => serverGuidance);
accepts<GuidanceProvider<Contexts>>(async () => [serverGuidance, localGuidance]);
accepts<GuidanceProvider<Contexts>>(async () => []);
export const errors = defineErrors({ DENIED: { exitClass: "failed", description: "Denied" } });
export const globalFlags = {
  endpoint: { description: "Service", value: { kind: "url" }, default: "https://example.com" },
  token: { description: "Credential", value: { kind: "string" }, required: true, secret: true, credential: { env: "API_TOKEN" } },
} as const;
export const family = commandsFor<Contexts>()({ errors, globalFlags });
export const spec = { path: "inspect", requires: "remote", effects: "read", summary: "Inspect", description: "Inspect", args: [], flags: {} } as const satisfies CommandSpec;
export const handler: ReadHandler<typeof spec, Contexts["remote"], typeof errors.definitions, typeof globalFlags> = {
  run: async ({ app, ctx }) => {
    accepts<string>(app.endpoint);
    accepts<string>(ctx.globals.endpoint);
    accepts<string>(ctx.globals.token);
    accepts<"inspect">(ctx.command.spec.path);
    accepts<Host>(ctx.host);
    accepts<number>(ctx.clock.now());
    return { ok: false, error: ctx.errors.error("DENIED", { message: "Denied" }) };
  },
};
export const command = family.defineCommand(spec, { examples: [{ why: "Inspect" }], handler: async () => ({ default: handler }) });
invocation(command, {});
invocation(command, { flags: { endpoint: "https://elsewhere.example" } });
export const noneSpec = { ...spec, path: "diagnostics doctor", requires: "none" } as const;
export const none = family.defineCommand(noneSpec, { examples: [{ why: "Diagnose" }], handler: async () => ({ default: { run: async ({ ctx }) => ({ ok: true, data: { now: ctx.clock.now() } }) } }) });
export const providers: ContextProviders<Contexts, typeof errors.definitions, typeof globalFlags> = {
  local: async ({ host, globals, env, signal }) => {
    accepts<string>(globals.endpoint);
    accepts<string | undefined>(env["HOME"]);
    accepts<AbortSignal>(signal);
    return { ok: true, app: { directory: await host.files.canonicalPath(".") }, release: async () => {} };
  },
  remote: async ({ globals }) => ({ ok: true, app: { endpoint: globals.endpoint }, release: async () => {} }),
};
export const cli = createCli({ name: "family", version: "0", family, commands: [command, none], contexts: providers, doctor: invocation(none, {}), output: { maxBytes: bytes(32768), artifacts: { directory: ".cache", forbiddenRoots: [] } } });

// Optional app values still have a provider for every declared context key.
export type OptionalContexts = { remote?: { readonly endpoint: string } };
const optionalFamily = commandsFor<OptionalContexts>()({ errors, globalFlags });
const optionalCommand = optionalFamily.defineCommand(spec, {
  examples: [{ why: "Inspect optional remote state" }],
  handler: async () => ({ default: { run: async ({ app }) => {
    accepts<OptionalContexts["remote"]>(app);
    return { ok: true, data: { endpoint: app?.endpoint ?? null } };
  } } }),
});
export const optionalContextProviders: ContextProviders<OptionalContexts, typeof errors.definitions, typeof globalFlags> = {
  remote: async () => ({ ok: true, app: undefined }),
};
accepts<ContextProviders<OptionalContexts, typeof errors.definitions, typeof globalFlags>>({
  remote: async ({ globals }) => ({ ok: true, app: { endpoint: globals.endpoint } }),
});
export const optionalContextOptions = {
  name: "optional-family", version: "0", family: optionalFamily, commands: [optionalCommand],
  contexts: optionalContextProviders, doctor: invocation(optionalCommand, {}),
  output: { artifacts: { directory: ".cache", forbiddenRoots: [] } },
};
createCli(optionalContextOptions);

declare const kernelError: CliError<"KERNEL_INPUT", "usage">;
accepts<AnyResult<FamilyCode<typeof errors.definitions>>>({ ok: false, error: kernelError });
interface Dto { readonly id: string }
declare const result: Result<Dto, FamilyCode<typeof errors.definitions>>;
accepts<AnyResult<FamilyCode<typeof errors.definitions>>>(result);
accepts<Preparation<Dto, FamilyCode<typeof errors.definitions>>>({ ok: false, error: errors.error("DENIED", { message: "Denied" }) });
accepts<AnyCommitReport<FamilyCode<typeof errors.definitions>>>({ effect: "not_applied", result: { ok: false, error: kernelError } });
const writeSpec = { ...spec, path: "apply", effects: "write", payload: { maxBytes: bytes(100), validatePath: "validate" } } as const;
const writeModule = mutation<typeof writeSpec, Contexts["remote"], Dto, typeof errors.definitions, typeof globalFlags>({
  decode: { "~standard": { version: 1, vendor: "fixture", validate: () => { throw new Error("Compile-only decoder"); } } },
  prepare: async () => ({ ok: true, value: { id: "1" } }),
  commit: async ({ prepared }) => ({ effect: "applied", result: { ok: true, data: { id: prepared.value.id } }, recovery: recoveryFacts([{ kind: "operation", id: "reported-1" }]) }),
});
family.defineCommand(writeSpec, { examples: [{ why: "Apply", file: "request.json" }], handler: async () => ({ default: writeModule }) });

// All four package surfaces consume the same bound declaration and context map.
import { hint } from "cli-for-agents/guidance";
import { runForTest, contractTests, type TestHost } from "cli-for-agents/testing";
declare const testHost: TestHost;
hint(invocation(command, {}), "Inspect");
runForTest(cli, invocation(command, {}), { contexts: { local: { directory: "/tmp" }, remote: { endpoint: "https://example.com" } }, host: testHost, format: "json" });
contractTests(cli);

// Context-free libraries can declare an empty map and acquire nothing.
const offlineFamily = commandsFor<{}>()({ errors: defineErrors({}), globalFlags: {} });
const offline = offlineFamily.defineCommand(noneSpec, {
  examples: [{ why: "Diagnose offline" }], handler: async () => ({ default: { run: async () => ({ ok: true, data: null }) } }),
});
createCli({ name: "offline", version: "0", family: offlineFamily, commands: [offline], doctor: invocation(offline, {}), contexts: {}, output: { maxBytes: bytes(32768), artifacts: { directory: ".cache", forbiddenRoots: [] } } });

// Narrow a runtime choice before declaring; each branch retains its actual handler input.
export function declareSelectedContext(requires: "remote" | "none") {
  if (requires === "remote") {
    const selected = { ...spec, requires };
    return family.defineCommand(selected, {
      examples: [{ why: "Read remotely" }],
      handler: async () => ({ default: { run: async ({ app }) => ({ ok: true, data: { endpoint: app.endpoint } }) } }),
    });
  }
  const selected = { ...spec, requires };
  return family.defineCommand(selected, {
    examples: [{ why: "Read offline" }],
    handler: async () => ({ default: { run: async (input) => {
      accepts<{ readonly ctx: typeof input.ctx }>(input);
      accepts<Exclude<keyof typeof input, "ctx"> extends never ? true : false>(true);
      return { ok: true, data: { now: input.ctx.clock.now() } };
    } } }),
  });
}

// Consumer testkit remains runner-neutral and narrows JSON evidence by format.
import { createContractFixtures, expectDisclosureParity, type DisclosureException, type ContractFixtures, type TestRunResult } from "cli-for-agents/testing";
const disclosureExceptions = [{ command: spec.path, extraFields: ["receipt"], rationale: "Temporary compatibility field", deleteWhen: "Consumer reads artifact receipts" }] as const satisfies readonly DisclosureException[];
accepts<ContractFixtures>(createContractFixtures(cli));
contractTests(cli, createContractFixtures(cli));
expectDisclosureParity(cli, disclosureExceptions, []);
runForTest(cli, invocation(command, {}), { host: testHost, format: "json" });
declare const testResult: TestRunResult;
if (testResult.format === "json") accepts<import("cli-for-agents").AnyEnvelope>(testResult.envelope);
accepts<readonly import("cli-for-agents/testing").TestEvent[]>(testResult.events);
accepts<readonly import("cli-for-agents").ArtifactManifest[]>(testResult.artifacts);
