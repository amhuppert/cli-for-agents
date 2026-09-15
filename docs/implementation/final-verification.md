# Final verification: first usable library

Verified on 2026-09-15 against source revision
`18145f4318e192d8692bca5d01c40252e8948c6f`, plus this context's documentation-only
changes. The finite delivered matrix passes: all public runtime owners are
implemented, both actual pilots execute, process delivery drains, compiler
protections hold and installed-package boundaries pass. No runtime remediation
was required in this context. The package remains private and unpublished.

Governing source-of-truth entry 1 is
`.cc/graph-workflow-docs/implementation-contract.md`, decisions 1–15 and its finite
verification boundary. Entry 7 governs isolated compiler controls and ratchets.
Historical review-response statements that revisions remain proposals or functions
remain stubs are superseded by the launched milestone. The unchanged notebook
compile-only fixture and unused private scaffold helper are not executable pilots.

## Settled registered checks

| Command, requested/effective scope | Settled result ID | Result |
| --- | --- | --- |
| `cctl validate run typecheck --scope full --queue-if-busy` | `vrun-f35f1925-41b9-438c-90fb-a3aad5509096` | Passed, exit 0; full/full |
| `cctl validate run build --scope full --queue-if-busy` | `vrun-5dc46837-0ae1-40c0-94a5-bbce78add3b6` | Passed, exit 0; full/full |
| `cctl validate run test --scope full --queue-if-busy` | `vrun-562258d8-53e8-4da2-ad76-835d89ed4ee6` | Passed, exit 0; full/full; all 17 test files |

Each was a separate registered command. `cctl validate status <id> --json`
independently confirmed settlement; status showed no queued/running validations.
The test wrapper intentionally emits no passing TAP transcript. The structured
[live evidence](final-live-evidence.json) retains the exact finite file inventory
and status envelopes; it does not invent an aggregate assertion count.
Documentation-only updates after these checks did not change their tested source,
fixtures, compiler settings, build configuration or ratchets. No new behavior was
introduced, so no manufactured failing runtime test was needed.

### Baseline attribution

The baseline revision is `71e833195467e4b06b76a2d4a39034e969a63caa`; see
[baseline.md](baseline.md). It had throwing public stubs, compiler fixtures and
build wrappers. Its initial missing-runtime/dependency provisioning failures were
infrastructure, not proof of broken library behavior. Its subsequent passing
compiler/build checks did not prove runtime or emitted-package behavior.

This context likewise first encountered missing TypeScript before the compiler
could run. The text-mode validation refusal did not expose its run ID; that
initial attempt is not presented as test-red evidence. The existing
`scripts/worktree-init.sh` installed lockfile-pinned development dependencies with
scripts disabled. Package/lockfile were unchanged, and all three registered full
checks then passed. There is no unresolved baseline or workflow-attributed source
failure in the enumerated matrix.

Read-only comparison with the baseline confirms that runtime owners, executable
pilots, distribution/installed-declaration checks and expanded compiler controls
were introduced by this graph. This context changed documentation/evidence only.
It corrected historical pilot spellings in acceptance-matrix.md and added the two
implemented testing helpers absent from the earlier API inventory. No fixture
suppression, runtime contract change, size ceiling increase or consumer cleanup
was used to obtain a pass.

## Finite live matrix

Every family below ran in the settled full test result above. See
[acceptance-matrix.md](acceptance-matrix.md) for exact obligations and delivered
pilot route names.

