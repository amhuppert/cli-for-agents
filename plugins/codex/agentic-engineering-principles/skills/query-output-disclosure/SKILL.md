---
name: query-output-disclosure
description: "Design bounded, pull-based output for agent-facing query commands
  (list, show, search, status): constant-size digest defaults, stable
  round-tripping handles, explicit omission lines with follow-up commands, and
  file spillover for large dumps. Use when designing read commands for an agent
  CLI or preventing query results from flooding context."
---

# Query Output Disclosure

Round trips are cheap; context window space persists for the rest of the session. Apply progressive disclosure to query data just as `--help` applies it to instructions (`progressive-disclosure-tooling`): return a bounded digest by default and make every deeper level one obvious command away.

Query output discloses both data and instructions—an omission line like `"…and 130 more — narrow with --status failed"` states both the data boundary and the next command.

## Core contract for query commands

1. **Bounded digest by default.** Make default output size a function of the flags, not the dataset size (more records grow counts, not line count). Give each read verb an explicit line/token budget and treat exceeding it as a defect. Unlike linters and test runners where passing items are suppressed as noise (`ai-readable-tool-output`), query data has no noise/signal split—layer it instead of dumping or suppressing it.
2. **Stable, round-tripping handles.** Every outline item must carry a stable identifier (ID, path, section name, line range) formatted exactly as the drill-down verb expects (`show 7f3a`, `--section auth`, `--lines 120-180`). Never use positional indexes that renumber when sort order or filters change.
3. **Explicit omission and hint-tier follow-ups.** Never truncate silently. State what was omitted as primary output (`showing 20 of 143`), carry structural omission metadata in `--json` (`total`, `returned`, `truncated`, `next` cursor—never exempt `--json` from volume bounds), and suggest the exact narrowing, paging, or drill-down command in the `hint` tier (`agent-feedback-tiers`) using registered command/flag names.

## The escalation ladder

| Level | Shape | Example |
|---|---|---|
| `0` — Existence | Counts and sizes only | `143 runs, 12 failed, oldest 2d` |
| `1` — Outline (**default**) | Digest with stable handles | One line per item: ID, status, headline fields |
| `2` — Scoped detail | One node or section in full | `show <id>`, `--section auth`, `--depth 2` |
| `3` — Everything | Explicit opt-in (`--full`) | Past a size threshold, written to a file (path returned), never streamed to stdout |

Writing oversized Level 3 output to a file delegates further navigation to the agent's own ranged-read and grep tools, matching the file-payload pattern for inputs (`cli-tools-for-agents`) and manifests (`agent-structured-output`).

## Disclosure pattern menu

Implement only the mechanisms warranted by observed usage (compose as needed, e.g., filter + fields + limit) and declare every flag in the typed command registry (`progressive-disclosure-tooling`):

- **Deepen per item:**
  1. **Detail levels:** `--format summary|full`, `--depth N`, or `list` / `show <id>` verb pairs.
  2. **Field selection:** `--fields id,status,durationMs` or `--include body`. Elide large fields by default, printing their size and fetch flag (`body: <8.2 KB — use --include body>`).
- **Narrow the item set:**
  3. **Filtering:** Domain predicates (`--status failed`, `--since 2h`, `--author x`). Prefer filters over pagination so the agent reaches the target in one call.
  4. **Pagination:** `--limit`/`--offset` or cursor as a fallback when no filter applies, ordered by relevance or recency so page 1 is highest value.
  5. **Search within content:** `search <pattern>` over large blobs returning matches with bounded context lines and handles.
- **Raise the altitude:**
  6. **Ranked aggregation:** Top-N by metric, group-by counts, or hotspots computed over the entire dataset with bounded output (`logging-for-agent-debugging`).
  7. **Sampling:** Schema/summary stats plus a few representative records when the caller needs data shape rather than specific items.
- **Change the baseline:**
  8. **Delta output:** Only state changed since a cursor or timestamp, for `status` verbs polled in a loop.

## Related skills

- `cli-tools-for-agents` — when designing text-by-default output, `--json` envelopes, and file payloads
- `progressive-disclosure-tooling` — when registering query flags and `--help` nodes in the typed command registry
- `agent-feedback-tiers` — when formatting zoom-in suggestions in the `hint` tier
- `logging-for-agent-debugging` — when applying ranked aggregation and bounded digests to log analysis
- `agent-structured-output` — when returning small JSON manifests that reference generated files
