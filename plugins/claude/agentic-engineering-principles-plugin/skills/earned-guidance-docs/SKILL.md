---
name: earned-guidance-docs
description: >-
  Write and maintain high-signal agent documentation (AGENTS.md, CLAUDE.md,
  LESSONS.md, PERFORMANCE.md, and reference docs) using evidence-earned
  admission rules, a lean tool-agnostic root contract, and read-on-demand
  pattern docs. Use when creating or pruning instruction files, logging
  post-incident lessons, removing historical rationale from code comments, or
  syncing docs with codebase drift.
---

# Earned Guidance Docs

Agent documentation fails when it accumulates speculative advice or grows too large to read carefully. Ration every guidance surface by evidence, keep the always-loaded root contract small and tool-agnostic, and put domain patterns in single-owner read-on-demand docs.

## Part A — The earned-claim rule and lessons log

Write a durable corrective rule or gotcha only after a real incident, bug, review finding, or dated/numbered audit has bitten. Speculative warnings (*"it would be good practice to…"*), imported style guides, and rules already enforced by linters or typecheckers dilute attention across every earned rule in the file. Bootstrap commands, canonical boundaries, and routing pointers from the codebase and established project decisions without waiting for a failure.

| Surface | Admission bar | Cap |
|---|---|---|
| Runtime reminder in tool output | Observed failure + state-conditional + violable after success (`agent-feedback-tiers`) | ≤ 2 per response |
| Gotcha or corrective guidance in the always-loaded root file (`AGENTS.md`) | Recurring real failure, or a first incident consequential enough to justify loading the rule every session | Readable in one sitting |
| Read-on-demand reference doc | Recurring lesson or architectural decision needing one canonical owner | One owning doc per concern |
| Durable lessons log (`LESSONS.md`, `PERFORMANCE.md`) | Real problem fixed and verified (`red → green`) | Append-only history |

### Structure of a durable lessons file

Maintain one log (or one per axis—performance, reliability, agent behavior—when large) with three parts:

1. **Contract header:**
   > Keep this file updated. When you fix a real problem in this area, add an entry. When you write new code in an area covered by a pattern below, follow it. If you find yourself violating a pattern, stop and ask why — the pattern was written because the alternative bit us.
2. **Patterns to follow:** Currently binding rules in present tense, promoted once a lesson recurs or governs new code.
3. **Resolved issues:** Newest-first dated entries added only when a real problem is **fixed**:
   - **Heading:** `YYYY-MM-DD — <greppable one-line symptom>`
   - **Symptom:** Observed behavior with metrics (`requests averaged N ms across M calls`).
   - **Root cause:** Underlying mechanism so future agents recognize the shape elsewhere.
   - **Fix:** What changed or was deleted.
   - **Verification:** `Red → green` proof that the test failed before the fix and passed after.
   - **Lesson:** Transferable rule naming the mistake class, not just the local file.

### Keep historical rationale out of code comments

Delete code comments that narrate history or migrations (*"now uses focused accessor"*, *"avoid full read"*, *"changed to fix N+1"*, *"no longer calls old service"*). Future agents misread historical sediment as active directives, even after the referenced APIs are gone. Code comments may state current constraints, business reasons, or non-obvious edge cases; move any comment mentioning a prior version, benchmark, migration, or *"now"* into the lessons log.

## Part B — Instruction architecture and lifecycle

### The tool-agnostic root contract (`AGENTS.md`)

Keep shared engineering rules in `AGENTS.md` and limit per-tool files (`CLAUDE.md`, etc.) to importing `AGENTS.md` plus tool-specific routing (skills, slash commands, browser/diagnostic tools). `AGENTS.md` holds only what every session needs:

- **Commands:** install, dev, test, single-test, typecheck, lint, build, and working directories.
- **Safety rules:** shared/live state, off-limits targets, and operations requiring explicit human approval.
- **Canonical boundaries:** one line per architectural concern naming its single owning doc.
- **Development process:** testing contract, spec/approval gates, and scope discipline.
- **Read-on-demand index:** `- <path> — <what it owns; trigger for when to read it>`, paired with an explicit instruction to load only task-relevant docs.

Write index descriptions as **action triggers** (*"before changing persistence"*, *"before adding a mutation, query hook, or server event"*), never vague topics (*"covers the data layer"*). End `AGENTS.md` with the same-change rule: **when a command, path, or canonical boundary changes, update the root pointer and the owning document in the same change.**

### Patterns over catalogs, with an additive sync lifecycle

- **Write patterns, not catalogs.** Describe organization rules with 1–2 examples and state where new items go so adding a file following the pattern requires no doc edit. Never enumerate file trees, dependency versions, or route inventories, and never write secrets or tokens into docs.
- **Bootstrap and sync.** Bootstrap initial docs from codebase patterns for human review. On periodic sync passes, flag doc-vs-code contradictions as warnings for human decision, undocumented code patterns as update candidates, and dead-code docs for removal. Update additively and **never overwrite or delete human-authored rules** without asking.

### Pre-addition checklist

Before adding guidance, confirm: (1) corrective rules and gotchas cite a real incident/finding, (2) the guidance sits in the single owning doc for that concern, (3) current guidance states patterns that survive new files rather than catalogs or migration history, (4) a gotcha or corrective rule placed in `AGENTS.md` has recurred or its first incident justifies loading it every session, and (5) any moved path/command/boundary is updated in `AGENTS.md` in the same change. Bootstrap commands, canonical boundaries, and routing pointers do not require incident evidence.

## Related skills

- `agent-feedback-tiers` — when rationing runtime reminders and output guidance tiers
- `agent-retrospectives` — when mining completed runs for incident-backed guidance updates
- `mechanical-guardrails` — when promoting a recurring doc rule into a lint rule, type check, or contract test
