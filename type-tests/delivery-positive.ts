/** Isolated positive host/lifetime/help/reference and finite binary boundaries. */
import { binaryArtifact, invocation, type AnyBinaryArtifactRequest, type AnyResult, type Result, type HandlerInput, type HelpSection, type KernelCode, runner } from "cli-for-agents";
import { createCli, runCli, nodeHost, helpNode, commandReference, validateReferences, writeCommandReference, type Host, type ContextProvider, type GuidanceProvider, type ReferenceHost, type HelpNode, type ResolvedRunRequest } from "cli-for-agents/runtime";
import { execute, type PostOperationHook, type CompletedExecution } from "../src/internal/execution.js";
import { captureArtifactPolicy } from "../src/internal/artifacts.js";
import type { ParsedInvocation } from "../src/internal/registry.js";
import { family, readSpec, read } from "./runner-positive.js";
declare function accepts<T>(value: T): void;
interface Summary { readonly entries: number }
const request = binaryArtifact<Summary>({ bytes: new Uint8Array([0, 255]), mediaType: "application/octet-stream", basename: "export.bin", summary: { entries: 2 } });
accepts<AnyBinaryArtifactRequest>(request);
accepts<AnyResult>({ ok: true, binary: request });
accepts<Result<Summary>>({ ok: true, binary: request });
const binarySpec = { ...readSpec, path: "export", output: "binary" } as const;
const command = family.defineCommand(binarySpec, { examples: [{ why: "Export", out: "export.bin" }], handler: async () => ({ default: {
  run: runner<HandlerInput<typeof binarySpec, never, {}>, Summary, never>({ run: async () => ({ ok: true, binary: request }), text: summary => String(summary.entries) }),
  levels: { full: async () => ({ ok: true, binary: request }) },
} }) });
invocation(command, { out: "export.bin" });
const doctor = family.defineCommand(readSpec, { examples: [{ why: "Read" }], handler: async () => ({ default: read }) });
const cli = createCli({ name: "example", version: "0", family, commands: [command, doctor], contexts: {}, doctor: invocation(doctor, {}), documentation: { directory: "docs" }, output: { artifacts: { resolve: async ({ env }) => ({ directory: env["ARTIFACTS"] ?? "/configured/artifacts", forbiddenRoots: ["/data"] }) } } });
const signal = new AbortController().signal;
runCli(cli, { argv: [], env: {}, signal });
nodeHost().then(host => runCli(cli, { argv: [], env: {}, signal, host }));
accepts<HelpNode>(helpNode(cli, "read"));
accepts<string>(commandReference(cli));
declare const referenceHost: ReferenceHost;
validateReferences(cli, { host: referenceHost, signal });
validateReferences(cli, { host: async () => referenceHost, signal });
writeCommandReference(cli, { host: referenceHost, signal, path: "docs/commands.md", marker: "CLI", mode: "check" });
accepts<HelpSection>({ kind: "list", title: "Examples", items: ["Read a record"] });
accepts<ContextProvider<{ readonly name: string }>>(async () => ({ ok: true, app: { name: "resource-free" } }));
accepts<ContextProvider<{ readonly name: string }>>(async () => ({ ok: true, app: { name: "resource" }, release: () => {} }));
type Contexts = { remote: { readonly endpoint: string } };
const guidance: GuidanceProvider<Contexts> = async input => {
  if (input.requires === "remote") accepts<string>(input.app.endpoint);
  else accepts<undefined>(input.app);
  throw new Error("Compile-only provider");
};
void guidance;
const hook: PostOperationHook<Contexts> = async ({ requires, app, outcome }) => {
  if (requires === "remote") accepts<string>(app.endpoint);
  accepts<AnyResult>(outcome.result);
  // The hook captures an app-free policy; delivery prepares its directory later.
  return { artifacts: captureArtifactPolicy({ directory: "/configured", forbiddenRoots: [] }), issues: [] };
};
declare const parsed: ParsedInvocation<Contexts, KernelCode>;
declare const resolved: ResolvedRunRequest;
declare const host: Host;
accepts<Promise<CompletedExecution>>(execute<Contexts, {}, {}>(parsed, resolved, { remote: async () => ({ ok: true, app: { endpoint: "https://example.com" }, release: async () => {} }) }, hook));
accepts<Promise<"file" | "directory" | "missing">>(host.files.kind("docs/skill.md"));

// Production composition has distinct assembly and byte-bounded delivery stages.
import { assembleResponse, type ArbitratedGuidance, type AssembledResponse } from "../src/internal/response.js";
import { deliver, validateOutputBudget } from "../src/internal/artifacts.js";
import type { ExecutionResult, PostOperationFacts } from "../src/internal/execution.js";
import type { RunResult } from "cli-for-agents/runtime";
import type { EvaluatedGuidance, GuidanceConflict, Instruction, GuidanceProvenance } from "cli-for-agents/guidance";
declare const execution: ExecutionResult;
declare const arbitrated: ArbitratedGuidance;
const assembled = assembleResponse(execution, { guidance: arbitrated, doctor: invocation(doctor, {}), executable: "example", secondary: [] });
accepts<Promise<AssembledResponse>>(assembled);
accepts<Promise<RunResult>>(assembled.then(response => deliver(response, { format: "json", budget: validateOutputBudget(), host, signal })));
// A deferred policy failure must not erase an earlier valid required candidate batch.
declare const batch: EvaluatedGuidance;
accepts<PostOperationFacts>({ guidance: batch, issues: [], artifacts: { ok: false, failure: { code: "KERNEL_OUTPUT", message: "Artifact policy could not be collected." } } });
accepts<CompletedExecution>({ execution, secondary: [], postOperation: "failed", facts: { guidance: batch, issues: [] } });
declare const instructionValue: Instruction;
declare const provenance: GuidanceProvenance;
accepts<GuidanceConflict>({ instructions: [
  { instruction: instructionValue, provenance: { kind: "handler", ownerId: "handler-policy" } },
  { instruction: instructionValue, provenance: { ...provenance, kind: "rule" } },
] });
