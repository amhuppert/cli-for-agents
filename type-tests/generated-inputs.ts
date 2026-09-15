/** Compile-only probes for generated selectors, payload routes, and lazy bindings. */
import {
  bytes,
  commandsFor,
  defineErrors,
  id,
  invocation,
  mutation,
  validationInvocation,
  type CommandExample,
  type CommandSpec,
  type HandlerContext,
  type HandlerModule,
  type Invocation,
  type MutationHandler,
  type ReadHandler,
  type StandardSchema,
} from "cli-for-agents";
import { createCli, type ContextProvider } from "cli-for-agents/runtime";
import type { App, ClaimInput } from "../examples/notebook/app.js";
import { apply, applySpec, errors, family, show, showSpec } from "../examples/notebook/commands.js";

declare function accepts<T>(value: T): void;

const payloadInput = { args: {}, flags: {}, file: ".cache/claims.json" };
accepts<Invocation<"write", "claim apply">>(invocation(apply, payloadInput));
accepts<Invocation<"read", "claim validate">>(validationInvocation(apply, payloadInput));
// @ts-expect-error The validation twin is read-only, even though its owner mutates.
accepts<Invocation<"write">>(validationInvocation(apply, payloadInput));
// @ts-expect-error Payload mutations require the generated file input.
invocation(apply, { args: {}, flags: {} });
// @ts-expect-error The validation twin requires the same file as its mutation.
validationInvocation(apply, { args: {}, flags: {} });
// @ts-expect-error Structured payloads are files, not inline objects.
invocation(apply, { args: {}, flags: {}, file: { nodeId: "node-1" } });
// @ts-expect-error File input is generated top-level data, not a domain flag.
invocation(apply, { args: {}, flags: { file: ".cache/claims.json" } });
// @ts-expect-error Mutation examples must teach the generated file input too.
accepts<CommandExample<typeof applySpec>>({ why: "Apply claims", args: {}, flags: {} });
accepts<CommandExample<typeof applySpec>>({ why: "Apply claims", ...payloadInput });

declare const mutationContext: HandlerContext<typeof applySpec>;
declare const schema: StandardSchema<ClaimInput>;
// @ts-expect-error Payload decoding belongs to the lazy module, never the handler context.
mutationContext.payload(schema);

const define = commandsFor<{ app: App }>()({ errors: defineErrors({}), globalFlags: {} }).defineCommand;
const boundedSpec = {
  ...showSpec,
  path: "node inspect",
  levels: {
    detail: { output: "bounded" },
    full: { output: "artifact-eligible" },
  },
} as const satisfies CommandSpec;
declare const boundedModule: HandlerModule<typeof boundedSpec, App, {}>;
const inspect = define(boundedSpec, {
  examples: [{ why: "Inspect a node", args: { id: "node-1" }, flags: {} }],
  handler: async () => boundedModule,
});
const nodeInput = { args: { id: id("node", "node-1") }, flags: {} };
invocation(inspect, nodeInput);
invocation(inspect, { ...nodeInput, level: "detail" });
invocation(inspect, { ...nodeInput, level: "full" });
invocation(inspect, { ...nodeInput, level: "full", out: ".cache/body.json" });
// @ts-expect-error Only declared disclosure levels are available.
invocation(inspect, { ...nodeInput, level: "everything" });
// @ts-expect-error Bounded detail cannot be forced into an artifact.
invocation(inspect, { ...nodeInput, level: "detail", out: ".cache/body.json" });
// @ts-expect-error The default bounded result cannot accept --out.
invocation(inspect, { ...nodeInput, out: ".cache/body.json" });
const invalidLevelVariable = { ...nodeInput, level: "everything" } as const;
// @ts-expect-error Storing a selector in a variable does not bypass its inventory.
invocation(inspect, invalidLevelVariable);
// @ts-expect-error Generated selectors are not domain flags.
invocation(inspect, { ...nodeInput, flags: { full: true } });
accepts<CommandExample<typeof boundedSpec>>({ why: "Read the body", args: { id: "node-1" }, flags: {}, level: "full", out: ".cache/body.json" });
// @ts-expect-error Examples enforce the same eligibility rules as invocations.
accepts<CommandExample<typeof boundedSpec>>({ why: "Read detail", args: { id: "node-1" }, flags: {}, level: "detail", out: ".cache/body.json" });

const doctorSpec = {
  path: "doctor",
  summary: "Diagnose connectivity",
  description: "Reports connection state without changing it.",
  effects: "read", requires: "app",
  args: [],
  flags: {},
} as const satisfies CommandSpec;
declare const doctorModule: HandlerModule<typeof doctorSpec, App, {}>;
const doctor = define(doctorSpec, {
  examples: [{ why: "Diagnose a connection failure", args: {}, flags: {} }],
  handler: async () => doctorModule,
});
const doctorInput = { args: {}, flags: {} };
const recovery = invocation(doctor, doctorInput);
// @ts-expect-error Plain reads have no generated file input.
invocation(doctor, { ...doctorInput, file: ".cache/claims.json" });
// @ts-expect-error Plain reads have no inline structured payload channel.
invocation(doctor, { ...doctorInput, payload: { mode: "all" } });
// @ts-expect-error Plain reads do not acquire a validation twin.
validationInvocation(doctor, doctorInput);
// @ts-expect-error Plain reads have no generated disclosure selector.
invocation(doctor, { ...doctorInput, level: "full" });
declare const doctorContext: HandlerContext<typeof doctorSpec>;
// @ts-expect-error A read handler cannot decode an undeclared payload file.
doctorContext.payload(schema);

