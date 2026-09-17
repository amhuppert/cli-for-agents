import { runner, writeRunner, recoveryFacts, type JsonData, type JsonValue } from "cli-for-agents";

declare function accepts<T>(value: T): void;
declare const json: JsonValue;
accepts<JsonData<JsonValue>>(json);
declare const projected: JsonData<JsonValue>;
accepts<JsonValue>(projected);

interface Report { readonly id: string; readonly extras: Record<string, JsonValue> }
declare const report: Report;
const text = (data: JsonData<Report>): string => `${data.id}: ${JSON.stringify(data.extras)}`;
runner<void, Report>({ run: async () => ({ ok: true, data: report }), text });
writeRunner<void, Report>({
  run: async () => ({ effect: "applied", recovery: recoveryFacts([{ kind: "report", id: report.id }]), result: { ok: true, data: report } }),
  text,
});

// JSON fields stay opaque; a DTO outside JSON still loses non-JSON values.
type UnknownStaysRejected = JsonData<unknown> extends never ? true : false;
type BigintStaysRejected = JsonData<bigint> extends never ? true : false;
accepts<UnknownStaysRejected>(true);
accepts<BigintStaysRejected>(true);
