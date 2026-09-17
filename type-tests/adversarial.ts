/** Compile-only contract probes; none of these examples execute the runtime stubs. */
import {
  bytes,
  count,
  commandsFor,
  defineErrors,
  id,
  invocation,
  page,
  type CommandSpec,
  type Flag,
  type HandlerModule,
  type Id,
  type Omission,
  type Prepared,
  type AnyResult,
} from "cli-for-agents";
import {
  defineReminderRule,
  evaluateGuidance,
  hint,
  instruction,
  type HandlerGuidance,
} from "cli-for-agents/guidance";
import { createTestHost, expectBounded } from "cli-for-agents/testing";
import type { RunResult } from "cli-for-agents/runtime";

declare function accepts<T>(value: T): void;

type App = { readonly account: string };
const define = commandsFor<{ app: App }>()({ errors: defineErrors({}), globalFlags: {} }).defineCommand;
const readSpec = {
  path: "tickets get",
  summary: "Read a ticket",
  description: "Returns one bounded ticket.",
  effects: "read", requires: "app",
  args: [{ name: "ticket", description: "Ticket ID", value: { kind: "id", domain: "ticket" }, required: true }],
  flags: {
    detail: { description: "Response detail", value: { kind: "enum", values: ["brief", "full"] }, required: false },
    token: { description: "Credential", value: { kind: "string" }, required: false, secret: true },
  },
} as const satisfies CommandSpec;
const writeSpec = {
  path: "tickets edit",
  summary: "Edit a ticket",
  description: "Applies a validated ticket update.",
  effects: "write", requires: "app",
  args: readSpec.args,
  flags: {},
} as const satisfies CommandSpec;

declare const readModule: HandlerModule<typeof readSpec, App, {}>;
declare const writeModule: HandlerModule<typeof writeSpec, App, {}>;
const getTicket = define(readSpec, {
  examples: [{ why: "Read one ticket", args: { ticket: "ticket-1" }, flags: {} }],
  handler: async () => readModule,
});
const editTicket = define(writeSpec, {
  examples: [{ why: "Edit one ticket", args: { ticket: "ticket-1" }, flags: {} }],
  handler: async () => writeModule,
});

const ticketId = id("ticket", "ticket-1");
const projectId = id("project", "project-1");
const getInvocation = invocation(getTicket, { args: { ticket: ticketId }, flags: { detail: "brief" } });
const editInvocation = invocation(editTicket, { args: { ticket: ticketId }, flags: {} });
accepts<Id<"ticket">>(ticketId);

// @ts-expect-error An ordinary string has not crossed an ID validation boundary.
invocation(getTicket, { args: { ticket: "ticket-1" }, flags: {} });
// @ts-expect-error A valid project ID still is not a valid ticket ID.
invocation(getTicket, { args: { ticket: projectId }, flags: {} });
// @ts-expect-error Enum flags retain their declared choices.
invocation(getTicket, { args: { ticket: ticketId }, flags: { detail: "verbose" } });
// @ts-expect-error Undeclared flag names fail on a fresh object.
invocation(getTicket, { args: { ticket: ticketId }, flags: { detial: "brief" } });

const typoFlags = { args: { ticket: ticketId }, flags: { detial: "brief" } };
// @ts-expect-error Assigning to a variable must not bypass the flag inventory.
invocation(getTicket, typoFlags);
const extraArg = { args: { ticket: ticketId, project: projectId }, flags: {} };
// @ts-expect-error Positional argument names also stay exact after assignment.
invocation(getTicket, extraArg);
const extraTopLevel = { args: { ticket: ticketId }, flags: {}, out: "/tmp/result.json" };
// @ts-expect-error Extra top-level properties cannot silently disappear.
invocation(getTicket, extraTopLevel);
const secretInput = { args: { ticket: ticketId }, flags: { token: "secret" } };
// @ts-expect-error Suggestions must never serialize credentials, even from variables.
invocation(getTicket, secretInput);

const widenedCredential: Flag = {
  description: "Credential", value: { kind: "string" }, required: false, secret: true,
};
const widenedSecretSpec = { ...readSpec, path: "tickets secret", flags: { token: widenedCredential } } as const;
declare const widenedSecretModule: HandlerModule<typeof widenedSecretSpec, App, {}>;
const widenedSecretCommand = define(widenedSecretSpec, {
  examples: [{ why: "Read with ambient identity", args: { ticket: "ticket-1" }, flags: {} }],
  handler: async () => widenedSecretModule,
});
// @ts-expect-error A possibly-secret flag must be conservatively excluded from suggestions.
invocation(widenedSecretCommand, { args: { ticket: ticketId }, flags: { token: "secret" } });

