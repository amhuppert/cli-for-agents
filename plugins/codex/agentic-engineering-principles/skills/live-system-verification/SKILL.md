---
name: live-system-verification
description: Verify features against the live running system, real model/API
  calls, and durable backend state rather than unit/integration fakes or
  optimistic UI. Use when verifying a feature end-to-end, testing changes that
  span processes or persistence boundaries, or confirming a fix works in the
  real application before declaring it done.
---

# Live System Verification

Unit and integration suites exercise fakes by construction; a green test suite never substitutes for a live pass. When the suite passes and live behavior fails, record `"tests exercise the mock, not production"` as a finding.

- **Prove red before green.** Confirm the verification fails against the unpatched behavior before trusting a pass.
- **Gate live-only change classes on a written scenario list.** Changes to process turn-end/handoff semantics, restart survivability, or cross-process protocols must pass a written live scenario list (including mid-flight server restarts where applicable) before completion.

## The verification loop

Run every live verification in this order; skipping steps produces false `PASS` results:

1. **Isolate the target datastore.** Before any mutation, inspect the running server's actual resolved datastore/config path (via startup command, environment, or file on disk—never trust assumed defaults) and confirm it points to a scratch worktree or test directory and throwaway project/session. If default tooling resolves to production or outside the sandbox, stop and report that as a defect.
2. **Plan unambiguous evidence.**
   - Put unique greppable markers in input prompts, names, or payloads, and request non-coincidental model outputs (e.g., a specific arithmetic result).
   - Name test sessions and artifacts orthogonally to grep markers so session names do not match every log line.
   - Verify preconditions (e.g., an active agent turn) from server-reflecting signals (status fields, stop controls, logs, API) before acting, and account for harness interference (e.g., a blocked foreground `sleep` forcing backgrounding and collapsing a timing window).
3. **Drive the real flow.**
   - Exercise the running app via real UI automation or API calls and real LLM calls (no stubbed backends). Seed setup state programmatically via API/fixtures and reserve UI driving for the behavior under test.
   - When behavior depends on the agent backend/provider, run a trivial startup precheck per backend, then run the feature scenarios on each available backend. Report unavailable backends as **untested**, never as passed.
4. **Verify against durable backend state.**
   - Treat the UI as an optimistic hint; when UI and backend disagree, the backend is truth and the discrepancy is a bug. Every `PASS` must cite at least one durable source:
     - **Database row re-read from storage** after the action (never the in-memory object just written).
     - **Structured logs** traced by request/correlation ID (also check for missing expected events like `request.complete` on silent drops).
     - **Agent transcript** confirming exact message order and count without duplicates or omissions.
     - **Server API response** from the endpoints backing the UI.
5. **Verify the real persistence round-trip.**
   - Confirm the storage schema holds the new state and both write and read mappings preserve it (catching schema defaults that silently overwrite omitted read mappings). Prove `real write → cold read-back → assert`, preferably backed by a real-repository contract test.
6. **Clean up and report.**
   - Delete throwaway projects/sessions and close automation sessions (or explicitly list what was left behind and why), and ask whether to keep any temporary repro files or tests.
   - Report per scenario and backend: cite specific log lines, DB rows, transcript entries, or API responses for every `PASS`; provide root cause (`file:line`) and a deterministic repro for every `FAIL`; state `Could not test X because Y` for any environment block.

## Related skills

- `logging-for-agent-debugging` — when tracing request correlation IDs, rotated logs, and per-run forensic manifests
- `mechanical-guardrails` — when locking in real-storage round-trip contract tests
- `agent-retrospectives` — when auditing completed verification runs and agent self-reports
