# Finite implementation acceptance matrix

This is the bounded verification inventory for the first usable library, derived
from `.cc/graph-workflow-docs/implementation-contract.md`, "Verification matrix
and evidence owners", its governing decisions, and the live local-pilot and
remote-pilot task contracts. Source revision:
`71e833195467e4b06b76a2d4a39034e969a63caa` (2026-09-14).

Final live verification on 2026-09-15 passed every family below through full
registered run `vrun-562258d8-53e8-4da2-ad76-835d89ed4ee6`. The executable
routes below now use delivered spellings. See [live evidence](final-live-evidence.json)
for settled compiler/build/test records, the public inventory and regenerated
compatibility results. The original baseline remains [baseline.md](baseline.md).

## Named runtime families and production wiring

Run each family through `cctl validate run test --queue-if-busy -- <exact-file>`.
Use one actual `.test.mjs` file in each TDD loop, never a directory. Public
composition and pilot tests import built ESM through package exports. Before
composition exists, an internal-owner test may import its built internal file;
this creates no supported public deep import.

| Surface and finite proof obligation | Exact test family | Implementation owner | Production caller / integration owner |
| --- | --- | --- | --- |
| Built ESM imports; temporary directory cleanup after success and rejection; one explicitly requested test file | `tests/harness.test.mjs` | baseline-harness | baseline-harness; retained registered-run metadata proves scope despite silent stdout |
| Page counts, unknown totals and read-only continuation on cut pages | `tests/disclosure.test.mjs` | page-disclosure | page-disclosure uses real invocation tokens; local-pilot and remote-pilot exercise the helper in production reads |
| Derived/default/repeat/variadic/file inputs, unknown flags, selector sets, generated-name collisions and secrets | `tests/registry.test.mjs` | registry-parser | runtime-composition |
| Lazy local decoder; read payload; shared prepare/twin/commit; token provenance; none/acquire/release on success, failure and cancellation | `tests/execution.test.mjs` | execution-lifecycle | runtime-composition, including post-operation guidance/artifact-policy hook before release |
| Offline help; one bounded live-help deadline and static fallback; graph/reference validation and reference `--check` | `tests/help.test.mjs` | help-reference | runtime-composition wires help; help-reference owns the asynchronous reference-check tool and documentation-root checks |
| Candidate provenance, authoritative decoding and firing sink failures | `tests/guidance.test.mjs` | guidance-candidates | response-assembly consumes candidates; runtime-composition supplies providers |
| One arbiter, handler/local/remote candidates, instruction conflicts, diagnostics, text/JSON projections and effect/recovery preservation | `tests/response.test.mjs` | response-assembly | response-assembly; runtime-composition supplies providers |
| Serialized UTF-8 thresholds, mandatory-field reserves, collision/reuse, symlinks/forbidden roots, finite binary identity, delivery failure after applied writes | `tests/delivery.test.mjs` | artifact-delivery | runtime-composition resolves app-dependent policy before release and invokes bounded delivery |
| Stream drain, EPIPE versus other write errors, output/exit behavior and offline imports | `tests/process.test.mjs` | process-adapter | process-adapter drives real child processes |
| Export privacy, eager-import allowlist, startup modules, first-build size ratchet, bundled Node 20/current Node/Bun execution | `tests/distribution.test.mjs` | distribution-guards | distribution-guards, using the exact runtime paths recorded in baseline.md |
| Real temporary JSON store, payload read/write/twin, contexts, grouped detail, durable state and artifact/binary output | `tests/pilots/local.test.mjs` | local-pilot | local-pilot drives the executable and inherited contract cases |
| Real loopback transport, credentials, authoritative guidance, wait/cancel/disconnect, continuation and applied-mutation recovery | `tests/pilots/remote.test.mjs` | remote-pilot | remote-pilot drives the executable, test-owned service and inherited contract cases |

Kernel-values owns validated values/results used by these families; node-host
owns bounded file/stdin, canonical paths, clock/sleep, atomic files, hashing and
the injectable test host. Consumer-testkit owns runner-neutral inherited cases
and the typed disclosure-exception inventory; both pilots must invoke those
cases on their actual CLIs. These supporting owners do not replace the named
production-caller evidence above.

## Executable pilot command paths

The local entry is `examples/local-workspace/main.mjs`; its registered pilot test
builds `.cc/temp/local-pilot/bundle/workspace.mjs`. The remote entry is
`examples/remote-service/cli.mjs`; its registered pilot test builds an isolated
single-file executable for each test and closes the loopback service afterward.
The following are the actual routes verified through those executables.

