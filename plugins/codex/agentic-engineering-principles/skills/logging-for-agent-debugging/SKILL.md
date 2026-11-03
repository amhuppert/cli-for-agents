---
name: logging-for-agent-debugging
description: Design structured NDJSON logging and forensic run logs that AI
  agents can query and debug—stable cataloged event names, canonical fields,
  ambient trace enrichment, scoped log routing with global timeline dual-writes,
  rotation-safe queries, and bounded log-analysis CLIs. Use when designing
  application or agent-workflow observability, building log query tools, or
  helping agents debug from logs.
---

# Logging for Agent Debugging

Agents debug by grepping millions of log lines for event names and field keys promised in documentation. Treat event names as a stable public API, make every record self-joining via ambient trace context, document query traps, and provide a bounded log-analysis CLI as the first resort.

## Event vocabulary, canonical fields, and hygiene

- **NDJSON with `module.event` names.** Emit one JSON object per line so `grep | jq` works on any slice. Name events `module.event` (`prompt.submit`, `request.complete`, `lock.rejected`, `session.create_failure`) so agents can grep an entire subsystem by prefix (`"message":"prompt.`). Treating event renames as breaking changes keeps saved queries and analysis tools working.
- **Checked-in event catalog.** Maintain a version-controlled table of `Module | Event | Level | Key fields | Meaning`. Events absent from the catalog are undiscoverable to agents.
- **Canonical field names system-wide.** Standardize cross-cutting keys (`timestamp`, `level`, `module`, `message`, `traceId`, `durationMs`, `status`, `error`). Emit sub-phase timings (`waitMs`, `holdMs`) alongside `durationMs` rather than replacing it, and document legacy field fallbacks (`totalMs`) when retrofitting so older records do not appear missing.
- **Hygiene.** Never log secrets, credentials, or raw user/prompt text in general application logs—log identifiers (`conversationId`) and lengths or previews (`promptLength`, `argsPreview`). Mirror `warn`/`error` to stderr (with a silence switch) so failures surface immediately.

```json
{"timestamp":"2026-01-14T09:31:07.412Z","level":"info","module":"tracing","message":"request.complete","traceId":"1f4c…","action":"send-prompt","projectName":"acme","sessionName":"fix-auth","status":200,"durationMs":842}
```

## Ambient trace context and scoped routing

- **Ambient trace enrichment.** Use `AsyncLocalStorage` (or platform equivalent) to auto-enrich every log line with `traceId` and domain identity (project, session, conversation) without caller-passed parameters.
- **Explicit trace entrypoints for background work.** Require jobs, scheduled tasks, workflow executions, and async agent turns to run inside a trace wrapper (`runAsTrace(action, fn)`). Have the wrapper stamp a symbol marker and assert in an architecture test that every entrypoint is wrapped (`mechanical-guardrails`).
- **Narrow per-entity files + dual-written global timeline:**
  - Route records by active trace context (conversation → session → global) so per-entity files stay small enough to read.
  - Dual-write request lifecycle events (`request.start`, `request.complete`, `request.error`) to the global log so a cross-entity chronological timeline always exists.
  - Sanitize user-derived path segments (map chars outside `[A-Za-z0-9._-]` to `_`, strip leading dots, truncate with hash suffix). On routing failure, degrade to the next scope and emit `logger.path.sanitize_failure`—never drop records.
  - Provide environment-variable overrides to collapse all logs to a single file or disable scoped routing when debugging unfamiliar deployments.

## Documented query gotchas and orientation workflow

Document how naive queries silently return wrong answers:

- **Size-based rotation trap.** The active `.log` file holds only the newest window; an unexpectedly tiny active file usually just rotated into `.1`. Historical counts and older trace lookups must glob rotated backups with `grep -h` (suppressing filename prefixes to keep valid NDJSON):
  ```bash
  grep -h '"level":"error"' "$LOG_DIR"/app.log* | jq -r .message | sort | uniq -c | sort -rn
  grep -h 'TRACE_ID'        "$LOG_DIR"/app.log* | jq '{timestamp,module,message,durationMs}'
  ```
- **Visibility rules.** Document which files tooling auto-discovers versus requires explicitly, which events require raising the log level to `debug`, and which events emit only above a duration threshold (where absence means *fast*, not *never ran*).
- **Orientation-first sequence.** Before reading raw traces: (1) check file existence and line count (`wc -l`) to catch rotation or wrong paths → (2) rank error frequencies by `message` → (3) rank warning frequencies → (4) read the last few errors to grab a `traceId` → (5) reconstruct that trace and inspect the scoped entity file.

## Bounded log-analysis CLI

Give agents a CLI that returns capped structured digests (`query-output-disclosure`) so they rank evidence instead of reading raw logs:

1. **Ranked slow operations:** Top-N requests/operations by duration, filterable by time window, entity, and path.
2. **Hotspot aggregation:** Total inclusive and exclusive time per operation across traces.
3. **Duplicate-work detection:** Repeated operation signatures within a single trace (surfacing N+1 queries and redundant recomputation).
4. **Window or file comparison:** Before/after p95 deltas per endpoint/operation, new duplicate-work signatures, and new warnings/errors.
5. **Single-trace reconstruction:** Timed intervals of one trace with inclusive/exclusive time, duplicates, and warnings.

- **Self-diagnosing instrumentation gaps.** When trace wall time far exceeds the sum of instrumented spans, output an explicit diagnostic: *add instrumentation coverage before optimizing code*.
- **Checked-in budgets.** Evaluate version-controlled performance budgets with the same tool—run advisory first to calibrate against real numbers, then gate.

## Forensic per-run logs for multi-step agent executions

Write a dedicated, access-controlled per-execution log tree with its own retention policy for multi-step workflows using a shared `{ timestamp, event, executionId, ...data }` schema:

```
runs/<executionId>/
├── _manifest.json        # Entry point: status, halt reason, definition, summaries
├── lifecycle.jsonl       # started / paused / resumed / aborted / completed / halted
├── decisions.jsonl       # scheduling, rotation, retry, circuit breaker
└── units/<unitId>/
    ├── iterations.jsonl  # per-iteration lifecycle
    ├── tasks.jsonl       # task completion, reopening, agent-added tasks
    ├── validation.jsonl  # validator invocations, results, remediation
    └── prompts/          # full prompts and responses verbatim, plus parse path used
```

- **State the investigation order in docs:** `_manifest.json` → `lifecycle.jsonl` → `decisions.jsonl` → single `units/<unitId>/`, so agents load only the file answering their question.
- **Fire-and-forget writes.** Never `await` forensic writes on the critical path or let logging errors throw into business logic.
- **Verbatim prompt and response capture.** Store exact sent/received text (never summarized or truncated) plus which structured-output parse path succeeded (`native`, `raw`, or `fenced` fallback) inside `prompts/`.

## Related skills

- `query-output-disclosure` — when designing bounded defaults, handles, and omission metadata for the log-analysis CLI
- `ai-readable-tool-output` — when configuring linters, compilers, and test runners for low-noise output
- `live-system-verification` — when proving live system behavior from traced logs and durable state
- `agent-retrospectives` — when mining forensic run logs and transcripts after completed runs
