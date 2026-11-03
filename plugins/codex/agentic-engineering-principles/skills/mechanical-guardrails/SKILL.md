---
name: mechanical-guardrails
description: Convert recurring prose guidelines into structural guardrails—API
  deletion, unrepresentable type states, shrink-only ratchets, symbol-marker
  coverage tests, checked-in budgets, declare-or-fail registries, derived
  artifacts, and real-storage round-trip tests. Use when agents or developers
  repeatedly violate documented conventions, when migrating off legacy APIs, or
  when enforcing architectural invariants.
---

# Mechanical Guardrails

Agents forget prose guidelines under context pressure. When a convention matters, enforce it at the highest feasible rung of the ladder so violations fail at authoring time. Rule of thumb: **if you have written the same review comment three times, you are at least one rung too low.**

## The enforcement ladder

| Rung | Mechanism | Fails when |
|---|---|---|
| 1 | Prose guideline or docstring | Agent did not load it or forgot under context pressure |
| 2 | Code review vigilance | Violation is invisible at the call site |
| 3 | Lint rule with allowlist | Allowlist grows as a pressure valve |
| 4 | Shrink-only ratchet | Someone raises the ceiling to pass CI |
| 5 | Type-level impossibility | Escape hatch (`unknown` cast, overload) re-admits the shape |
| 6 | Deleting the operation | Cannot rot — nothing left to call |

**Pair every guardrail above rung 2 with a one-line `why:`.** Site the reason where the rule fires (lint error, type hover, refusal, `CODEOWNERS` comment) and assert the invariant's value rather than apologizing (`designed-friction`), so agents with config authority do not remove the guardrail as an accidental obstacle:

```
no-restricted-imports: reach for the focused accessor.
  why: whole-state reads land on request paths and cost hundreds of ms.
```

## Structural mechanisms

### 1. Delete the foot-gun (Rung 6)

When migrating off a dangerous or expensive API, convention and lint allowlists refill as long as the API stays public:

1. Migrate all legitimate callers to focused replacements.
2. Isolate at most one remaining consumer in a private module (unexported from public barrels or shared objects), gated by `no-restricted-imports` with a written reason per entry. When using flat lint configs where per-file blocks replace rather than merge rules, define the restriction as a shared constant and spread it into every overlapping block.
3. Delete the public API and its dead machinery (use test-only fixtures unimportable by production code if needed). Rewrite spy-based tests into real-storage behavior tests.
4. Keep the lint rule with an **empty allowlist** as a permanent tripwire.

### 2. Make illegal states unrepresentable in types (Rung 5)

Move constraints into type signatures so violations fail to compile:

- Type lock-held callbacks as synchronous `(state) => Result` (never returning a promise) so callers cannot `await` slow work inside a critical section.
- Return inert data (`{ events, pushes }`) from transaction callbacks so broadcasts happen at the seam after commit rather than mid-transaction.
- Pin every type constraint with an expected-to-fail **type-error fixture test** and audit wrappers/overloads so future edits cannot silently widen the signature.

### 3. Shrink-only ratchets (Rung 4)

Record the current count of a legacy pattern (call sites, selectors, seam violations, async-to-sync migrations) as checked-in data that may only decrease:

- Never raise a ceiling to go green; either migrate the new call site or record an approved exception with an explicit deletion condition.
- Make failure messages state what to migrate to and where exceptions are registered. Keep the ratchet at `0` as a permanent tripwire.

### 4. Coverage assertions for invisible conventions

When compliance is invisible at the call site (route tracing wrappers, event-publication seams, repository contract tests, command help registration):

1. Have the wrapper stamp a non-enumerable `Symbol` marker on its return value.
2. Write an architecture test that globs every candidate module, iterates exports, and asserts the marker.
3. Prove the test red against an intentionally unwrapped fixture.

### 5. Checked-in performance and size budgets

Store ceilings (route p95, lock hold time, storage-read latency, row/payload/bundle size) in version-controlled data files alongside numeric convention rules (e.g., flagging async-accepted responses that take > 1s). Run advisory (`exit 0`) to calibrate against real traffic before enabling non-zero gating.

### 6. Declare-or-fail registries for latent defect classes

For recurring structural risks (e.g., unbounded arrays/maps inside single-column serialized blobs, schemas skipping production validation, restricted imports), enumerate every instance automatically and require an exact-key typed discharge. For persisted collections, use:

- `not-persisted` — dropped on write (cross-checked against durability policy).
- `normalized: <table>` — stored in its own child table.
- `pruned: <where>` — evicted to a bounded working set by named code.
- `bounded: <why>` — capped by construction (fixed shape, config-keyed map).
- `tracked: <item>` — still unbounded, naming the planned structural fix so the gate can ship immediately.

Default to exact key matching (allow subtree wildcards only when all descendants are bounded) and **fail on stale keys** that match nothing in the current schema.

For schemas allowed to skip production validation, require proof that each is free of defaults and transforms; skipping parsing must not change the resulting data.

### 7. Derived artifacts and real-storage round-trip tests

- **Derive shared facts from one typed registry** (help text, flag allowlists, parser boolean sets, top-level usage, group dispatch, skill-doc command tables) and guard with a contract test (`progressive-disclosure-tooling`).
- **Maximal round-trip contract tests.** Give every persisted shape a write → cold-reader reload → assert test against the **real** storage layer (never in-memory fakes) with every optional and nested field populated. Extend the fixture for every new persisted field/table, list intentionally non-persisted fields in a cross-checked policy, and assert cache invalidation on cascading deletes.

## Rollout sequence

1. Name the defect class and the real incident that earned the guardrail.
2. Pick the highest feasible rung and **prove the check red** against a violating fixture.
3. Calibrate in advisory mode or baseline existing instances via a ratchet ceiling or `tracked:` discharges.
4. State the `why:`, the replacement pattern, and the exception path in the failure message.
5. **Prove the remedy.** Clear the violating fixture using only real caller operations (and verify a human-facing UI/CLI control exists if clearing requires a human act), ensuring the guardrail is not an inescapable deadlock.

## Related skills

- `designed-friction` — when writing refusal rationale and separating human-only design boundaries from missing-surface defects
- `progressive-disclosure-tooling` — when deriving CLI help, parsers, and docs from a single typed registry
- `earned-guidance-docs` — when deciding whether a lesson belongs in a structural check or a guidance doc
- `live-system-verification` — when verifying persistence round-trips and real-system behavior
- `agent-offloading` — when moving checks from prompts into deterministic code
- `cli-tools-for-agents` — when exposing gate rules via preflight commands