| Fixture root | Command path | Required live evidence | Wiring task / context |
| --- | --- | --- | --- |
| `examples/local-workspace` | `init`, `doctor` | `requires: none`; initialization without acquired app state | local-fixture / local-pilot |
| `examples/local-workspace` | `query`, `show` | Bounded page helper; unknown totals/read continuation; defaulted/repeatable/variadic and derived search inputs; combined detail selectors; custom text/JSON renderer parity | local-fixture / local-pilot |
| `examples/local-workspace` | `answer-check` | Structured payload read decoded locally; no validation twin | local-fixture / local-pilot |
| `examples/local-workspace` | `claim validate`, `claim apply` | Shared preparation; twin leaves durable state unchanged; mutation receipt visible to a fresh process | local-fixture / local-pilot |
| `examples/local-workspace` | `update` | Direct scalar write; required title with exclusive derived title-file input | local-fixture / local-pilot |
| `examples/local-workspace` | `ingest` | Raw file and stdin ingestion; exclusive stdin ownership across selected sources | local-fixture / local-pilot |
| `examples/local-workspace` | `export` | Finite byte export, explicit `--out`, true byte/hash identity and runtime-resolved artifact policy | local-fixture / local-pilot |
| `examples/remote-service` | `doctor`, `schema` | Context-free operation with server down; offline help; local malformed-input refusal before requests | remote-fixture / remote-pilot |
| `examples/remote-service` | `list`, `show` | Bounded page helper, declared credentials/globals, authoritative candidates plus local/handler guidance; required instruction survives spill | remote-fixture / remote-pilot |
| `examples/remote-service` | `apply`, `validate` | Structured mutation; schema rejection before network; applied receipt survives artifact failure without replay | remote-fixture / remote-pilot |
| `examples/remote-service` | `wait`, `status` | Injected-clock wait, cancellation and real disconnect preserve doctor plus cursor continuation | remote-fixture / remote-pilot |

The executable validations are exactly:

```sh
cctl validate run test --queue-if-busy -- tests/pilots/local.test.mjs
cctl validate run test --queue-if-busy -- tests/pilots/remote.test.mjs
```

`local-live-tests` owns fresh-process store assertions, inherited cases,
renderer parity, forbidden dataset roots and binary identity. `remote-live-tests`
owns real requests, token rejection, pre-network schema rejection and protocol
conflict/spill; `remote-recovery-tests` extends the same remote file with waits,
disconnect and applied-state inspection without replay. Remote transport stays
in the lazy application module; tests own and clean up listeners and children.
The local pilot is JSON-backed, not SQLite. Neither pilot is a consumer migration.

## Retained compiler fixtures and authorized revisions

Run `cctl validate run typecheck --scope full --queue-if-busy`. The canonical
wrapper first compiles `type-tests/result-defaults.ts` in a fresh positive-only
TypeScript program via `scripts/validate/result-defaults.mjs`, then runs the full
project compiler. Do not combine those phases, suppress positive diagnostics or
substitute a runtime stub test. The original five fixture files are mapped below; additional family/runner/response/delivery
positive controls run in separate compiler programs before the full fixture set:

| Existing fixture | Retained protection / charter invariant | Revision and verification owners |
| --- | --- | --- |
| `type-tests/result-defaults.ts` | Unsuppressed first-use AnyResult positive prevents TS2589 poisoning; DTO interfaces widen to anchored Any* slots; recursive JSON and contextual handlers remain usable. `compiler-controls-intact`. | runner-response-contracts revises type names/shapes; baseline-harness and final-verification retain the isolated check |
| `type-tests/results.ts` | DTO interfaces and pages work without index signatures/casts; functions/bigint/undefined are rejected as JSON; success cannot claim unknown effect; payload forms are exclusive; artifact paths and byte/count brands cannot be forged/mixed. `compiler-controls-intact`, `protocol-preservation`. | runner-response-contracts; final-verification |
| `type-tests/literal-arguments.ts` | Literal argument inventories reject widened names and variable-held unknown keys. `compiler-controls-intact`, `single-declaration-derivation`. | input-family-contracts; final-verification |
| `type-tests/generated-inputs.ts` | Generated file/twin/level/output eligibility, exact example/invocation shapes, read-only twins, compatible context providers, exhaustive lazy level runners, complete prepare/commit pairing and doctor registration. `compiler-controls-intact`, `single-declaration-derivation`, `local-errors-first`. | input-family-contracts owns caller/handler/family revisions; runner-response-contracts owns lazy decoders/runners/recovery; final-verification |
| `type-tests/adversarial.ts` | ID domains, exact flags/args/top-level keys even through variables, secret exclusion, reserved/open inventories, prepared-token brands, guidance construction/tier exclusion, required sinks, JSON/result discrimination, read-only drill-down, units and hidden brand export. `compiler-controls-intact`; supports canonical constructors, single arbiter and export privacy. | input-family-contracts and runner-response-contracts retain matching constraints through revisions; final-verification |

Retain the invariant, not obsolete scaffold syntax. Governing decisions 2–6 and
8–9 explicitly replace the old factory with context families, separate caller
and parsed inputs, permit decoded read payloads, require lazy decoders, support
direct scalar writes, centralize registered doctor invocation (including nested
paths), and arbitrate candidate guidance once. Thus the old blanket read-payload
ban, exact `doctor` path restriction, handler-owned payload decoding and old
factory spelling are not frozen acceptance requirements. The old default-level
`--out` restriction also needs the finite binary exception from decision 12.
Fixtures must be revised meaningfully against those decisions, without deleting
literal/brand controls or restoring recursive `JsonData<JsonValue>` defaults.

## Final evidence boundary

Final-verification checks the named families, executable pilots, inherited cases,
compiler controls and recorded runtime compatibility evidence. It owns failures
introduced on these delivered surfaces, with attribution to the baseline;
unrelated historical defects and consumer repositories remain outside scope.
Source inspection or package imports alone cannot discharge process, persistence,
transport or runtime-compatibility obligations. Version checks alone likewise do
not prove a bundle runs on those runtimes. Bundle-size ratchets are established
at the first real build and only decrease; timing remains advisory.

Throughout, the package remains private and has no runtime package dependencies.
Declaration imports must remain free of eager heavy builtins, schemas, handlers
and application transport. No publication, consumer cutover, streaming source,
live progress, raw-output bypass or plugin synchronization is included.
