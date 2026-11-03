---
name: designed-friction
description: >-
  Make deliberate tool constraints legible to agents through point-of-refusal
  rationale, accurate mechanism framing, two-sided progress ledgers, explicit
  action cost signals, and a designed-versus-defect friction taxonomy. Use when
  agents route around or argue against intended constraints, avoid cheap
  permitted actions, misread refusal or progress messages, or conflate design
  boundaries with bugs.
---

# Designed Friction

`mechanical-guardrails` makes a constraint unbreakable; this skill makes it understood. An agent that cannot tell a deliberate boundary from an implementation accident treats both as obstacles—complaining in reports when it has no authority, routing around the rule when it has local authority, or reconfiguring the constraint away when it has config authority.

## Prevent false mental models and mis-priced actions

Agents build their model of your system from command output. Factually true output can still teach a false model by foregrounding the wrong detail or leaving action costs unstated:

- **State the mechanism where a wrong inference is invited.** A refusal reading *"item R5 needs a valid approval for `<revision-id>`"* is true, but naming the revision teaches the agent that approvals are revision-scoped and wiped by reopening the document—even if a reference doc says they are element-scoped and carry forward. State the carry-forward mechanism inside the refusal message where the belief forms.
- **Report both sides of a ledger.** Deficit-only output (`11 pending of 18`) reads as 7 lost rather than 7 banked. Report satisfied/carried counts alongside pending counts and the reason for the remainder:
  ```
  approvals: 12 carried, 6 pending (content changed since last approval)
  ```
- **Make cheap sanctioned actions visibly cheap.** When an agent believes a permitted action is expensive or destructive—reopening a document, re-running tests, reverting a bad change, asking a clarifying question, re-validating—it silently avoids the path with no refusal or error in the logs. State the low cost at the decision point.

## Attach one-line rationale to designed refusals

Naming the permitted alternative without stating *why* the boundary exists leaves the constraint under negotiation. Add a one-sentence `why:` to every refusal enforcing a designed constraint:

```
stage_blocked: decisions belong to the design stage — author them there.
  why: requirements settle before design so the design cannot shape the
       requirements around itself.
```

- **Assert the value; never apologize.** Write *"why: X protects Y"* rather than *"unfortunately you must wait"*. Apologetic wording frames the rule as an incidental tax and invites workarounds.
- **Place rationale only where restrictions are encountered:**
  1. **Typed refusals (highest leverage):** One-line `why:` when the block fires.
  2. **Command `--help` `context:` blocks:** Brief rule shape for constraints agents meet before tripping them (`progressive-disclosure-tooling`).
  3. **Skill docs:** The friction taxonomy below, not per-command rationale.
  4. **Never on success output:** Rationale on the happy path is noise that trains agents to skim output, including refusals (`agent-feedback-tiers`).

## Publish the designed-versus-defect taxonomy

Include an explicit classification in the tool's skill doc so agents pre-sort bug reports and retrospectives instead of mixing intended boundaries with defects:

- **Designed friction (absorb; do not route around or report as a bug):** Protects human judgment or an audit property—gated transitions, staged write boundaries, human-only acts, immutability of approved artifacts, audit-trail protections, and validation rejecting unverifiable claims.
- **Incidental friction (report; do not design around):** Read paths answering from stale or wrong state, silent truncation, missing verbs, misleading messages, or multi-step sequences that should be atomic.
- **Composite friction (classify the layers separately):** When a gate requires a human-only act, the boundary is designed friction, but if no UI or CLI surface exposes that act, the missing affordance is a defect (`mechanical-guardrails`). Instruct agents to absorb the boundary while reporting the missing surface.

## Related skills

- `mechanical-guardrails` — when making a constraint structurally unbreakable and proving its remedy exists
- `agent-feedback-tiers` — when rationing output guidance so refusal rationale is not diluted by happy-path noise
- `cli-tools-for-agents` — when designing preflight verbs, obligation-named findings, and gate-delta receipts
- `agent-retrospectives` — when triaging agent-reported friction into wrong models, under-explained constraints, and real defects
- `earned-guidance-docs` — when recording incident-backed rules in project guidance docs
