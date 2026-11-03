---
name: cli-tools-for-agents
description: >-
  Design a project CLI as the primary tool surface for AI coding agents instead
  of in-process or MCP tool servers. Use when building or migrating an agent
  CLI, defining exit-code and text/JSON output contracts, handling complex file
  payloads or versioned document rewrites, designing preflight checks and
  finding severities for gated transitions, or wrapping long-running jobs.
---

# CLI Tools for Agents

Build a shell-invoked CLI designed for a calling agent rather than a human or an in-process/MCP tool server. State this agent-first target at the top of the tool's documentation.

## Why a CLI beats in-process or MCP tool servers

1. **Reliability.** In-process tool servers require dedicated recovery machinery (pre-turn rebinds, stream-close rebinds, keepalives, kill escalation). A CLI has no persistent binding to break; failures become standard non-zero exits that agents handle reliably, and the recovery subsystem can be deleted.
2. **Portability.** Works for any agent backend with shell access and for external callers passing flags or environment variables.
3. **Ergonomics.** Large nested tool schemas force inline JSON arguments where one escaping error ruins the call. `--file <path>` plus a `validate` verb lets agents write, validate, and edit payload files cheaply.
4. **Token efficiency.** Savings concentrate in large-schema tools. Measure rather than assume: compare tool-schema tokens per fresh context window and invocation failure rates before and after migrating.

## Output and input contracts

- **Non-interactive always.** No prompts, TTY-detection branches, pagers, or color dependence.
- **Text by default; `--json` opt-in.** Agents read stdout as text; line-oriented text (`<path>: <message>`, one fact per line, never narrative prose) costs fewer tokens than JSON keys and escaping, and keeps stack traces and diffs readable. Offer a structured `--json` envelope on every command for code consumers (scripts, orchestrators, `jq`), never for the agent's own reading.
- **Structured file inputs.** Code parses inputs, so pass any payload beyond a few scalars as a schema-validated file (`--file <path>`, `-` for stdin) rather than inline JSON arguments or sprawling flags.
- **Bounded query output.** Default read output is a constant-size digest with stable zoom-in handles, explicit omission counts, and the exact follow-up command to reveal more; write full dumps past a size threshold to a file (see `query-output-disclosure`).
- **Pure core.** Structure the CLI core as `(argv, env, injectedClient) → { exitCode, stdout, stderr }` so unit tests run without a server and contract tests run against real route handlers in-process.
- **Clean contract replacement.** When the only consumers are agents and a skill doc updated in the same change, replace output shapes atomically rather than maintaining dual-shape backwards compatibility.

## Designing for agent shell habits

Prose rules against shell habits sit at the bottom of the enforcement ladder (`mechanical-guardrails`). Keep a one-line rule against trimming tool output in always-loaded instructions, but design the CLI so common habits are harmless:

- **Trimming with `head` and `tail`.** Agents read the top of queries and the bottom of writes, checks, and jobs. Put the query digest first; put a single outcome line last on writes, checks, and jobs stating the result, identifier, and any next obligation (`agent-feedback-tiers`). Never bury load-bearing verdicts in the middle.
- **Pipes masking exit codes.** `cmd | tail` exits with `tail`'s status, hiding failures and breaking `|| fallback`. State every exit-code outcome in the final outcome line as well.
- **Mangled arguments and zero matches.** Unquoted shell variables can collapse multiple paths into one nonexistent argument. Refuse explicit paths that do not exist (naming them), and fail when explicit targets match nothing (`ai-readable-tool-output`).
- **Guessed verbs.** Agents call expected commands (`list`, `status`) without checking `--help`. Return unknown-command errors that list the parent's valid children (`progressive-disclosure-tooling`), and log unknown paths as demand signals for missing verbs.
- **Routing around restrictive wrappers.** If a wrapper hides test counts or rejects name filters, agents bypass it (and its queue or resource caps) to invoke the underlying runner directly. Expose needed counts and filters on the sanctioned command instead of adding prohibitions.

## Exit codes, local validation, and structured errors

Publish a stable exit-code taxonomy in `--help` and skill docs so callers can branch on `$?` without regex-parsing prose:

| Code | Meaning | Fault |
|---|---|---|
| `0` | Success | — |
| `1` | Operation failed (server rejected request semantics) | Request semantics |
| `2` | Usage or local validation error (bad flags, unreadable file, invalid payload, missing identity) | Caller (fixable in one edit) |
| `3` | Connection or auth failure (server unreachable, bad token) | Environment (always point to `doctor`) |
| `4` | Version mismatch (reserved; normally a one-line stderr warning) | Deployment |

