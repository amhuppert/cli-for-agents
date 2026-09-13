# Handoff: cli-for-agents

This repository will hold a TypeScript library for building command-line tools that AI agents call. Nothing here is code yet. This document gives an agent with no prior context the objective, the current state, where the source material lives, and what to do next.

## Objective

Alex's goals, as stated when the exploration began:

- Make it easier to implement CLI applications that follow the agentic-engineering-principles skills.
- Enforce consistent API designs across such CLIs.
- Allow creating CLIs with minimal overhead.
- Encourage good CLI designs and make it easier for implementers to do the right thing by default.
- Make it harder to encounter pitfalls.

Functionality named at the outset (not a complete list): a help registry; an instruction/hint/reminder model with injection into command output; contextual responses such as hints based on application state, including contextual help; injection of related commands into output; large outputs written to files automatically.

The library must serve two existing CLIs built on these principles, and future ones:

- `cctl`, the agent CLI of Command Center at `/Users/alex/github/command-center` (source under `src/cli`; a thin client of a long-running server).
- `kb`, the CLI of knowledge-base-ingest at `/Users/alex/github/knowledge-base-ingest` (source under `src/cli`; a local SQLite-backed tool).

## Current state

- The design exploration is complete and lives in `docs/design/agentic-cli-framework-design.md`. It was produced on 2026-09-12 and 2026-09-13 by two agents drafting independently, cross-reviewing, and negotiating to agreement, then reviewed once by Alex. It is a proposal, not an approved specification.
- Alex's instruction for the next phase: the design is to be reviewed and iterated by other agents before any implementation starts. Do not begin implementing the library until that review has happened and Alex says to proceed.
- The principles the library exists to serve are in this repository under `plugins/` (see below) and are the normative source. Where the design and a skill disagree, the skill wins unless Alex has decided otherwise (his decisions are listed below).

## What is in this repository

| Path | What it is |
|---|---|
| `plugins/claude/agentic-engineering-principles-plugin/` | The Claude Code plugin: `.claude-plugin/plugin.json` plus fourteen skills under `skills/<name>/SKILL.md`. |
| `plugins/codex/agentic-engineering-principles/` | The Codex packaging of the same fourteen skills: `.codex-plugin/plugin.json`, each skill with a `SKILL.md` and an `agents/openai.yaml`. In the source repository this variant is generated from the Claude variant by `typescript/scripts/build-codex-plugin.ts`; there is no generator here yet, so a change to a skill must be applied to both copies until one is added. |
| `docs/design/agentic-cli-framework-design.md` | The design proposal, copied verbatim with a provenance header. |
| `docs/design/agentic-cli-framework-design-audit.md` | How the proposal was negotiated, what was contested, and what changed after Alex's review. |
| `HANDOFF.md` | This file. |

Both plugin copies were verified identical to their sources with `diff -r` at copy time. The plugin's home is intended to move here; the copies in `my-ai-resources` still exist and will need to be reconciled.

## The fourteen skills, and which ones the design leans on most

`cli-tools-for-agents` (exit-code taxonomy, structured errors, file payloads and validate verbs, preflight gates, jobs, identity, doctor, build parity), `progressive-disclosure-tooling` (help as a graph derived from one typed registry), `agent-feedback-tiers` (hint, reminders, instruction), `query-output-disclosure` (bounded query output with drill-down and spill to files), `designed-friction` (rationale at the point of refusal), `mechanical-guardrails` (derivations, ratchets, contract tests, declare-or-fail inventories), `agent-structured-output`, `agent-offloading`, `ai-readable-tool-output`, `earned-guidance-docs`, `live-system-verification`, `logging-for-agent-debugging`, `agent-retrospectives`. Read the first six before reviewing the design.

## What the design proposes, in one paragraph

A small opinionated kernel with no runtime dependencies, built around one executable command declaration (`defineCommand`) from which the parser, dispatch, help, generated references, and disclosure selectors derive, and one response pipeline that owns guidance arbitration, a byte-measured delivery bound, artifact spill, and output draining before exit. Handlers are lazily imported modules; declarations are data only. Optional "kits" (identity, HTTP transport, job waiting, doctor, gates and preflight, document digests) are separate subpath exports loaded only by the commands that use them. A testing subpath ships the contract suite, deliberately invalid fixtures, and helpers for testing without running real commands. The plan is to seed the kernel from Command Center's already-audited CLI modules, generalize against a written behavioral contract, and pilot one thin slice in each consumer before migrating anything. Sections 1 through 7 of the design document cover the verdict, evidence, extraction estimates, pitfalls, the design, the path, and the decisions Alex owns.

