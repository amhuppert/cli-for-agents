# Handoff: cli-for-agents

The first usable dependency-free CLI library is implemented and verified through
its public package exports, real process delivery and two executable in-repository
pilots. The package is private and unpublished. The original design proposal and
review documents remain historical; their scaffold-only and future-work statements
are superseded for this milestone by the launched implementation contract.

## Start here

| Work | Read |
| --- | --- |
| Build, test or launch a pilot | [README](README.md) |
| Add a command, context, renderer or guidance rule | [Add-a-command guide](docs/implementation/add-a-command.md), then the linked executable source |
| Change a public signature or runtime guarantee | [Public contract](docs/design/public-contract.md), [API/owner inventory](docs/implementation/api-inventory.md), matching `src` owner and `type-tests` |
| Assess delivery or reproduce compatibility evidence | [Final verification](docs/implementation/final-verification.md), [finite acceptance matrix](docs/implementation/acceptance-matrix.md) |
| Review the milestone's decisions | `.cc/graph-workflow-docs/implementation-contract.md` and `.cc/graph-workflow-docs/charter.md` in a workflow lane; [planning contract](docs/design/implementation-workflow.md) for repository provenance |

The implementation contract is source-of-truth entry 1. It fixes context families,
caller versus parsed inputs, lazy payload decoders, direct scalar writes, one
candidate arbiter, operation recovery, finite binary artifacts and bounded delivery.
The historical [review response](docs/design/contract-review-response-2026-09-13.md)
explains the rationale; it is not the current API inventory. Source signatures
remain canonical. Optional reminder evidence is supported.

## Implemented ownership

- `src/commands.ts`, `input.ts`, `results.ts`, `disclosure.ts`, `values.ts`: public
  authoring and checked values; `internal/declarations`, `input-model`, `registry`,
  `parser`, `invocations`: single declaration derivation and registration.
- `internal/local-input`, `runner-modules`, `preparations`, `execution`: local
  decode before acquisition, selected contexts, validated reports and release.
- `guidance/index.ts`: candidate evaluation/decoding; `internal/response.ts`:
  sole arbitration, envelope assembly and text projection.
- `internal/artifacts.ts`: policy and final byte-bound delivery;
  `internal/node-host.ts`: filesystem/clock/hash capabilities;
  `internal/process.ts`: actual stream writes and drain-before-exit.
- `internal/runtime.ts`: production orchestration; `internal/help.ts` and
  `references.ts`: offline help and asynchronous document checks/replacement.
- `src/testing`: runner-neutral contract cases and observations of real `runCli`.
  Domain consumers supply all seven fixture callbacks to prove their own services.

The four supported package paths are root, `/runtime`, `/guidance` and `/testing`.
The unused `internal/stub.ts` is unreachable from them. `examples/notebook` retains
intentional compile-only stubs; executable evidence comes from `local-workspace`
and `remote-service`. Source comments describing the initial scaffold are not
runtime status evidence.

## Development loop

```sh
bash scripts/worktree-init.sh
cctl validate run typecheck --scope full --queue-if-busy
cctl validate run build --scope full --queue-if-busy
cctl validate run test --scope full --queue-if-busy
```

For behavior changes, add a failing reproduction and use the registered test
command with one exact `.test.mjs` path. Confirm the assertion fails for the
missing behavior, then implement and keep the test green. Type/config-only and
documentation changes do not need a manufactured runtime red. Settle every
launched check; use CC for git lifecycle actions.

Retain all isolated positive compiler controls before negative fixtures, exact
literal inputs, public brands and the installed-package declaration checks.
Keep schemas, handlers and application transport behind lazy loaders. Return
handler data through bounded delivery. Size ceilings/import allowlists only shrink.
The architecture checks are tripwires, not a sandbox for arbitrary callbacks.

## Evidence and limits

[Final live evidence](docs/implementation/final-live-evidence.json) records full
passing typecheck/build/test IDs, all 17 test files, every public value export and
concrete invariant checks. [Compatibility records](docs/implementation/final-compatibility.json)
contain 42 actual emitted/bundled executions on Node 20.20.2, Node 24.16.0 and Bun
1.3.14. The distribution fixture stays within its 107,929-byte ratchet. Hosted CI
execution and other OS/runtime combinations are not claimed.

The local pilot proves JSON persistence with fresh readers and receipt recovery;
it does not prove SQLite or crash recovery. The remote pilot proves loopback HTTP,
local errors before requests, authoritative guidance and resumable references;
its service is a test fixture. Preparation purity, durable domain truth, transport
authentication and event-log durability remain application responsibilities.

Consumer migration and wire cutover, Commander replacement, publication/package
placement, optional transport/job/gate/identity/digest kits, plugin synchronization,
live progress, streaming artifacts, raw-output escape hatches and interactive/TTY
behavior remain outside delivered scope. No consumer repository was changed.
The copied plugins under `plugins/` remain reference material; this implementation
does not move or synchronize their upstream copies.