- **Validate locally before network round-trips.** Check flag names, file readability, JSON parsing, and identity resolution locally and fail fast with exit `2` before sending a request. Server-side schema validation remains the source of truth for semantics.
- **Never flatten structured errors into prose.** Return per-field validation issues as `{ error, code?, issues? }`. Render one `  <path>: <message>` line per issue on stderr in text mode (actionable summary line first) and forward `code` and `issues` into the `--json` envelope. Structured detail must never be text-mode-only.

## File payloads, `validate`, and versioned rewrites

Pair every complex `create` or `replace` command with a side-effect-free `validate` verb that runs full server-side validation:

1. Agent writes `payload.json` with its file editor.
2. `yourcli thing validate --file payload.json` returns exit `2` with one issue per line.
3. Agent edits and re-validates until clean, then runs `yourcli thing create --file payload.json`.

**Require a base version on whole-document rewrites.** When replacing a shared document (plan, charter, config), require the base version the edit started from and refuse mismatches, naming the current version. Reference documents by path and version rather than pasting copies into queued messages, which go stale across concurrent approvals.

## Preflight gated transitions

Wherever a command gates a transition (publish, merge, submit, promote, release, deploy), provide a standalone read-only preflight verb answering *what would refuse this right now*—not just a `--dry-run` flag on the transition itself:

- **Exact parity with the gate.** Run the identical rule set as the transition. An approximate preflight that passes when the gate refuses destroys trust.
- **Explicit clean verdict.** State that nothing blocks and name the unblocked transition (silence is ambiguous with not running or matching zero targets).
- **Obligation-named severities.** Name findings by the transition they block (`blocks_publish`, `blocks_merge`, `advisory`) rather than abstract severities (`error`/`warning`/`info`), so the required action is self-evident and one preflight can group findings across multiple gates.
- **Gate deltas on mutations.** Return `{ blockingBefore, blockingAfter }` in `--json` (and a short line in text mode) on every write affecting gated state so regressions surface at the edit. If a write can land in multiple states (e.g., applied vs. held for human approval), state the resulting state and why.
- **Both sides of the ledger.** Report carried/satisfied counts alongside remaining counts and the reason for the remainder so pending items are not misread as lost progress:
  ```
  approvals: 12 carried, 6 pending (content changed since last approval)
  ```
- **Mechanism at the point of refusal.** When a refusal message could invite a false mental model (e.g., citing `<revision-id>` on an element-scoped approval, implying that reopening the document wipes approvals), state the carry-forward mechanism inside the refusal itself (`designed-friction`).
- **Offline rule catalogue.** Publish all stable, greppable rule IDs and severities in a reference doc so agents author toward rules upfront rather than discovering them one refusal at a time.

## Jobs, identity, `doctor`, and build parity

- **Job-shaped long operations.** For operations that can exceed shell timeouts, expose `--wait [--timeout <dur>]` alongside `status <id>` so observation can resume if the shell call is killed. Never provide fire-and-forget flags that hide failures; raise harness timeout ceilings via injected env vars when needed.
- **Identity resolution (`explicit flags > env vars > file`).** Inject ambient identity via environment variables. Fail missing identity with exit `2` naming the exact missing variable. Require explicit flags to target any project, session, or workspace outside the ambient identity (never silently widen scope). Name the binary (e.g., `*-ctl`) so prepending its directory to `PATH` never shadows system tools like `cc`.
- **`doctor` self-check.** Ship a single `doctor` command checking connectivity, auth, identity resolution, and build parity. Reference `doctor` in every exit-`3` error and use it as the session readiness check.
- **Service-published binary and build parity.** When agents run in per-branch worktrees against a long-running service, have the service write the CLI binary atomically (`tmp` + `rename`) at startup. Compile a build stamp (git SHA + build time) into both, send it on every request, emit a one-line stderr warning on mismatch without blocking execution, and report mismatches in `doctor`.

## Related skills

- `progressive-disclosure-tooling` — when designing `--help` navigation and deriving flags/parsers from one typed registry
- `query-output-disclosure` — when bounding read/query command output with digests, handles, and drill-down flags
- `agent-feedback-tiers` — when ordering output lines or adding `hint`, `reminders`, and `instruction` tiers
- `ai-readable-tool-output` — when configuring linters, typecheckers, test runners, and hooks for low-noise output
- `agent-offloading` — when deciding what belongs in deterministic CLI/orchestrator code versus agent prompts
- `designed-friction` — when writing refusal rationale and classifying designed versus incidental friction
- `mechanical-guardrails` — when converting prose tool conventions into structural checks