## Decisions Alex has already made

- Reminder rules do not require an evidence field; evidence is optional documentation (2026-09-13).
- Startup overhead is a design concern: lazy handlers, data-only declarations, no runtime dependencies in the kernel, single-file bundles as the default distribution, and mechanical startup guardrails (see the "Startup overhead" section of the design).
- The design document's other content reflects the negotiated agreement of the two drafting agents, not decisions by Alex, except where the document says otherwise.

Decisions Alex still owns, per the design's section 7: whether to replace Commander in kb (a rewrite of its router), when each consumer's wire format (envelope fields, exit classes) is cut over, and where the package lives.

## Facts about the consumers that reviewers will need

Measured from source on 2026-09-12 and 2026-09-13; treat anything older as possibly stale and re-measure before relying on it.

- Command Center's `src/cli` is about 41,000 lines outside tests with 193 registry entries; its plumbing (registry, parser, dispatch, help rendering, envelope, disclosure, job waiting, exit taxonomy, guidance prefixes) is about 4,700 lines across 17 files. Its CLI conventions are in `.kiro/steering/cli.md` and `docs/design/cc-cli/01` through `09`; its startup work is recorded in `PERFORMANCE.md` under the 2026-09-11 entry. It depends on Zod 4 and bundles `undici`.
- knowledge-base-ingest's `src/cli` is about 10,100 lines outside tests with 38 leaf commands and 9 groups; its plumbing is about 4,500 lines across 16 files, including a 554-line pre-parse router that exists to work around Commander. Its conventions are in `docs/ARCHITECTURE.md` section 13 and `docs/LESSONS.md`. It depends on Zod 3.24 and runs through `tsx` without a build step. On 2026-09-13 its checkout did not run because `commander` was missing from `node_modules`; reinstall before measuring anything there.
- Idle startup of the installed `cctl` on Alex's machine (Node 24.16): 0.25 s for `version` and `--help` against a 0.07 s Node floor, 0.49 to 0.60 s for a group usage refusal. kb's `tsx` launcher alone costs 0.39 s on an empty file.
- Both CLIs converged independently on the same vocabulary (three guidance tiers, six output prefixes, omission metadata, spill manifests with a content hash) and diverged on envelope field names, exit-code sets, hint authoring model, byte budgets, artifact locations, and parser strategy. The design document's section 2 tabulates this.

## Where the rest of the context lives

- The negotiation artifacts (both drafts, cross-reviews, counter-proposal, resolution) are in the `my-ai-resources` repository under `memory-bank/collaboration/592fad92-4333-4174-8293-4aa04cf6185c/`, on the worktree branch `csm/agentic-cli-framework-f1aa78`.
- Alex's questions and the answers that were folded into the design are in the Command Center notepad "Agentic CLI Framework" (id `4654c774-ae23-40dd-bdde-523efec8bd3a`; read with `cctl notepad get '4654c774-ae23-40dd-bdde-523efec8bd3a'`).
- The originating conversation is Command Center conversation `afce1a85-9ea0-4ec3-a373-dd6d951684b5` (project `my-ai-resources`, session "Agentic CLI Framework"; read with `cctl conversation read afce1a85-9ea0-4ec3-a373-dd6d951684b5 --outline`).
- Command Center's boot-time work is conversation `d4761130-2d64-4dd4-aaa8-1892cd487ea5` (project `command-center`, session "cc validators spike"), commit `63bc81e3a` there, squash-merged to main as `e6705905c`.

## What to do next

1. Review the design against the fourteen skills and against both consumers' source. Record findings and proposed changes as documents under `docs/design/`; do not edit the copied proposal in place, so its provenance stays intact.
2. Iterate the design with Alex. The design's section 6 proposes the sequence after that: write a behavioral contract, extract the kernel from Command Center's modules, pilot one slice in each consumer, measure, then migrate a command family at a time.
3. Do not implement, add dependencies, or scaffold a package until Alex confirms the review is complete.

## Working conventions carried over

- Follow the principles in `plugins/` when writing anything agent-facing in this repository, including this repository's own documentation and eventual skills.
- Label counts as measured and estimates as estimates; the design's line-count figures are source-reading estimates over stated file sets, and its "how much moves" numbers were never validated by a migration.
- The consumers are real, active projects. Read them freely; do not modify them from this repository.
