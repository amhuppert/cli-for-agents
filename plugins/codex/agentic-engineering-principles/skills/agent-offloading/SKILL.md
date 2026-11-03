---
name: agent-offloading
description: Offload deterministic work—validation, git/file operations, loop
  control, state bookkeeping, output parsing, and step recovery—from agents onto
  orchestrator code, reserving agents for judgment and synthesis. Use when
  designing agent workflows or prompts, deciding whether a check belongs in code
  or instructions, handling turn interruptions and halts, or extracting
  structured artifacts.
---

# Agent Offloading

Offload every deterministic, reproducible operation onto orchestrator code; reserve the LLM for intent interpretation, tradeoff judgment, and code or prose synthesis.

## Division of labor

| Deterministic code (orchestrator) | Agent (LLM) |
|---|---|
| Git operations, file I/O, log/JSON parsing | Writing and editing source |
| Running validation commands and checking exit codes | Judging whether a result matches user intent |
| Iteration accounting, budgets, retries, circuit breakers, locks | Producing the next plan step or design review |
| Schema validation (Zod / JSON Schema) and message routing | Interpreting ambiguous prompts |

Before adding an obligation to an agent prompt, apply this filter (if more than a few asks remain, split the turn):

1. **Binary, reproducible check?** Run the command in code and pass only failure output to the agent; never spend a turn asking an agent to run tests and report whether they passed.
2. **Both deterministic and LLM validators on the same unit?** Run the cheap deterministic gate (build, typecheck, tests) first and short-circuit on failure so the LLM validator never judges uncompilable code. Charge both failure types to the same iteration budget and circuit breaker.
3. **Loop control (remaining tasks, attempt counts, retry limits, halting)?** Keep in orchestrator state behind a circuit breaker; never ask the model to track its own iterations or decide when to stop.
4. **Known orchestrator facts (phase, round number, acting/target agent IDs, paths)?** Keep them out of the model-facing schema so echoing slips cannot fail substantive work. Parse only model-authored judgments, summaries, and artifact references, inject orchestrator-owned values post-parse, and re-validate against the authoritative persisted schema (`agent-structured-output`).
5. **Structured artifact output (plan, manifest, registration)?** Use a **typed side channel**—have the agent write a file at a known path or invoke a validating CLI/API registration call—rather than parsing prose. If you keep a fenced-JSON extraction fallback, instrument and flag every fallback hit as contract strain.

## Deterministic recovery after interrupted turns

When a turn fails or is cut short, the orchestrator decides what step runs next; the supervisor (human or parent agent) decides only whether to resume.

- **Record the pending step before starting; clear it only on a settled result.** Never re-derive the next step from workspace state that an interrupted turn already mutated, which skips unfinished work and promotes half-fixed state to review. On resume, re-issue the interrupted step with its original reason and inputs, and tell the agent its prior turn was cut short and why.
- **Name the exact stop reason and limit that fired.** Reporting a configured limit trip as a generic `"aborted"` looks like a transient fault, causing supervisors to retry unchanged and hit the same ceiling. Record and surface the stop reason (timeout, stall, user stop, shutdown, credential failure), the limit's value and config location, the attempt duration, and who cleared the halt.

## Related skills

- `agent-structured-output` — when designing two-turn formatting, strip-mode content schemas, and bounded repair
- `cli-tools-for-agents` — when exposing file-payload and `validate` commands for agent side-channel writes
- `mechanical-guardrails` — when replacing prompt instructions with structural checks and contract tests
- `logging-for-agent-debugging` — when recording per-run forensic manifests, stop reasons, and recovery decisions
