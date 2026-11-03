---
name: agent-retrospectives
description: >-
  Audit completed agent sessions and workflow runs to improve instructions
  (AGENTS.md, CLAUDE.md), skills, tooling, and orchestration. Use when running
  a post-mortem or retrospective on agent work, mining transcripts and
  telemetry for failure modes, triaging agent-reported friction, or updating
  guidance after a rollout.
---

# Agent Retrospectives

Treat every substantive agent session or workflow run as an auditable artifact. A retrospective is complete only when every finding is routed to a concrete owner (instruction file, skill, tool, workflow, or config) and a **"What worked (preserve these)"** section records successful mechanisms with evidence so subsequent edits do not churn working parts.

## Review order: Quality → Cost → Speed

Evaluate in strict priority order—never let low cost or fast execution excuse wrong output:

1. **Quality.** Did the result meet intent? Where did the agent stall, deviate from the plan, or need rescuing? Did context pressure, compaction, or ignored truncation degrade output? When a validator/reviewer rejected or passed work, check whether the acceptance criterion itself was flawed or ambiguous: a validator enforcing a bad spec is a planning/guidance defect, not an implementer failure.
2. **Cost.** Where were tokens or dollars wasted—churn, re-deriving documented facts, oversized contexts, or repeated failing commands?
3. **Speed.** Classify every wall-clock gap by cause: agent work, human wait, tooling/validation wait, **operator recovery time** (halted → resumed, measured separately so hours spent halted never report as zero human wait), and **unexplained dead air** (process overhead).

## Evidence discipline: mechanical extraction before judgment

- **Tally deterministically first.** Run read-only scripts over transcripts, logs, and cost data (turns, tool calls by name, error counts, repeated commands, re-read files, cost per conversation) before reading qualitative transcripts. Never open a live datastore through a connection path that mutates it on connect. Let mechanical outliers select which transcripts get a deep read, and hand-check extreme outliers (duration, cost-per-turn, 10× file re-reads). If telemetry is missing, report that gap as a tooling finding.
- **Delegate large transcripts with citation contracts.** Dispatch parallel read-only subagents (one per hotspot) instructed to tally mechanically first, classify waste versus legitimate spend with one-line evidence in ≤ 40–60 lines, and cite exact entry ranges or tallies for every number.
- **Trace every published number to primary telemetry.** Subagent summaries and agent self-reports are hypotheses, not sources. Re-derive every figure in the report from logs, DB rows, or raw transcript tallies (or drop it), never extrapolate unattributable splits, and label incomplete totals as explicit floors (`"cost total is a floor: N conversations had no cost row"`).
- **Spot-check load-bearing self-reports.** Verify handoff and completion claims (`"independent reviewer APPROVED"`, `"TDD'd failing-test-first"`) against actual transcript tool invocations.

## Triaging agent-reported friction

Agent self-reports have opposite reliability profiles on facts versus experience: factual claims require verification, while reported struggle is reliable signal about where friction occurred. However, the agent's **proposed remedy** is systematically biased toward removing the constraint that blocked it. Take the friction location from the agent; derive the fix independently.

High frustration predicts **route-around risk** (where future agents will work around, under-use, or reconfigure a rule), so sort high-frustration items first as a backlog for **explanation**, then classify each:

| Friction class | Signal | Fix |
|---|---|---|
| **Wrong mental model** | Complaint contradicts actual system behavior (the friction never existed) | Fix the command output or message that taught the false belief; never close as `"agent was mistaken"` |
| **Under-explained constraint** | Friction protects human judgment or an audit property; agent states *what* blocked but not *why*, and proposes removing it | Keep the constraint and add a one-line `why:` at the point of refusal (`designed-friction`) |
| **Genuine defect** | Friction is real (bad read path, misleading message, missing verb) and protects no judgment or audit invariant | Fix the tool or workflow |

## Routing findings and the failure-mode catalog

Route every finding to a concrete owner—**instruction file** (`AGENTS.md`, `CLAUDE.md`, read-on-demand doc), **skill** (rule, trigger description, failure mode), **tool/CLI** (exit code, `validate` verb, guardrail), **workflow/process** (decomposition, gate, review step), or **config** (budgets, timeouts, model/effort defaults)—and cite the originating incident when adding guidance (`earned-guidance-docs`). Drop ownerless observations like `"the agent should be more careful"`.

Map recurring findings to stable failure-mode names:

| Failure mode | Signal | Canonical fix class |
|---|---|---|
| Context-window pressure | High occupancy; quality degrades silently near the limit | Split work into smaller units |
| Prompt growth | Instructions/feedback accumulate across iterations instead of resolving | Resolve feedback into the artifact; do not re-inject verbatim |
| Structured-output parse fallback | Output required fenced-JSON or raw salvage | Simplify schema or split thinking from formatting (`agent-structured-output`) |
| Unexplained stall gap | Wall time covered by no recorded activity | Instrument orchestration dead air |
| Hung/silent turn | Long stretch with zero events | Add liveness watchdog; treat as a reliability incident |
| Scratch debris in commits | Temp files or logs shipped in the final change | Add pre-publish hygiene gate |

## Related skills

- `earned-guidance-docs` — when turning retrospective findings into incident-cited rules in `AGENTS.md` or `LESSONS.md`
- `designed-friction` — when adding refusal rationale and publishing a designed-versus-defect taxonomy
- `agent-feedback-tiers` — when adding evidence-backed runtime reminders to tool output
- `logging-for-agent-debugging` — when fixing telemetry gaps or querying per-run forensic logs
- `live-system-verification` — when verifying claims against durable backend state and transcripts
