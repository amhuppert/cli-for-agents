import type { Command, Invocation } from "../commands.js";
import type { Brand } from "../internal/brand.js";
import { captureArray, captureRecord, checkRule, makeReminderRule, makeSteering } from "../internal/guidance-rules.js";
import { commandData } from "../internal/declarations.js";
import type { Issue } from "../results.js";
import type { NonEmpty } from "../values.js";
import { protocolLimits } from "../results.js";
import { assertFields, assertIdentifier, assertInvocation, assertSerializedLimit, assertText, contractCheck, frozenJson } from "../internal/validation.js";

/** Advisory action and registered target; rendering owns quoting and line bounds. */
export type Hint = Brand<"Hint"> & {
  readonly action: string;
  readonly invocation: Invocation;
};
/** Ownership survives until arbitration, so conflicting protocol cannot silently win. */
export type Instruction = Brand<"Instruction"> & {
  /**
   * Stable name of the protocol policy responsible for this instruction, not a request ID.
   * Arbitration uses it for provenance; equal owner IDs do not make conflicting texts safe.
   */
  readonly ownerId: string;
  readonly text: string;
};
export type RuleId = string & Brand<"RuleId">;
/** Minted only by rule evaluation. */
export type Reminder = Brand<"Reminder"> & {
  readonly ruleId: RuleId;
  readonly text: string;
};

export function hint(invocation: Invocation, action: string): Hint {
  return contractCheck(() => {
    const value = frozenJson({ invocation, action });
    assertInvocation(value.invocation);
    assertText(value.action);
    assertSerializedLimit(value.action, protocolLimits.diagnosticSummary);
    assertSerializedLimit({ invocation: value.invocation }, protocolLimits.references);
    return value as Hint;
  });
}
export function instruction(ownerId: string, text: string): Instruction {
  return contractCheck(() => {
    assertIdentifier(ownerId);
    assertText(text);
    const value = { ownerId, text };
    assertSerializedLimit(value, protocolLimits.instruction);
    return frozenJson(value) as Instruction;
  });
}

type GuidanceChoice<H, I> =
  | { readonly hint?: H; readonly instruction?: never }
  | { readonly instruction: I; readonly hint?: never };
export type ReminderList = readonly [] | readonly [Reminder] | readonly [Reminder, Reminder];
/** A handler cannot author reminders or combine optional advice with required protocol. */
export type HandlerGuidance = GuidanceChoice<Hint, Instruction> & { readonly reminders?: never };
/** Selected guidance before rendering; instruction suppresses hint, including after spill. */
export type FinalGuidance = GuidanceChoice<Hint, Instruction> & { readonly reminders: ReminderList };
/** The serialized envelope carries text, without internal ownership or invocation objects. */
export type WireGuidance = GuidanceChoice<string, string> & {
  readonly reminders: readonly [] | readonly [string] | readonly [string, string];
};

type RuleDefinition<State> = {
  /** Stable, greppable identifier; registration rejects duplicates and invalid spelling. */
  readonly id: string;
  readonly appliesTo: NonEmpty<Command>;
  /** Pure and deliberately synchronous; facts must describe the completed operation. */
  readonly when: (state: State) => boolean;
};
export type ReminderRuleDefinition<State> = RuleDefinition<State> & {
  /** Higher priority wins when more than two reminders fire. Ties use stable rule IDs. */
  readonly priority: number;
  /** A keep-true constraint, never an immediate action. Semantic correctness needs review. */
  readonly text: (state: State) => string;
  readonly evidence?: string;
};
export type ReminderRule<State> = Brand<"ReminderRule"> &
  Omit<ReminderRuleDefinition<State>, "id"> & {
    readonly id: RuleId;
    readonly tier: "reminder";
  };
