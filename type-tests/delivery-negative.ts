import { binaryArtifact, type AnyResult, type Result, type AnyBinaryArtifactRequest, type HelpSection } from "cli-for-agents";
import type { PostOperationContext, ResolvedRunRequest, RunRequest, ReferenceOptions } from "cli-for-agents/runtime";
import { execute, type PostOperationFacts } from "../src/internal/execution.js";
import type { ParsedInvocation } from "../src/internal/registry.js";
declare function accepts<T>(value: T): void;
// @ts-expect-error Finite byte requests require media type.
binaryArtifact({ bytes: new Uint8Array(), basename: "x.bin", summary: null });
// @ts-expect-error Finite byte requests require basename.
binaryArtifact({ bytes: new Uint8Array(), mediaType: "image/png", summary: null });
// @ts-expect-error Finite byte requests require JSON summary.
binaryArtifact({ bytes: new Uint8Array(), mediaType: "image/png", basename: "x.png" });
// @ts-expect-error Streaming sources are outside this milestone.
binaryArtifact({ bytes: new ReadableStream(), mediaType: "image/png", basename: "x.png", summary: null });
// @ts-expect-error Summary is JSON, not a function.
binaryArtifact<{ callback: () => void }>({ bytes: new Uint8Array(), mediaType: "image/png", basename: "x.png", summary: { callback: () => {} } });
declare const request: AnyBinaryArtifactRequest;
// @ts-expect-error Binary requests are not JSON DTO data.
accepts<AnyResult>({ ok: true, data: request });
// @ts-expect-error A result has one source of summary/data, never both.
accepts<AnyResult>({ ok: true, data: null, binary: request });
// @ts-expect-error Arbitrary binary summaries cannot satisfy a particular renderer's DTO.
accepts<Result<{ readonly entries: number }>>({ ok: true, binary: request });
// @ts-expect-error Branded requests must be created through the validated constructor.
accepts<AnyBinaryArtifactRequest>({ bytes: new Uint8Array(), mediaType: "image/png", basename: "x.png", summary: null });
// @ts-expect-error Static help sections require a title.
accepts<HelpSection>({ kind: "list", items: ["x"] });
// @ts-expect-error A structured section cannot mix paragraph/list bodies.
accepts<HelpSection>({ kind: "paragraphs", title: "Title", items: ["x"] });
declare const none: Extract<PostOperationContext<{ remote: { endpoint: string } }>, { requires: "none" }>;
// @ts-expect-error None contexts do not provide an app to post-operation work.
none.app.endpoint;
// @ts-expect-error The hook must retain a captured app-free policy, not an app resolver.
accepts<PostOperationFacts>({ issues: [], artifacts: { resolve: async () => ({ directory: "/tmp", forbiddenRoots: [] }) } });
declare const parsed: ParsedInvocation<{}>;
declare const resolved: ResolvedRunRequest;
// @ts-expect-error Execution requires its caller-supplied post-operation hook.
execute(parsed, resolved, {});
declare const unresolved: RunRequest;
// @ts-expect-error The private execute seam cannot use an unresolved default host.
accepts<ResolvedRunRequest>(unresolved);
// @ts-expect-error Reference validation host cannot be a transport/process handle.
accepts<ReferenceOptions>({ signal: new AbortController().signal, host: { stdout: () => {} } });

import { assembleResponse, type AssembledResponse } from "../src/internal/response.js";
import { deliver } from "../src/internal/artifacts.js";
import type { ExecutionResult } from "../src/internal/execution.js";
import type { RunResult } from "cli-for-agents/runtime";
import type { GuidanceConflict, Instruction } from "cli-for-agents/guidance";
import { bytes } from "cli-for-agents";
declare const assembled: AssembledResponse;
// @ts-expect-error Assembly has not proved the final serialized byte bound.
accepts<RunResult>(assembled);
declare const execution: ExecutionResult;
// @ts-expect-error Delivery accepts assembled responses, not unassembled operation reports.
deliver(execution, { format: "json", budget: bytes(32768), host: resolved.host, signal: resolved.signal });
// @ts-expect-error Assembly cannot receive a process/output host or artifact policy.
assembleResponse(execution, { host: resolved.host });
declare const instructionValue: Instruction;
// @ts-expect-error Conflict entries must retain competing provenance, not only text/owner instructions.
accepts<GuidanceConflict>({ instructions: [instructionValue, instructionValue] });
