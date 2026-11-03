---
name: agent-feedback-tiers
description: >-
  Steer agents from tool output using a three-tier feedback contract (hint,
  reminders, instruction), truncation-safe line ordering, and an evidence-gated
  admission rule for server-authored reminders. Use when designing tool output
  guidance, ordering output lines to survive head/tail trimming, chaining
  multi-step CLI flows, or rationing runtime reminders.
---

# Agent Feedback Tiers

Tool output reaches the agent immediately before its next decision—outperforming system prompts read thousands of tokens earlier—provided the tier contract stays crisp and the channel is rationed.

## The three-tier contract

Command output (both text mode and the `--json` envelope alongside `error`/`issues`/`code`—never text-mode-only) carries up to three guidance tiers:

| Tier | Envelope field | Semantics | Agent obligation |
|---|---|---|---|
| Hint | `hint?: string` | Advisory likely next step | Ignorable by contract with zero risk |
| Reminders | `reminders?: string[]` | Binding invariants while work continues | Keep true ("workflow halted", "2 of 5 iterations left"); not an immediate action |
| Instruction | `instruction?: string` | Mandatory immediate protocol step | Obey before anything else ("end your turn now") |

**Tier misuse is a review-blocking defect.** Never place load-bearing protocol (stop conditions, halt reasons, end-turn directives) in `hint`, and never place immediate actions (`"run the tests now"`) in `reminders`. Avoid collapsing tiers into a single `messages[]` array with severity levels; if `hint` ever carries required actions, agents can no longer safely skim it.

## Truncation-safe render order

Agents frequently pipe tool output through `head` (for queries) or `tail` (for writes, checks, and jobs; see `cli-tools-for-agents`). Place load-bearing lines at the outer edges where truncation preserves them, and keep `instruction:` as the final line:

- **Query:** primary digest → detail lines → `reminder:` lines → `hint:` line.
- **Write, check, or job:** detail lines → `reminder:` lines → `hint:` line → outcome line → `instruction:` line.
- **Error:** actionable error line first, followed by concise detail/issues short enough that `tail` still captures the error line.

## Chained hints as the mid-flow discovery layer

Always-loaded instructions point to a skill, the skill points to the first command, and output hints chain subsequent commands without requiring the agent to reload docs mid-flow:

- `validate` succeeds → `"valid — create it with yourcli thing create --file payload.json"`
- `create` succeeds → `"created <id> — start it with yourcli thing start <id>"`
- `list` omits detail → hints sibling verbs (`register`/`delete`), drill-down (`show <id>`), or narrowing flags (`--status failed`; see `query-output-disclosure`)

**Hint authoring rules:**

- One imperative line (≤ 25 words); omit on terminal actions that have no next step.
- Author hints beside command definitions so verb and flag names cannot drift from the registry (`progressive-disclosure-tooling`); the server returns state facts, never client verb strings.
- Never rely on a protocol skill's reference file to enforce rules that govern *every* command invocation (such as not trimming output)—agents only load skills for the protocol they think they are running. Put cross-cutting rules in the always-loaded prompt or in the tool's own behavior.

## Reminder admission and server-side authoring

Ship a reminder only when **all four** conditions hold:

1. **Earned by an observed failure.** Cites a real incident, bug, or audit finding—never a speculated risk.
2. **State-conditional.** Fires from a runtime state predicate (e.g., remaining iterations ≤ 2, active halt, retry count threshold), never unconditionally on every invocation of a command.
3. **Tier-true.** Expresses an invariant that can be violated *after* the current command succeeds (not an immediate action or optional hint).
4. **Capped.** ≤ 2 reminders per response, priority-ordered.

**Compute reminders where state lives:**

- Run a **pure, unit-testable rule engine** (`input → string[]`) on the server; keep the CLI a dumb renderer that never guesses state or hardcodes static reminders.
- Require an `evidence` field on every rule definition citing the originating failure, and log rule firings (rule IDs and context) so effectiveness can be measured.
- Require **measured post-hoc evidence** that existing reminders reduced protocol violations (stalls, breaker trips, scope creep) before adding rules or expanding to new command families.
- Apply the same scarcity rule to explanatory rationale: attach a one-line `why:` to refusals, never to success output (`designed-friction`).

## Related skills

- `cli-tools-for-agents` — when designing CLI exit codes, outcome lines, and preflight verdicts
- `progressive-disclosure-tooling` — when deriving `--help` and hint vocabularies from one typed registry
- `query-output-disclosure` — when using hints to suggest drill-down and filtering flags on bounded query output
- `earned-guidance-docs` — when rationing always-loaded and read-on-demand documentation by incident evidence
- `designed-friction` — when placing one-line refusal rationale without polluting success output
