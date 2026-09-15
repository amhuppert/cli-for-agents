import { recoveryFacts } from "cli-for-agents";
import { runner, writeRunner, mutation, payloadRead, validationInvocation, type AnyEnvelope, type Prepared, type HandlerInput, type CommandSpec } from "cli-for-agents";
import { family, readSpec, scalar, read, schema, payloadSpec, payloadCommand, mutationSpec, mutator } from "./runner-positive.js";
// @ts-expect-error Job effects have no contract in this milestone.
const job: CommandSpec = { ...scalar, effects: "job" };
void job;
// @ts-expect-error A payload read cannot bind an ordinary read lacking its mandatory decoder.
family.defineCommand(payloadSpec, { examples: [{ why: "Read", file: "-" }], handler: async () => ({ default: read }) });
// @ts-expect-error Payload reads do not generate validation twins.
validationInvocation(payloadCommand, { file: "-" });
// @ts-expect-error A scalar write cannot bind a preparation module.
family.defineCommand(scalar, { examples: [{ why: "Write" }], handler: async () => ({ default: mutator }) });
// @ts-expect-error Payload writes require prepare/commit, not a direct read runner.
family.defineCommand(mutationSpec, { examples: [{ why: "Write", file: "-" }], handler: async () => ({ default: read }) });
// @ts-expect-error The module decoder cannot be omitted.
payloadRead<typeof payloadSpec, never, string, {}>({ run: async () => ({ ok: true, data: null }), levels: { full: async () => ({ ok: true, data: null }) } });
// @ts-expect-error Mutation decoder cannot be omitted even when prepare and commit exist.
mutation<typeof mutationSpec, never, string, {}>({ prepare: async () => ({ ok: true, value: "x" }), commit: async () => ({ effect: "applied", result: { ok: true, data: null }, recovery: recoveryFacts([{ kind: "operation", id: "reported-1" }]) }) });
// @ts-expect-error Scalar writes have no preparation/twin contract.
mutation<typeof scalar, never, string, {}>({ decode: schema, prepare: async () => ({ ok: true, value: "x" }), commit: async () => ({ effect: "applied", result: { ok: true, data: null }, recovery: recoveryFacts([{ kind: "operation", id: "reported-1" }]) }) });
declare const envelope: AnyEnvelope;
// @ts-expect-error A renderer cannot return an envelope.
runner<unknown, string>({ run: async () => ({ ok: true, data: "x" }), text: () => envelope });
// @ts-expect-error Renderer data is coupled to its runner, not another level's DTO.
runner<unknown, { readonly count: number }>({ run: async () => ({ ok: true, data: { count: 1 } }), text: (data: { readonly names: string[] }) => data.names.join() });
// @ts-expect-error Write renderer cannot return a process handle.
writeRunner<unknown, string>({ run: async () => ({ effect: "applied", result: { ok: true, data: "x" }, recovery: recoveryFacts([{ kind: "operation", id: "reported-1" }]) }), text: () => ({ stdout: () => {} }) });
declare const ctx: HandlerInput<typeof readSpec, never, {}>;
// @ts-expect-error Renderer/handler input has no process handle.
ctx.ctx.host.stdout;
// @ts-expect-error Preparation tokens cannot be constructed by applications.
const forged: Prepared<"write", string> = { value: "x", payloadHash: "hash" };
void forged;
declare const other: Prepared<"other", string>;
// @ts-expect-error A prepared token retains its registered command scope.
const crossCommand: Prepared<"write", string> = other;
void crossCommand;
