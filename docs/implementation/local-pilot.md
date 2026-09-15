# Local workspace executable evidence

## Delivered consumer

`examples/local-workspace/README.md` documents setup, all commands, artifact
configuration and finite-store limits. `tests/pilots/local.test.mjs` bundles the
consumer through development-only esbuild into the git-ignored
`.cc/temp/local-pilot/bundle/workspace.mjs`. Each CLI request starts a fresh Node
process. A copied bundle also executes from a temporary directory.

The consumer imports only public package exports. Declarations bind a typed
`workspace` service once. Store, schemas, handlers and contract fixtures load
lazily. Bootstrap and doctor require `none`; production reads and mutations
acquire the JSON store after input decoding. No original notebook scaffold,
consumer repository, package privacy setting or runtime dependency was changed.

## Acceptance matrix

| Criterion | Concrete evidence |
| --- | --- |
| local-production-cli | Actual Node child processes execute the single-file bundle. `init` creates a temporary JSON store; a copied bundle opens it in another process. |
| local-command-matrix | Init/doctor without app, default two-row query, repeated tags, variadic terms, inline/derived-file/stdin sources, structured answer-check, generated claim validation twin, claim apply, scalar update, raw ingestion, grouped context/full selectors and finite binary export. |
| local-durable-effects | Compare state-file bytes before/after validation; apply assigns receipt `r1` under the writer lock; fresh show and answer-check observe it. Delivery-failure inspection observes one receipt without replaying the write. |
| local-output-policy | Production query calls public `page` with unknown total and typed exact continuation. Compare actual text and JSON projections for both custom renderers. Resolve artifact directory from the acquired workspace, refuse canonical/symlink dataset roots and escaping destination ancestors, and compare binary bytes, count and SHA256 independently. All child responses are checked against 8192 UTF-8 bytes. |

## Seven inherited scenarios

`contracts.fixture.ts` supplies every `ContractFixtures` callback to public
`contractTests`. The executable `contracts --json` runs the whole inventory and
returns its passed names through normal bounded `main` delivery. A direct callback
run preserves named assertion failures for diagnosis. None of the six domain
scenarios delegates to the testkit's canonical in-memory controls.

- **offline-paths**: Traverse this registry's public help projection and execute
  help, version, exit codes and refusal in both formats. Assert no lazy handler
  loads or context acquisitions through runtime observations.
- **schema-issue-survival**: Pass a real invalid payload file to claim apply with
  an absent workspace. Preserve the exact issue/path before service acquisition.
- **single-guidance-arbitration**: Commit a real claim and inject a policy provider
  with a conflicting instruction. Observe one arbitration, one conflict, firing
  events, retained instructions and failed JSON/text responses.
- **unknown-totals**: Read this workspace's first page through production query;
  retain unknown total, returned count and its exact typed query continuation.
- **shell-safe-references**: Production query's hint carries a query containing
  spaces, quotes and shell metacharacters. Inherited decoding verifies token
  boundaries independently of the renderer.
- **unicode-spill**: Ingest a body sized so production full-show JSON is exactly
  8192 bytes; add one astral character and read the full spilled response from the
  real artifact file, comparing every byte with the expected original envelope.
- **operation-recovery**: Real claim commit plus injected artifact-write failure
  in both formats. A separate service acquisition reads the saved claim; inherited
  checks retain receipt, applied effect and required instruction. A separate
  fresh-process test uses a missing output directory to exercise this failure
  through the executable and verifies domain-error precedence on a failed read.

## Public testkit type repair

These scenarios exposed a compile-time mismatch: `TestRunOptions.host` required
`TestHost`, though runtime capture uses only `Host`. It now accepts `Host`, covering
both real nodeHost and in-memory test hosts without forged brands or casts.
`type-tests/local-pilot.ts` is the positive consumer control. This is a type-only
change; no testkit execution code changed. The failing full compiler output
reported the Host/TestHost incompatibility before repair; the compiler now passes.

## Red/green and validation

The initial exact-file test failed on the missing `init` route after restoring
locked development dependencies. The expanded test failed on the missing
`contracts` route before that command was implemented. Intermediate fixture errors
included the missing applied recovery references, nonexistent artifact directory,
a canonical-path assertion and a shadowed recovery-helper variable; focused tests
and the full compiler drove those repairs. The initial missing-TypeScript setup
failure is not counted as a behavior-level red test.

Settled validation IDs and the bounded artifact inventory are recorded in
`local-pilot-output.json`. The focused suite has 11 tests. No tests skip assertions
or suppress unexpected diagnostics; no size/import ratchet was raised.

## Charter verification and limits

- **local-scope**: Changes are in this project; package remains private. No git
  lifecycle actions, publication or consumer migration were performed.
- **dependency-free-kernel**: Package has zero runtime dependencies. Static checks
  verify no heavy builtin or eager handler/schema/store import in declarations;
  only public package paths are used by the pilot. The testkit change is erased
  from runtime JavaScript.
- **protocol-preservation**: Inherited JSON/text artifact-failure cases and a fresh
  process mutation retain instruction, applied effect and real receipt. The live
  failed-read case retains NODE_MISSING with secondary KERNEL_OUTPUT.
- **no-output-bypass**: All handlers/renderers/contract fixtures are checked for
  direct process/console/stream output. Only public main emits the executable
  response; every observed child response is bounded.

Source-of-truth entry 1, implementation-contract decisions 2–8 and 11–15, governs
contexts, source/twin semantics, renderer parity, protocol preservation, canonical
artifact policy, real/injected hosts and inherited cases. Entry 6 governs page
handles, unknown totals and exact continuations.

This finite JSON pilot has a 2 MiB store limit, UTF-8 ingestion and exclusive
writer locking with atomic replacement. It does not claim SQLite, crash recovery,
a migrated kb consumer or publication. A killed writer may leave a lock/pending
file requiring inspection, as documented in the consumer README.
