---
name: agent-structured-output
description: Get reliable machine-readable JSON output from AI agents using a
  two-turn analysis/formatting split, flat bounded manifests, unconditional file
  offloading, post-parse orchestrator field injection, and bounded repair. Use
  when agent JSON responses drive workflow state, when designing JSON Schema or
  Zod contracts for agents, or when structured output fails validation.
---

# Agent Structured Output

When an agent response drives workflow state, do not force the model to reason and format strict JSON in the same turn or cram reports into JSON strings. Offload substantive content to files, reduce the JSON response to a small flat manifest, and validate both at the boundary.

## The two-turn protocol

Use two turns whenever structured output is load-bearing:

1. **Analysis turn.** Give the agent the task and role instructions with no output-schema constraint. Let it reason in natural language and write required artifact files.
2. **Formatting turn.** Instruct the agent to create or update the required artifact files first, place the full answer or analysis in those files, and return **only** the JSON manifest (never markdown bodies or file contents). Include these rules in the prompt even when the backend enforces a schema—schema validation alone cannot stop a model from stuffing a full report into a `summary` field.

## Manifest schema design

- **Keep schemas flat and bounded.** Use `snake_case` names, flat objects, short capped arrays, enums for decisions/categories, and short IDs (`answer`, `audit`, `main`, `D-1`, `PC-1`). Avoid deep nesting, nested unions, recursive shapes, model-keyed maps, and large nullable combinations.
- **Share vocabulary across agents and phases.** Use common field names (`summary`, `artifacts`, `accepted_from_other_agent_draft` rather than `accepted_from_agent_two_draft`) so downstream code reads one shape.
- **Bound every inline string.** Give every string field one narrow role (summary, ID, status, path, short rationale) and state length limits in both the field description/prompt (as a generation signal) and the authoritative schema (for post-parse enforcement).
- **Offload content to files unconditionally.** Shape artifact entries as `{ id, artifact_type, path, summary }`. Always require artifact files, even for short answers—never say *"use a file if the output is long"*, which splits the model between two output strategies and causes missing-file failures.

## Orchestrator-owned fields

Keep bookkeeping facts the orchestrator already knows (phase, message kind, acting/target agent, round number, per-artifact round/agent/phase tags) **out of the model-facing schema** so echoing slips cannot fail substantive work:

1. Define the model-facing content schema in **strip mode** (not strict mode) so any owned field echoed by a backend is dropped rather than rejected.
2. Parse the model response, inject orchestrator-owned fields, and re-validate the complete object against the authoritative persisted schema.
3. Attribute validation failures by source and path: model content errors carry field paths (express required-artifact checks as path-attributed issues like `artifacts: must include a generated artifact with id "main"`, never unattributed root refinements); post-injection errors report as orchestrator faults.

## Artifact file validation

Validate every referenced file alongside the manifest. Require **relative POSIX paths** under the workflow's designated directory (e.g., keyed by workflow ID, round, agent, and phase), and reject any reference that:

- is an absolute path, contains backslashes, or contains `..` traversal segments,
- resolves outside the expected run/round/agent/phase directory or lacks the required extension,
- points to a missing, empty, or oversized file.

## Portable enforcement, layered extraction, and bounded repair

Treat native provider schema enforcement as an accelerator, never a correctness guarantee:

- **Adapter-owned transport.** Pass the authoritative schema (e.g., Zod) through a neutral backend adapter that selects native constrained decoding or prompt-rendered schema instructions from declared backend capabilities, not backend identity. When rendering a schema into a prompt, preserve every validation keyword (string length, pattern, numeric range, array bounds).
- **Layered post-turn extraction.** Extract candidates in priority order and run **every** candidate through the full schema and file validation gate so an invalid early candidate never hides a valid later correction:
  1. Backend-native structured output.
  2. Raw response JSON.
  3. The last fenced JSON block in the response.
- **One bounded repair turn.** When all first-pass candidates fail validation, run at most **one** repair turn by default (configurable to `0`):
  - Send the complete schema, a bounded tail of the rejected output, and the named validation issues—without repeating the full task context. Repair background runs via a fresh isolated one-shot call and live conversations via one corrective turn on the active runtime.
  - Extract and validate the repaired response once. On a second failure, return the schema-validation failure with candidate diagnostics while preserving the original transcript, content blocks, and generated files.

## Related skills

- `agent-offloading` — when deciding which workflow responsibilities and fields belong in deterministic orchestrator code
- `cli-tools-for-agents` — when accepting complex agent inputs via `--file` payloads and a `validate` verb