export type SteeringDefinition<State> = RuleDefinition<State> & (
  | { readonly tier: "hint"; readonly render: (state: State) => Hint }
  | { readonly tier: "instruction"; readonly render: (state: State) => Instruction }
);
export type SteeringRule<State> = Brand<"SteeringRule"> & RuleDefinition<State> & (
  | { readonly id: RuleId; readonly tier: "hint"; readonly render: (state: State) => Hint }
  | { readonly id: RuleId; readonly tier: "instruction"; readonly render: (state: State) => Instruction }
);
export type GuidanceRule<State> = ReminderRule<State> | SteeringRule<State>;

/** Defines a rule, not a reminder; handlers receive no constructor for emitted reminders. */
export function defineReminderRule<State>(definition: ReminderRuleDefinition<State>): ReminderRule<State> {
  return makeReminderRule(definition);
}
export function defineSteering<State>(definition: SteeringDefinition<State>): SteeringRule<State> {
  return makeSteering(definition);
}

export type ConflictingInstruction = {
  readonly instruction: Instruction;
  readonly provenance:
    | { readonly kind: "handler"; readonly ownerId: string }
    | ({ readonly kind: "rule" } & GuidanceProvenance);
};
export type GuidanceConflict = {
  readonly instructions: readonly [ConflictingInstruction, ConflictingInstruction, ...ConflictingInstruction[]];
};
export type GuidanceEvent =
  | {
      readonly type: "guidance.rule_fired";
      readonly commandPath: string;
      readonly ruleId: RuleId;
      readonly tier: "hint" | "reminder" | "instruction";
    }
  | {
      readonly type: "guidance.conflict";
      readonly commandPath: string;
      readonly conflict: GuidanceConflict;
    };
/** The application owns durable storage; delivery failure must not hide a conflict. */
export type GuidanceEventSink = (event: GuidanceEvent) => void | Promise<void>;
/** Registering even one rule requires observable firings. */
export type RuleRegistration<State> =
  | { readonly rules?: readonly []; readonly eventSink?: FiringSink }
  | { readonly rules: NonEmpty<GuidanceRule<State>>; readonly eventSink: FiringSink };

