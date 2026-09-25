# Handoff: cli-for-agents

A dependency-free private TypeScript library for command-line tools that AI agents
call. It is implemented and exercised through its public package exports, real
process delivery and two executable in-repository pilots. The package is private and
unpublished; the author's own book-ingest and Command Center projects consume fresh
local snapshots through yalc (see the README), and are migrated in their own rollouts
([consumer migration guide](docs/implementation/consumer-migration.md)).

## Start here

| Work | Read |
| --- | --- |
| Understand what this code is built for, and what it will never meet | [ENVELOPE](ENVELOPE.md) |
| Build, test or launch a pilot | [README](README.md) |
| Add a command, context, renderer or guidance rule | [Add-a-command guide](docs/implementation/add-a-command.md), then the linked executable source |
| Change a public signature or runtime guarantee | [Public contract](docs/design/public-contract.md), [API/owner inventory](docs/implementation/api-inventory.md), matching `src` owner and `type-tests` |
| Change the packaging, bundle or runtime matrix | [Distribution guards](docs/implementation/distribution-guards.md) |
| Write tests against a CLI built on this library | [Consumer testkit](docs/implementation/consumer-testkit.md) |

Read `ENVELOPE.md` before adding any mechanism. Source signatures are canonical;
the documents above describe them, they do not replace them. The original design
proposal in `docs/design/` preserves provenance only — its scaffold-only status and
proposed API spellings are historical.

## Implemented ownership

- `src/commands.ts`, `input.ts`, `results.ts`, `disclosure.ts`, `values.ts`: public
  authoring and checked values; `internal/declarations`, `input-model`, `registry`,
  `parser`, `invocations`: single declaration derivation and registration.
- `internal/local-input`, `runner-modules`, `execution`: local decode before
  acquisition, selected contexts, validated reports and release.
- `guidance/index.ts`: candidate evaluation; `internal/response.ts`:
  sole arbitration, envelope assembly and text projection.
- `internal/artifacts.ts`: policy capture, on-demand directory preparation, spill
  metadata and final byte-bound delivery; `internal/node-host.ts`:
  filesystem/directory/clock/hash capabilities;
  `internal/process.ts`: actual stream writes and drain-before-exit.
- `internal/runtime.ts`: production orchestration; `internal/invocations.ts`:
  canonical references and the generated post-validation write hint;
  `internal/help.ts` and `references.ts`: offline help, reference selection and
  asynchronous document checks/replacement with size reports.
- `scripts/prepack.mjs`: rebuilds `dist` from source before every pack or yalc
  publication; `tests/packaging.test.mjs` proves it against real archives.
- `src/testing`: runner-neutral contract cases and observations of real `runCli`.
  Domain consumers supply all seven fixture callbacks to prove their own services.

The four supported package paths are root, `/runtime`, `/guidance` and `/testing`.
`examples/notebook` retains intentional compile-only stubs; executable evidence
comes from `local-workspace` and `remote-service`.

## Development loop

```sh
bash scripts/worktree-init.sh
cctl validate run typecheck --scope full --queue-if-busy
cctl validate run build --scope full --queue-if-busy
cctl validate run test --scope full --queue-if-busy
```

`typecheck`, `build` and `test` all gate a merge, so a red suite blocks the change
that broke it rather than being discovered commits later.

For behavior changes, add a failing reproduction and use the registered test
command with one exact `.test.mjs` path. Confirm the assertion fails for the
missing behavior, then implement and keep the test green. Type/config-only and
documentation changes do not need a manufactured runtime red. Settle every
launched check; use CC for git lifecycle actions.

## Invariants to retain

- Keep all isolated positive compiler controls ahead of negative fixtures, exact
  literal inputs, public brands and the installed-package declaration checks.
- Keep schemas, handlers and application transport behind lazy loaders.
- Return handler data through bounded delivery; never write to stdout or stderr
  outside `internal/process.ts`. The architecture guard enforces this.
- A new eager module must be declared in `scripts/distribution/baseline.json`, never
  absorbed by spare bundle headroom. Raising the size ceiling is allowed when a
  change earns the bytes; do it as its own reviewable line.
- The architecture checks are tripwires, not a sandbox for arbitrary callbacks.

## Limits

The local pilot proves JSON persistence with fresh readers and receipt recovery;
it does not prove SQLite or crash recovery. The remote pilot proves loopback HTTP,
local errors before requests, rule guidance and resumable references; its
service is a test fixture. Preparation purity, durable domain truth, transport
authentication and event-log durability remain application responsibilities.

Consumer migration and wire cutover, Commander replacement, registry publication,
commit/build provenance stamps, optional transport/job/gate/identity/digest kits, plugin synchronization,
live progress, streaming artifacts, raw-output escape hatches and interactive/TTY
behavior remain outside delivered scope. The copied plugins under `plugins/` are
reference material; this repository does not synchronize their upstream copies.
