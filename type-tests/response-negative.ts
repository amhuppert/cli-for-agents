import { recoveryFacts, type AnyCommitReport, type OperationOutcome, type AnyEnvelope, type UnknownAcknowledgment, type ReportedRecovery, type ResponseError, type CliError } from "cli-for-agents";
import { evaluateGuidance, type EvaluatedGuidance, type HandlerGuidance } from "cli-for-agents/guidance";
import { arbitrate } from "../src/internal/response.js";
import { family, readSpec, read } from "./runner-positive.js";
declare function accepts<T>(value: T): void;
declare const error: CliError;
declare const connection: CliError<"OFFLINE", "connection">;
const recovery = recoveryFacts([{ kind: "operation", id: "real-id" }]);
// @ts-expect-error Unknown acknowledgement cannot be reported as success.
accepts<AnyCommitReport>({ effect: "unknown", recovery, result: { ok: true, data: null } });
// @ts-expect-error Not-applied cannot be reported as success.
accepts<AnyCommitReport>({ effect: "not_applied", result: { ok: true, data: null } });
// @ts-expect-error Applied reports require bounded recovery.
accepts<AnyCommitReport>({ effect: "applied", result: { ok: true, data: null } });
// @ts-expect-error Reads do not carry write recovery facts.
accepts<OperationOutcome>({ operation: { effect: "read", recovery }, result: { ok: true, data: null } });
// @ts-expect-error Runtime outcomes enforce success/effect correlation too.
accepts<OperationOutcome>({ operation: { effect: "unknown", recovery }, result: { ok: true, data: null } });
// @ts-expect-error Connection response requires the centrally registered doctor.
accepts<ResponseError<"OFFLINE", "connection">>({ ...connection, why: "Offline", secondary: [] });
// @ts-expect-error Only kernel codes can classify secondary failures.
accepts<ResponseError>({ ...error, why: "Denied", secondary: [{ code: "DOMAIN_REPLACEMENT", message: "Wrong" }] });
// @ts-expect-error Unvalidated recovery cannot be forged.
accepts<ReportedRecovery>({ kind: "reported", references: [{ kind: "operation", id: "x" }] });
// @ts-expect-error Unknown acknowledgement is private runtime provenance.
accepts<UnknownAcknowledgment>({ kind: "unknown_acknowledgment", commandPath: "write", advice: "inspect_before_retry" });
// @ts-expect-error Compact recovery requires at least one actual app-reported reference.
recoveryFacts([]);
declare const envelope: Extract<AnyEnvelope, { ok: true }>;
// @ts-expect-error Successful response cannot contain failure rationale.
accepts<AnyEnvelope>({ ...envelope, why: "Wrong" });
declare const failure: Extract<AnyEnvelope, { ok: false }>;
// @ts-expect-error Failure diagnostics only appear under error.issues.
accepts<AnyEnvelope>({ ...failure, issues: [] });
const command = family.defineCommand(readSpec, { examples: [{ why: "Read" }], handler: async () => ({ default: read }) });
declare const handler: HandlerGuidance;
// @ts-expect-error Candidate evaluation cannot accept handler guidance to arbitrate.
evaluateGuidance({ command, state: {}, handler });
declare const batch: EvaluatedGuidance;
// @ts-expect-error Evaluations no longer expose selected final guidance.
batch.guidance;
// @ts-expect-error A candidate batch cannot be returned as handler guidance.
accepts<HandlerGuidance>(batch);
// @ts-expect-error The single response arbiter requires observable conflicts.
arbitrate({ commandPath: "read", handler, evaluated: batch });
