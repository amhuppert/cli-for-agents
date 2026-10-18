import { recoveryFacts } from "cli-for-agents";
/** Ambiguous selections cannot bind handlers through the app:never loophole. */
import { bytes, mutation, type ReadHandler } from "cli-for-agents";
import { family, errors, globalFlags, spec } from "./family-positive.js";
type Unrelated = { readonly accountId: string };

export function ambiguousContext(requires: "remote" | "none") {
  const ambiguous = { ...spec, requires };
  const wrongRead: ReadHandler<typeof ambiguous, Unrelated, typeof errors.definitions, typeof globalFlags> = {
    run: async ({ app }) => ({ ok: true, data: { id: app.accountId } }),
  };
  // @ts-expect-error Union selection must not turn the selected app into never.
  family.defineCommand(ambiguous, { examples: [{ why: "Read" }], handler: async () => ({ default: wrongRead }) });

  const levels = { ...ambiguous, levels: { full: { output: "bounded" } } } as const;
  const wrongLevel: ReadHandler<typeof levels, Unrelated, typeof errors.definitions, typeof globalFlags> = {
    run: async () => ({ ok: true, data: null }),
    levels: { full: async ({ app }) => ({ ok: true, data: { id: app.accountId } }) },
  };
  // @ts-expect-error Level runners share the same single-selection requirement.
  family.defineCommand(levels, { examples: [{ why: "Read" }], handler: async () => ({ default: wrongLevel }) });

  const write = { ...ambiguous, path: "apply", effects: "write", payload: { maxBytes: bytes(100), validatePath: "validate", examples: [{ payload: {}, why: "Example payload" }] } } as const;
  const wrongPrepare = mutation<typeof write, Unrelated, string, typeof errors.definitions, typeof globalFlags>({
    decode: { "~standard": { version: 1, vendor: "fixture", validate: () => { throw new Error("Compile-only decoder"); } } },
  prepare: async ({ app }) => ({ ok: true, value: app.accountId }),
    commit: async () => ({ effect: "applied", result: { ok: true, data: null }, recovery: recoveryFacts([{ kind: "operation", id: "reported-1" }]) }),
  });
  // @ts-expect-error Erased preparation inputs cannot use an ambiguous selection to admit unrelated services.
  family.defineCommand(write, { examples: [{ why: "Apply", file: "request.json" }], handler: async () => ({ default: wrongPrepare }) });

  const wrongCommit = mutation<typeof write, Unrelated, string, typeof errors.definitions, typeof globalFlags>({
    decode: { "~standard": { version: 1, vendor: "fixture", validate: () => { throw new Error("Compile-only decoder"); } } },
  prepare: async () => ({ ok: true, value: "prepared" }),
    commit: async ({ app }) => ({ effect: "applied", result: { ok: true, data: { id: app.accountId } }, recovery: recoveryFacts([{ kind: "operation", id: "reported-1" }]) }),
  });
  // @ts-expect-error Opaque mutation modules retain the guard for commit inputs as well.
  family.defineCommand(write, { examples: [{ why: "Apply", file: "request.json" }], handler: async () => ({ default: wrongCommit }) });

  // @ts-expect-error Even an app-independent implementation cannot declare an ambiguous context contract.
  family.defineCommand(ambiguous, { examples: [{ why: "Read" }], handler: async () => ({ default: { run: async () => ({ ok: true, data: null }) } }) });
}

export function ambiguousAcquiredContexts(requires: "local" | "remote") {
  const ambiguous = { ...spec, requires };
  // @ts-expect-error A declaration selects one context key, including when every branch acquires an app.
  family.defineCommand(ambiguous, { examples: [{ why: "Read" }], handler: async () => ({ default: { run: async () => ({ ok: true, data: null }) } }) });
}