const connectionErrors = defineErrors({
  OFFLINE: { exitClass: "connection", description: "The service is unreachable." },
  DENIED: { exitClass: "failed", description: "The request was refused." },
});
connectionErrors.error("OFFLINE", { message: "Service unavailable" });
connectionErrors.error("OFFLINE", { message: "Service unavailable", continuation: invocation(show, nodeInput) });
connectionErrors.error("DENIED", { message: "Request denied" });
// @ts-expect-error Doctor recovery is attached centrally, never supplied by a handler.
connectionErrors.error("OFFLINE", { message: "Service unavailable", recovery });
// @ts-expect-error A continuation must be read-only.
connectionErrors.error("OFFLINE", { message: "Service unavailable", continuation: invocation(apply, payloadInput) });
// @ts-expect-error Legacy recovery cannot be attached to another class either.
connectionErrors.error("DENIED", { message: "Request denied", recovery });

declare const application: ContextProvider<App, {}, keyof typeof errors.definitions>;
const baseCli = {
  name: "notebook", version: "0.0.0", family,
  commands: [show, apply, doctor], doctor: recovery, contexts: { app: application },
  output: { maxBytes: bytes(60_000), artifacts: { directory: ".cache/out", forbiddenRoots: ["data"] } },
};
createCli(baseCli);
const connectedFamily = commandsFor<{ app: App }>()({ errors: connectionErrors, globalFlags: {} });
declare const connectedProvider: ContextProvider<App, {}, keyof typeof connectionErrors.definitions>;
const connectedDoctorSpec = { ...doctorSpec, path: "diagnostics doctor", requires: "none" } as const;
const connectedDoctor = connectedFamily.defineCommand(connectedDoctorSpec, {
  examples: [{ why: "Diagnose" }],
  handler: async () => ({ default: { run: async () => ({ ok: true, data: null }) } }),
});
const connectedBase = { ...baseCli, family: connectedFamily, commands: [connectedDoctor], contexts: { app: connectedProvider } };
createCli({ ...connectedBase, doctor: invocation(connectedDoctor, {}) });
const { doctor: omittedDoctor, ...withoutDoctor } = connectedBase;
void omittedDoctor;
// @ts-expect-error Every CLI registers a central doctor, including for kernel connection failures.
createCli(withoutDoctor);
// @ts-expect-error A write invocation cannot serve as doctor.
createCli({ ...connectedBase, doctor: invocation(apply, payloadInput) });

declare const widenedApplication: ContextProvider<object, {}, keyof typeof errors.definitions>;
const widenedOptions = { ...baseCli, contexts: { app: widenedApplication } };
// @ts-expect-error Widening provider state cannot erase the handlers' required services.
createCli(widenedOptions);
declare const unrelatedApplication: ContextProvider<{ readonly accountId: string }, {}, keyof typeof errors.definitions>;
// @ts-expect-error A provider of unrelated state cannot satisfy the notebook handlers.
createCli({ ...baseCli, contexts: { app: unrelatedApplication } });

declare const readRunner: ReadHandler<typeof boundedSpec, App, {}>["run"];
accepts<ReadHandler<typeof boundedSpec, App, {}>>({ run: readRunner, levels: { detail: readRunner, full: readRunner } });
const incompleteLevels = { run: readRunner, levels: { full: readRunner } };
// @ts-expect-error Adding detail to the declaration requires a detail runner.
accepts<ReadHandler<typeof boundedSpec, App, {}>>(incompleteLevels);
const incompleteBinding = {
  examples: [{ why: "Inspect a node", args: { id: "node-1" }, flags: {} }] as const,
  handler: async () => ({ default: incompleteLevels }),
};
// @ts-expect-error Exhaustive level checking also applies at the lazy-module boundary.
define(boundedSpec, incompleteBinding);

declare const prepare: MutationHandler<typeof applySpec, App, ClaimInput, typeof errors.definitions>["prepare"];
declare const commit: MutationHandler<typeof applySpec, App, ClaimInput, typeof errors.definitions>["commit"];
mutation<typeof applySpec, App, ClaimInput, typeof errors.definitions>({ decode: schema, prepare, commit });
// @ts-expect-error Mutation modules must define their commit phase.
mutation<typeof applySpec, App, ClaimInput, typeof errors.definitions>({ prepare });
// @ts-expect-error A commit function alone cannot skip preparation.
mutation<typeof applySpec, App, ClaimInput, typeof errors.definitions>({ commit });
