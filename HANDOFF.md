# Handoff: cli-for-agents

A dependency-free private TypeScript library for command-line tools that AI agents
call. It is implemented and exercised through its public package exports, real
process delivery and two executable in-repository pilots. The package is private and
unpublished, and nothing outside this repository imports it.

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
The unused `internal/stub.ts` is a scaffold fossil, unreachable from all four.
`examples/notebook` retains intentional compile-only stubs; executable evidence
comes from `local-workspace` and `remote-service`.

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

## Invariants to retain

- Keep all isolated positive compiler controls ahead of negative fixtures, exact
  literal inputs, public brands and the installed-package declaration checks.
- Keep schemas, handlers and application transport behind lazy loaders.
- Return handler data through bounded delivery; never write to stdout or stderr
  outside `internal/process.ts`. The architecture guard enforces this.
- Size ceilings and import allowlists only shrink.
- The architecture checks are tripwires, not a sandbox for arbitrary callbacks.

## Limits

The local pilot proves JSON persistence with fresh readers and receipt recovery;
it does not prove SQLite or crash recovery. The remote pilot proves loopback HTTP,
local errors before requests, authoritative guidance and resumable references; its
service is a test fixture. Preparation purity, durable domain truth, transport
authentication and event-log durability remain application responsibilities.

Consumer migration and wire cutover, Commander replacement, publication/package
placement, optional transport/job/gate/identity/digest kits, plugin synchronization,
live progress, streaming artifacts, raw-output escape hatches and interactive/TTY
behavior remain outside delivered scope. The copied plugins under `plugins/` are
reference material; this repository does not synchronize their upstream copies.