| Family | Verified production behavior |
| --- | --- |
| `registry.test.mjs` | Default/derived/repeat/variadic/file inputs, strict flags, selector combinations, secret-safe references and current-registry membership |
| `disclosure.test.mjs` | True page counts, unknown totals and required read-only reveal; both pilots call public `page` |
| `execution.test.mjs` | Local/schema validation before context, direct/payload runners, pure-twin path, preparation provenance, hook/finalizer settlement |
| `help.test.mjs` | Offline projection, bounded enrichment deadline/fallback, structured graph and real reference write/check/containment |
| `guidance.test.mjs`, `response.test.mjs` | Candidate provenance/ingress, firing failures, one arbiter, conflict protocol, text/JSON projection and effect/error precedence |
| `delivery.test.mjs` | Serialized Unicode thresholds, mandatory reserves, collisions/reuse, canonical/symlink forbidden roots, finite binary identity, applied/unknown recovery after output failure |
| `runtime.test.mjs` | Public `createCli`/`runCli` wiring, policy lifetime, offline/local refusals, candidate handoff, reference validation and bounded response classes |
| `process.test.mjs` | Real children with slow readers, byte-complete multichunk stdout/stderr, callback/drain order, quiet EPIPE, non-EPIPE failures, cancellation and no mutation replay |
| `distribution.test.mjs` | Strict installed ESM/declarations, private imports refused, one-file builds, loader traces, source/import and size ratchets, actual pinned runtime execution |
| `pilots/local.test.mjs` | All 11 pilot tests: real JSON workspace, fresh-process persistence, byte-pure twins, scalar/raw inputs, grouped detail, renderer parity, exact binary bytes/hash and seven consumer callbacks |
| `pilots/remote.test.mjs` | All 21 pilot tests: actual loopback HTTP, credentials, zero requests for local invalid input, authoritative protocol, signals/disconnect, applied collision recovery and emitted continuation execution |
| `values.test.mjs`, `results.test.mjs`, `host.test.mjs`, `testkit.test.mjs`, `harness.test.mjs` | Checked constructors/JSON/effects, real/test host parity, runner-neutral cases, deliberately violating controls and exact-file harness behavior |

The child drain tests compare normal and slow-reader output byte for byte, with
responses exceeding 65,536 bytes under an explicitly larger budget. A deliberately
premature-exit control demonstrates detectable truncation. EPIPE/EIO/signal checks
observe operation/finalizer events and recovery without re-executing mutations.

The local suite runs the actual bundled executable, checks durable state from a
fresh process, compares validation state bytes and verifies exported bytes/SHA256.
The remote suite bundles the actual entry and owns a real loopback server. Applied
writes followed by a real artifact destination collision retain receipt and stop
instruction; service state and POST counts prove one commit. Emitted page/status
references are executed with their own server/workspace flags and no helper-added
connection selection. Both pilots run all seven inherited callbacks on their own
registries and real services. Children, sockets and temporary domain state settle
through the test cleanup paths.

## Public inventory and reachability

[api-inventory.md](api-inventory.md) matches every built public export: 19 root
values (17 functions, two constants), 10 runtime functions, six guidance functions
and seven testing functions. No missing or undocumented value remains. The two
callable members, family `defineCommand` and catalog `error`, also have implemented
owners. The testkit's `createContractFixtures` and `expectDisclosureParity` are
included. Public imported ESM values were enumerated independently of source text.

| Public path / helper family | Reachable implemented owners and proof |
| --- | --- |
| `createCli` and declarations/references | `retainCli` → `register`; family/declaration/input-model/invocation owners; registry/help tests and pilot registration |
| `runCli` | `runProduction` → resolve → local input/execute → collect policy/guidance → release → arbitrate → assembleResponse → deliver; runtime/execution/delivery/pilot tests |
| `main`, `nodeHost`, `createTestHost` | Lazy process and Node/test host owners; process/host/testkit tests and actual pilots |
| `runner`, `writeRunner`, `payloadRead`, `mutation` | Checked runner-module maps, lazy schema decoding and private preparation scope; execution/response tests and pilot handlers |
| Values/catalog/recovery/page/binary | Canonical values/results/disclosure/binary owners; values/results/disclosure/delivery and pilot tests |
| Help/reference/render/decode helpers | Help/reference/invocation/results owners; help/registry/response and installed ESM tests |
| Guidance functions | Checked rules and candidate evaluator/decoder; guidance/response tests and real authoritative remote service |
| Testing helpers | Actual production runtime capture, seven inherited cases, disclosure comparisons and lazy checks; testkit and both pilots |

`rg` finds no import/call of `notImplemented` outside its unused source file.
Source and actual loader traces contain no reachable scaffold-error path from the
public inventory. Declaration imports initialize no heavy builtin, schema,
handler or app transport. Offline process startup does load the allowed Node
filesystem/path/process host capabilities after entering `main`; it does not load
handler/schema/transport/testing/crypto/compile-cache modules.

## Compiler and distribution evidence

TypeScript **5.9.3**, esbuild **0.25.12**; both are lockfile-pinned development-only
dependencies. Package version remains **0.0.0**, with `private: true`, four exports
and zero runtime dependencies. The full compiler wrapper first runs unsuppressed
`result-defaults`, input, family, runner, response and delivery positive programs
in isolation, then all negative/exact-input/brand fixtures. This retains the
first-use AnyResult control against TS2589 poisoning.

