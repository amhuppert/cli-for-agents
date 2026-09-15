import { inheritedCases } from "./contracts.js";
import type { ContractFixtures } from "./contracts.js";
import { createContractFixtures } from "./fixtures.js";
export { createContractFixtures } from "./fixtures.js";
export { expectDisclosureParity } from "./contracts.js";
export type { ContractCaseName, ContractEvidence, ContractFixtures, JsonTestRun, DisclosureException, DisclosureParity } from "./contracts.js";
import { captureHost } from "../internal/test-host-capture.js";
import type { Command, CommandSpec, Invocation } from "../commands.js";
import type { ArtifactManifest } from "../disclosure.js";
import type { Brand } from "../internal/brand.js";
import { makeTestHost } from "../internal/test-host.js";
import { cliConfiguration, cliRegistry, commandCli, checkMembership, validateInvocation, resolve } from "../internal/registry.js";
import { invocationArgv } from "../internal/invocations.js";
import { observeRun } from "../internal/test-observation.js";
import type { Observation } from "../internal/test-observation.js";
import { createCli, runCli, decodeEnvelope } from "../runtime/index.js";
import type { GuidanceEvent } from "../guidance/index.js";
import type { AnyEnvelope } from "../results.js";
import type { Cli, Environment, Host, RunResult } from "../runtime/index.js";
import type { Bytes, Milliseconds } from "../values.js";

/** Runner-neutral tests: applications keep their real domain services when useful. */
export type ContractCase = { readonly name: string; readonly run: () => Promise<void> };
export type HostCall =
  | { readonly kind: "read" | "write" | "canonicalPath" | "kind" | "retention-list" | "retention-remove"; readonly path: string }
  | { readonly kind: "stdin" | "sha256" | "clock" }
  | { readonly kind: "sleep"; readonly duration: Milliseconds };
export type TestHost = Host & Brand<"TestHost"> & {
  readonly calls: readonly HostCall[];
  readonly filesSnapshot: () => Readonly<Record<string, Uint8Array>>;
  readonly advance: (duration: Milliseconds) => void;
};
export function createTestHost(options?: {
  readonly files?: Readonly<Record<string, string | Uint8Array>>;
  readonly stdin?: string;
  readonly now?: number;
}): TestHost { return makeTestHost(options); }

export type TestEvent = GuidanceEvent
  | { readonly type: "handler.load" | "context.acquire" | "context.release"; readonly commandPath: string }
  | { readonly type: "guidance.arbitrate" };

/** Raw output plus decoded evidence; JSON envelopes exist only in JSON runs. */
export type TestRunResult = RunResult & {
  readonly artifacts: readonly ArtifactManifest[];
  readonly calls: readonly HostCall[];
  readonly events: readonly TestEvent[];
} & (
  | { readonly format: "json"; readonly envelope: AnyEnvelope }
  | { readonly format: "text"; readonly envelope?: never }
);
export type TestRunOptions<Contexts> = {
  /** Omit to keep real providers/services. Overrides are invocation-local. */
  readonly contexts?: NoInfer<Contexts>;
  /** Accept real or in-memory capabilities; runForTest captures calls per invocation. */
  readonly host: Host;
  readonly env?: Environment;
  readonly format: "text" | "json";
};
export async function runForTest<Contexts>(cli: Cli<Contexts>, input: readonly string[] | Invocation,
  options: TestRunOptions<Contexts>): Promise<TestRunResult> {
  const configuration = cliConfiguration(cli);
  const registry = cliRegistry(cli);
  let tokens: readonly string[];
  if (Array.isArray(input)) tokens = input;
  else {
    const reference = input as Invocation;
    validateInvocation(registry, reference);
    tokens = invocationArgv(reference);
  }
  if (options.format !== "text" && options.format !== "json") throw new TypeError("Invalid test format.");
  const initial = resolve(registry, tokens);
  const initialJson = initial.kind === "leaf" ? initial.invocation.json : initial.json;
  const argv = initialJson === (options.format === "json") ? [...tokens] : [`--json=${options.format === "json"}`, ...tokens];
  const resolution = resolve(registry, argv);
  const json = resolution.kind === "leaf" ? resolution.invocation.json : resolution.json;
  if (json !== (options.format === "json")) throw new TypeError("Input conflicts with test format.");
  let selected = cli;
  if (options.contexts !== undefined) {
    const supplied = options.contexts;
    const keys = Object.keys(configuration.contexts);
    if (!supplied || keys.some(key => !Object.hasOwn(supplied, key))
      || Object.keys(supplied).some(key => !keys.includes(key))) throw new TypeError("Test contexts must match the CLI context keys.");
    // Provider keys and concrete values are checked above; preserve the bound map.
    const contexts: { -readonly [K in keyof Contexts]-?: (typeof configuration.contexts)[K] } = { ...configuration.contexts };
    for (const key of keys as (keyof Contexts)[]) {
      contexts[key] = async () => ({ ok: true, app: supplied[key] });
    }
    selected = createCli({ ...configuration, contexts });
  }
  const controller = new AbortController();
  const observation: Observation = { events: [] };
  const stop = observeRun(controller.signal, observation);
  const calls: HostCall[] = [];
  const host = captureHost(options.host, calls);
  try {
    const result = await runCli(selected, { argv, env: options.env ?? {}, host, signal: controller.signal });
    const delivered = observation.envelope;
    if (!delivered) throw new Error("Runtime did not capture delivery evidence.");
    const evidence = { ...result,
      artifacts: Object.freeze(delivered.payload?.kind === "artifact" ? [delivered.payload.artifact] : []),
      calls: Object.freeze([...calls]), events: Object.freeze([...observation.events]) };
    return options.format === "json"
      ? Object.freeze({ ...evidence, format: "json", envelope: decodeEnvelope(JSON.parse(result.stdout)) })
      : Object.freeze({ ...evidence, format: "text" });
  } finally { stop(); }
}

/** Runner-neutral checks; supply all scenarios to test a consumer's own paths. */
export function contractTests<Contexts>(cli: Cli<Contexts>, fixtures: ContractFixtures = createContractFixtures(cli)): readonly ContractCase[] {
  return inheritedCases(cli, fixtures);
}
export function expectBounded(result: RunResult, budget: Bytes): void {
  if (!Number.isSafeInteger(budget) || budget < 0) throw new TypeError("Invalid byte bound.");
  const encoder = new TextEncoder();
  const measured = encoder.encode(result.stdout).byteLength + encoder.encode(result.stderr).byteLength;
  if (measured > budget) throw new Error(`Output exceeds byte bound: ${measured} > ${budget}.`);
}
/** Checks help/version/catalog/parse refusals through the registered CLI. Pass cli
 * explicitly when the same command belongs to several registries. Declaration
 * import graphs are checked separately by distribution guards. */
export async function expectLazy<Contexts>(command: Command<CommandSpec, Contexts>, cli: Cli<Contexts> = commandCli(command)): Promise<void> {
  checkMembership(cliRegistry(cli), command);
  // The declaration name grammar rejects !, so this probe cannot execute a leaf.
  const path = command.spec.path.split(" ");
  for (const argv of [[...path, "--help"], ["--version"], ["exit-codes"], [...path, "--!testkit-invalid"]]) {
    const result = await runForTest(cli, argv, { host: createTestHost(), format: "json" });
    if (result.events.some(event => event.type === "handler.load" || event.type === "context.acquire")) throw new Error("Offline path evaluated a lazy handler/context.");
    if (result.exitCode !== (argv.includes("--!testkit-invalid") ? 2 : 0)) throw new Error("Offline path returned an unexpected exit code.");
  }
}