export type RuleFiring = Extract<GuidanceEvent, { readonly type: "guidance.rule_fired" }>;
export type ConflictEvent = Extract<GuidanceEvent, { readonly type: "guidance.conflict" }>;
export type FiringSink = (event: RuleFiring) => void | Promise<void>;
export type ConflictSink = (event: ConflictEvent) => void | Promise<void>;
export type GuidanceProvenance = {
  readonly commandPath: string;
  readonly ruleId: RuleId;
  readonly evidence?: string;
};
export type GuidanceCandidate = { readonly provenance: GuidanceProvenance } & (
  | { readonly tier: "hint"; readonly value: Hint }
  | { readonly tier: "instruction"; readonly value: Instruction }
  | { readonly tier: "reminder"; readonly value: Reminder; readonly priority: number }
);
/** Candidates retain rule provenance and firing events. They are never final selected guidance. */
export type EvaluatedGuidance = Brand<"EvaluatedGuidance"> & {
  readonly commandPath: string;
  readonly candidates: readonly GuidanceCandidate[];
  readonly firings: readonly RuleFiring[];
  /** Includes firing-sink failure without suppressing valid required candidates. */
  readonly issues: readonly Issue[];
};
export type GuidanceEvaluation<State> = RuleRegistration<State> & {
  readonly command: Command;
  readonly state: State;
  readonly handler?: never;
};
/** Evaluate rules in the CLI process; response assembly alone selects final tiers/conflicts. */
export async function evaluateGuidance<State>(input: GuidanceEvaluation<State>): Promise<EvaluatedGuidance> {
  const snapshot = captureRecord(input);
  assertFields(snapshot, ["command", "state"], ["rules", "eventSink"]);
  const command = snapshot["command"];
  if (command === null || typeof command !== "object") throw new TypeError("Expected a command token.");
  const family = commandData(command).family;
  const commandPath = (command as Command).spec.path;
  const rules = Object.hasOwn(snapshot, "rules") ? captureArray(snapshot["rules"]) : [];
  const eventSink = snapshot["eventSink"];
  if ((rules.length > 0 || Object.hasOwn(snapshot, "eventSink")) && typeof eventSink !== "function") {
    throw new TypeError("Rules require a firing sink.");
  }
  // Admit the whole source before executing any application callback.
  const admitted: GuidanceRule<unknown>[] = [];
  const ids = new Set<string>();
  for (const rule of rules) {
    checkRule(rule);
    if (ids.has(rule.id)) throw new TypeError("Duplicate rule id.");
    ids.add(rule.id);
    if (rule.appliesTo.some(target => commandData(target).family !== family)) {
      throw new TypeError("Rule references a foreign command family.");
    }
    admitted.push(rule);
  }
  const candidates: GuidanceCandidate[] = [];
  const firings: RuleFiring[] = [];
  // Finish synchronous state observation before awaiting sinks, which may change state.
  for (const rule of admitted) {
    if (!rule.appliesTo.includes(command as Command)) continue;
    const active = synchronousValue(() => rule.when(snapshot["state"]));
    if (typeof active !== "boolean") throw new TypeError("Rule predicates must return a boolean synchronously.");
    if (!active) continue;
    const provenance: GuidanceProvenance = { commandPath, ruleId: rule.id,
      ...(rule.tier === "reminder" && rule.evidence !== undefined ? { evidence: rule.evidence } : {}) };
    const rendered = synchronousValue(() => rule.tier === "reminder" ? rule.text(snapshot["state"]) : rule.render(snapshot["state"]));
    candidates.push(candidate(rule, rendered, provenance));
    firings.push(Object.freeze({ type: "guidance.rule_fired", commandPath, ruleId: rule.id, tier: rule.tier }));
  }
  const issues: Issue[] = [];
  for (const event of firings) {
    try {
      // Nonempty sources were checked above; inactive/empty sources never call a sink.
      if (typeof eventSink === "function") await eventSink(event);
    } catch {
      issues.push({ code: "KERNEL_GUIDANCE", message: "Guidance firing sink failed.", path: ["rules", event.ruleId] });
    }
  }
  const batch: Omit<EvaluatedGuidance, keyof Brand<"EvaluatedGuidance">> = { commandPath, candidates, firings, issues };
  return frozenJson(batch) as EvaluatedGuidance;
}

/** Rendered values are rebuilt through the bounded constructors before they are retained. */
function candidate(rule: GuidanceRule<unknown>, rendered: unknown, provenance: GuidanceProvenance): GuidanceCandidate {
  if (rule.tier === "reminder") {
    assertText(rendered);
    const value = { ruleId: rule.id, text: rendered };
    // A candidate must fit alone. Only assembly checks the selected aggregate.
    assertSerializedLimit([value], protocolLimits.reminders);
    return frozenJson<GuidanceCandidate>({ tier: "reminder", value: value as Reminder, provenance, priority: rule.priority });
  }
  const record = captureRecord(rendered);
  if (rule.tier === "instruction") {
    assertFields(record, ["ownerId", "text"]);
    return frozenJson<GuidanceCandidate>({ tier: "instruction", value: instruction(record["ownerId"] as string, record["text"] as string), provenance });
  }
  assertFields(record, ["action", "invocation"]);
  return frozenJson<GuidanceCandidate>({ tier: "hint", value: hint(record["invocation"] as Invocation, record["action"] as string), provenance });
}

function synchronousValue(call: () => unknown): unknown {
  try {
    const value = call();
    if (value instanceof Promise) {
      // Observe a rejected native promise without awaiting an invalid async callback.
      void Promise.prototype.then.call(value, undefined, () => {});
      throw new TypeError("Rule callbacks must return synchronously.");
    }
    return value;
  } catch {
    throw new TypeError("Guidance rule callback failed or returned asynchronously.");
  }
}