const reservedSpec = {
  ...readSpec,
  flags: { json: { description: "Reserved output switch", value: { kind: "boolean" }, required: false } },
} as const;
declare const reservedModule: HandlerModule<typeof reservedSpec, App, {}>;
const reservedBinding = {
  examples: [{ why: "Invalid declaration", args: { ticket: "ticket-1" }, flags: {} }] as const,
  handler: async () => reservedModule,
};
// @ts-expect-error Framework output switches cannot be declared as domain flags.
define(reservedSpec, reservedBinding);

const openFlags: Readonly<Record<string, Flag>> = reservedSpec.flags;
const openInventorySpec = { ...readSpec, flags: openFlags };
declare const openInventoryModule: HandlerModule<typeof openInventorySpec, App, {}>;
const openInventoryBinding = { ...reservedBinding, handler: async () => openInventoryModule };
// @ts-expect-error A widened flag inventory cannot prove reserved names are absent.
define(openInventorySpec, openInventoryBinding);

declare const prepared: Prepared<"tickets edit", { readonly title: string }>;
accepts<Prepared<"tickets edit", { readonly title: string }>>(prepared);
// @ts-expect-error Preparation is scoped to the command that established it.
accepts<Prepared<"tickets archive", { readonly title: string }>>(prepared);
// @ts-expect-error A raw value and hash do not prove successful preparation.
accepts<Prepared<"tickets edit", { readonly title: string }>>({ value: { title: "Updated" }, payloadHash: null });

const advice = hint(getInvocation, "Read the updated ticket");
const protocol = instruction("review-flow", "Wait for approval before continuing.");
accepts<HandlerGuidance>({ hint: advice });
accepts<HandlerGuidance>({ instruction: protocol });
// @ts-expect-error Guidance must be constructed through its owning abstraction.
accepts<HandlerGuidance>({ hint: "Run tickets get" });
// @ts-expect-error Bare instruction text cannot omit protocol ownership.
accepts<HandlerGuidance>({ instruction: "Wait for approval" });
const conflictingGuidance = { hint: advice, instruction: protocol };
// @ts-expect-error An intermediate variable cannot bypass tier exclusion.
accepts<HandlerGuidance>(conflictingGuidance);
// @ts-expect-error Handlers cannot issue unproven reminders.
accepts<AnyResult>({ ok: true, data: null, reminders: [] });
// @ts-expect-error Framework data slots still reject non-JSON values after widening.
accepts<AnyResult>({ ok: true, data: () => null });
// @ts-expect-error Success cannot carry a simultaneous failure.
accepts<AnyResult>({ ok: true, data: null, error: defineErrors({ denied: { exitClass: "failed", description: "Denied" } }).error("denied", { message: "Denied" }) });

const reminder = defineReminderRule<{ readonly editing: boolean }>({
  id: "edits.require-review",
  appliesTo: [editTicket],
  priority: 1,
  when: (state) => state.editing,
  text: () => "Preserve the review record.",
});
evaluateGuidance({ command: editTicket, state: { editing: true }, rules: [reminder], eventSink: () => {} });
// @ts-expect-error Rules cannot be registered without observable firings/conflicts.
evaluateGuidance({ command: editTicket, state: { editing: true }, rules: [reminder] });

const complete = { truncated: false, returned: count(1), total: { kind: "known", count: count(1) } } as const;
accepts<Omission>(complete);
accepts<Omission>({ truncated: true, returned: count(1), total: { kind: "unknown" }, reveal: getInvocation });
// @ts-expect-error Truncation must include a drill-down route.
accepts<Omission>({ truncated: true, returned: count(1), total: { kind: "unknown" } });
// @ts-expect-error Drill-down routes cannot have write effects.
accepts<Omission>({ truncated: true, returned: count(1), total: { kind: "unknown" }, reveal: editInvocation });
// @ts-expect-error A complete result must not also promise omitted records.
accepts<Omission>({ ...complete, reveal: getInvocation });
page({ items: [{ id: ticketId }], total: { kind: "unknown" }, more: true, reveal: getInvocation });
// @ts-expect-error The paging constructor enforces the same read-only reveal rule.
page({ items: [], total: { kind: "unknown" }, more: true, reveal: editInvocation });

createTestHost({ files: { "request.json": "{}" } });
declare const rendered: RunResult;
expectBounded(rendered, bytes(60_000));
// @ts-expect-error Cardinalities cannot substitute for byte budgets.
expectBounded(rendered, count(60_000));

// @ts-expect-error Package exports do not expose the symbol used to mint nominal types.
export type HiddenBrand = import("cli-for-agents/internal/brand").Brand<"forged">;
