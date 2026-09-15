import { recoveryFacts } from "cli-for-agents";
/** Positive controls compiled in isolation, before any expected-error fixture can poison a type. */
import type {
  AnyCommitReport, AnyEnvelope, AnyFailure, AnyPayload, AnyResult, AnySuccess,
  CliError, CommitReport, Envelope, Failure, JsonValue, Payload, ReadHandler, Result, Success,
} from "cli-for-agents";

declare function accepts<T>(value: T): void;

// This first comparison reproduced TS2589 with the former default Result alias.
accepts<AnyResult>({ ok: true, data: null });

// DTO interfaces deliberately have no index signature; author-to-framework widening must work.
interface Receipt {
  readonly id: string;
  readonly nested: { readonly title: string };
  readonly labels: readonly string[];
}
declare const receipt: Receipt;
declare const json: JsonValue;
declare const error: CliError;
declare const typedSuccess: Success<Receipt>;
declare const typedFailure: Failure<Receipt>;
declare const typedResult: Result<Receipt>;
declare const typedCommit: CommitReport<Receipt>;
declare const typedPayload: Payload<Receipt>;
declare const typedEnvelope: Envelope<Receipt>;

accepts<AnySuccess>(typedSuccess);
accepts<AnyFailure>(typedFailure);
accepts<AnyResult>(typedResult);
accepts<AnyCommitReport>(typedCommit);
accepts<AnyPayload>(typedPayload);
accepts<AnyEnvelope>(typedEnvelope);
accepts<Result<Receipt>>({ ok: true, data: receipt });

// Each framework data slot must accept the anchored recursive JSON union directly.
accepts<AnySuccess>({ ok: true, data: json });
accepts<AnyFailure>({ ok: false, error, data: json });
accepts<AnyCommitReport>({ effect: "applied", result: { ok: true, data: json }, recovery: recoveryFacts([{ kind: "operation", id: "reported-1" }]) });
accepts<AnyPayload>({ kind: "inline", data: json });

type ReadSpec = {
  readonly path: "status";
  readonly summary: "Read status";
  readonly description: "Returns the current status.";
  readonly effects: "read";
  readonly requires: "app";
  readonly args: readonly [];
  readonly flags: {};
};

// Contextual typing of the common inline handler must not instantiate JsonData<JsonValue>.
export const inlineHandler: ReadHandler<ReadSpec, unknown> = {
  run: async () => ({ ok: true, data: null }),
};
export const dtoHandler: ReadHandler<ReadSpec, unknown> = {
  run: async () => typedResult,
};
