/** Positive-only: official Standard Schema v1 values and Zod schemas need no adapter. */
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { z } from "zod";
import { bytes, commandsFor, defineErrors, mutation, payloadRead, recoveryFacts, type CommandSpec, type StandardSchema } from "cli-for-agents";

declare function accepts<T>(value: T): void;
type Unit = { unit: string };
type Validate<T> = StandardSchema<T>["~standard"]["validate"];

// Each result shape is assigned separately, so fixing one cannot conceal another.
declare const success: StandardSchemaV1.SuccessResult<Unit>;
accepts<Validate<Unit>>(() => success);
accepts<Validate<Unit>>(() => ({ value: { unit: "m" }, issues: undefined }));
declare const failure: StandardSchemaV1.FailureResult;
accepts<Validate<Unit>>(() => failure);
accepts<Validate<Unit>>(() => ({ issues: [{ message: "Unit is required", path: undefined }] }));
accepts<Validate<Unit>>(() => ({ issues: [{ message: "Unit is invalid", path: ["records", 0, Symbol.for("unit"), { key: "unit" }, { key: 1 }] }] }));
accepts<Validate<Unit>>(async () => success);
accepts<Validate<Unit>>(async () => failure);

declare const official: StandardSchemaV1<unknown, Unit>;
accepts<StandardSchema<Unit>>(official);
declare const transformed: StandardSchemaV1<{ readonly unit: number }, Unit>;
accepts<StandardSchema<Unit>>(transformed);

const unit = z.object({ unit: z.string() });
accepts<StandardSchema<Unit>>(unit);
accepts<StandardSchema<{ count: number }>>(z.object({ count: z.string().transform(Number) }));
accepts<StandardSchema<Unit>>(unit.refine(async value => value.unit.length > 0));

const family = commandsFor()({ errors: defineErrors({}), globalFlags: {} });
const readSpec = { path: "units check", summary: "Check units", description: "Check a unit payload.", requires: "none", effects: "read", args: [], flags: {}, payload: { maxBytes: bytes(1024) } } as const satisfies CommandSpec;
family.defineCommand(readSpec, { examples: [{ file: "unit.json", why: "Check a unit" }], handler: async () => ({ default: payloadRead({
  decode: unit, run: async ({ payload }) => ({ ok: true, data: { unit: payload.unit } }),
}) }) });
const writeSpec = { path: "units save", summary: "Save units", description: "Save a unit payload.", requires: "none", effects: "write", args: [], flags: {}, payload: { maxBytes: bytes(1024), validatePath: "units save-check" } } as const satisfies CommandSpec;
family.defineCommand(writeSpec, { examples: [{ file: "unit.json", why: "Save a unit" }], handler: async () => ({ default: mutation({
  decode: unit, prepare: async ({ payload }) => ({ ok: true, value: payload.unit }),
  commit: async ({ prepared }) => ({ effect: "applied", recovery: recoveryFacts([{ kind: "unit", id: prepared.value }]), result: { ok: true, data: {} } }),
}) }) });