The graph-introduced package-boundary test stages package.json and emitted dist
without source aliases or ambient project types. A strict NodeNext compiler with
`skipLibCheck: false` resolves all four staged declaration exports. Separate private
imports fail with exactly TS2307; Node rejects them with
`ERR_PACKAGE_PATH_NOT_EXPORTED`. This is fresh final evidence, not an assumed
pre-existing emitted-package check.

[final-compatibility.json](final-compatibility.json) records **42 actual executions**:
seven requests against emitted ESM and the bundle per runtime, including all seven
inherited cases, inspect, root/command help, version, exit-codes and a parse refusal.

| Executable | Verified version | Emitted / bundled requests |
| --- | --- | --- |
| `/Users/alex/.local/share/cli-for-agents/runtimes/node20/bin/node` (resolves to `/Users/alex/.nvm/versions/node/v20.20.2/bin/node`) | v20.20.2 | 7 / 7 passed |
| `/Users/alex/.nvm/versions/node/v24.16.0/bin/node` | v24.16.0 | 7 / 7 passed |
| `/Users/alex/.bun/bin/bun` | 1.3.14 | 7 / 7 passed |

Measurements were made on Darwin/x64. Required runtimes fail on absence/version
mismatch; none was skipped. Hosted Actions execution and Windows/Linux execution
are not claimed by this local verification.

| Bundle / guard | Measured bytes or entries | Meaning |
| --- | ---: | --- |
| Distribution single-file consumer | 107,929 bytes | Exactly the unchanged first-build ceiling; includes its inherited contract harness |
| Local workspace executable | 123,832 bytes | Actual final pilot bundle; measured separately, not governed by the smaller distribution fixture's ceiling |
| Distribution source/offline allowlist | 68 entries | Unchanged; five real Node-floor offline traces and AST inventory pass historical shrink-only checks |

The remote suite rebuilds and removes its isolated single-file executables; a
retained remote bundle-size measurement is not claimed. The default application
distribution pattern is single-file ESM; library dist itself includes modules,
declarations and maps. Historical ratchets are unchanged.

Fresh paired timing evidence is [final-idle.json](final-idle.json): nine alternating
pairs per Node version after one discarded warmup, comparing empty Node against
bundled `--version`, compile cache disabled. It includes raw samples, exact commands
and host metadata. Timings include launch/host contention, are advisory and have no
CI wall-clock threshold or cold-disk claim.

## Charter checks and delivered boundary

- **Local scope:** changed files are project documentation/evidence. Package remains
  private; no publication, consumer repository writes or git lifecycle action.
- **Dependency-free/lazy:** manifest has no runtime dependencies; distribution and
  pilot AST guards plus actual offline traces pass.
- **Single declaration:** parser/help/invocations consume the input model; strict
  generated-input and selector tests pass through public runtime/pilots.
- **Compiler controls:** isolated positives precede negatives; installed declarations
  and exact caller/brand protections pass without new suppressions.
- **Protocol preservation:** delivery/runtime/process and both pilots assert required
  guidance, reported/unknown recovery and primary domain errors through secondary
  failure; serialized byte bounds remain enforced.
- **One arbiter:** source scan finds one definition in response.ts and one call in
  runtime.ts; inherited cases observe one arbitration and conflict event.
- **Local errors first:** source execution awaits local decode before providers;
  remote malformed JSON/schema cases observe zero network requests.
- **No output bypass:** source scan finds process stdout/stderr access only in
  internal/process.ts; AST controls and child output tests pass.

README, HANDOFF and the public contract now describe implemented APIs, launch and
validation commands, and link the add-a-command guide. Documentation links, the
42-value inventory reconciliation and `git diff --check` were checked after edits.
No running validation remains.

Excluded: consumer migration or wire cutover, Commander replacement, package
publication, plugin synchronization, optional HTTP/job/gate/identity/digest kits,
live progress, streaming artifact sources, raw stdout escape hatches, interactive
prompts and ANSI/TTY behavior. The local finite JSON store is not SQLite and does
not claim crash recovery. The remote service is a deterministic loopback fixture,
not a production deployment. Application preparation purity, storage truth,
authentication, logging durability and cancellation cooperation remain application
responsibilities. These limits do not represent unresolved delivered-matrix gaps.
