# Page disclosure

Governing source: `.cc/graph-workflow-docs/implementation-contract.md`, charter
source-of-truth entry 1, decision 13 and its page-disclosure verification row.
The query-output-disclosure principles (entry 6) supply explicit omission facts
and exact continuations; the milestone explicitly permits unknown totals.

The root package export already points to `src/disclosure.ts`, which now owns
the implementation of `page`. It accepts only an already-paged JSON array,
snapshots that data, derives `returned` through the canonical `count` constructor,
and freezes the resulting page and omission. It neither fetches nor slices a
dataset, evaluates a loader, or invokes a continuation.

Known totals describe the matching dataset. They cannot be smaller than the
returned page, and `more: true` requires a total larger than the returned count.
A final page can contain fewer items than the dataset total; without an offset,
the helper cannot infer how many earlier rows were consumed. Empty pages are
valid, including an empty truncated page when a read continuation exists.
Unknown totals remain exactly `{ kind: "unknown" }`, even on complete pages.

Truncated pages require a real read invocation token. The registry-parser
producer's `invocationTarget` checks provenance, and the helper checks the read
effect. It retains the original immutable token, preserving filters, cursors,
selected views and rendering identity. It rejects missing, forged and mutating
continuations, and rejects continuations on complete pages. Caller-supplied
returned counts and malformed source/total/JSON shapes are refused.

The helper has no registry argument and does not replace current-CLI membership
validation. Downstream delivery/runtime consumers retain the registry-parser
document's `validateInvocation` / `rebindInvocation` responsibilities. Application
read handlers own selecting the bounded data and correct continuation cursor.
The local-pilot `local-output-policy` and remote-pilot `remote-production-cli`
tasks own exercising this public helper through production reads, as required by
this context's acceptance criteria. Artifact/binary implementation remains with
its existing downstream owner.

`tests/disclosure.test.mjs` contains 32 behavior tests using public exports and
real declarations/invocations. After correcting fixture setup, all 32 failed
against the page stub in registered run
`vrun-300de245-412d-4350-9d90-1e3eac996302`; refusal assertions failed because the
stub lacked the required validations. The implemented helper passed the same
exact-file command in `vrun-825dc73c-ee32-442a-8e8d-2de2699e4fd1` (one file matched).
Full tests, typecheck and build also passed; their settled IDs are in
`docs/implementation/page-disclosure-output.json`.

Concrete invariant checks: package.json is unchanged, private is true, runtime
and optional dependency inventories are empty, and all four export paths are
unchanged. The owner has only relative runtime imports; source inspection finds
no fetching, slicing, process IO or diagnostic suppressions. Tests retain
throwing lazy handler/policy callbacks without evaluating them. Counts and token
checks reuse their canonical owners. All changes stay in this project; no git
lifecycle action, consumer-repository write or publication was performed.
