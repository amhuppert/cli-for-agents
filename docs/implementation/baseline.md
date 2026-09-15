# Launch baseline

Recorded on 2026-09-14 at source revision
`71e833195467e4b06b76a2d4a39034e969a63caa`.
The only pre-existing worktree change on this resumption was this untracked
baseline document from the infrastructure-blocked attempts. No source change
was needed to obtain the passing baseline.

## Launch prerequisites

Each exact command was executed from a non-login lane zsh shell without sourcing
nvm. Resolved paths were checked with filesystem realpath.

| Runtime | Exact absolute command | Actual version | Resolved executable |
| --- | --- | --- | --- |
| Node 20 floor | `/Users/alex/.local/share/cli-for-agents/runtimes/node20/bin/node --version` | `v20.20.2` (major 20) | `/Users/alex/.nvm/versions/node/v20.20.2/bin/node` |
| Current Node | `/Users/alex/.nvm/versions/node/v24.16.0/bin/node --version` | `v24.16.0` | `/Users/alex/.nvm/versions/node/v24.16.0/bin/node` |
| Bun | `/Users/alex/.bun/bin/bun --version` | `1.3.14` | `/Users/alex/.bun/bin/bun` |

The fixed Node 20 path was initially absent (exit 127). The user explicitly
approved creating the containing runtime directory and linking `node20` to
`/Users/alex/.nvm/versions/node/v20.20.2`; that repair is complete. This was a
narrow, user-authorized infrastructure exception to worktree-only operations.
Keep the linked nvm installation available for the distribution compatibility
job. Version checks establish executability, not package compatibility execution;
that evidence belongs to distribution-guards.

`cctl validate list` confirms all three canonical commands enabled. Inspection
of committed `CommandCenter.json` and the wrappers confirms these contracts:

| Name | Cost | Canonical wrapper and scope |
| --- | --- | --- |
| typecheck | 1 | `scripts/validate/typecheck.sh`; full only, isolated positive controls before the full compiler fixture suite, 1024 MiB heap |
| build | 1 | `scripts/validate/build.sh`; full only, ESM/declarations, 1024 MiB heap |
| test | 2 | `scripts/validate/test.sh`; full/changed use the same wrapper, pathArgs paths, compile first, one test worker, 1024 MiB heaps |

The test launcher rejects directories, option tokens and escaping paths, preserves
explicit exact-file selection, and uses a finite test inventory when no paths
are supplied. Its success output is deliberately silent. The first harness
file and registered exact-file evidence belong to the next task.

`git ls-tree -r --name-only HEAD src scripts/validate package.json CommandCenter.json`
confirms the package, all four entry points, configuration and compiler/test
wrappers are committed and visible in this lane. These live checks supersede
the governing contract's historical observations that registration was empty
and the scaffold uncommitted. There are no direct predecessor contexts.

## Compiler/build results and attribution

All runs used the registered commands with `--scope full --queue-if-busy`.

| Command | Settled run ID | Result |
| --- | --- | --- |
| typecheck, first attempt | `vrun-25c79e02-da89-4b7d-ade6-f11bd327801b` | Failed, exit 1: missing TypeScript package in the lane |
| build, first attempt | `vrun-7e9878b1-fdc0-4f1f-9c65-c0b9745dcc75` | Failed, exit 1: missing `node_modules/typescript/bin/tsc` |
| typecheck, after initialization | `vrun-0dbe1f8d-16ab-4b44-97a1-d3c7640faf9a` | Passed, exit 0, full → full |
| build, after initialization | `vrun-b53cc2b7-de99-424a-862f-c563f516f41c` | Passed, exit 0, full → full |

The first failures are attributable to absent lane development dependencies,
not compiler diagnostics in source. Running the existing
`bash scripts/worktree-init.sh` installed the lockfile-pinned TypeScript 5.9.3
with scripts disabled. Package and lockfile were unchanged. Both registered
checks then passed; `cctl validate status <run-id> --json` independently confirmed
their settled results. No launched check remains pending. No pre-existing
source/compiler/build failure remains after initialization.

## Public function-value inventory

All 30 public function values currently delegate to `notImplemented()`:

| Package export | Function values | Source owners |
| --- | --- | --- |
| `cli-for-agents` | `bytes`, `count`, `milliseconds`, `id`; `defineCommand`, `defineFlow`, `defineGroup`, `invocation`, `mutation`, `validationInvocation`; `defineErrors`; `page` | `src/values.ts`, `src/commands.ts`, `src/results.ts`, `src/disclosure.ts`, re-exported by `src/index.ts` |
| `cli-for-agents/runtime` | `createCli`, `runCli`, `main`, `helpNode`, `commandReference`, `decodeEnvelope`, `renderInvocation` | `src/runtime/index.ts` |
| `cli-for-agents/guidance` | `hint`, `instruction`, `defineReminderRule`, `defineSteering`, `evaluateGuidance`, `decodeEvaluatedGuidance` | `src/guidance/index.ts` |
| `cli-for-agents/testing` | `createTestHost`, `runForTest`, `contractTests`, `expectBounded`, `expectLazy` | `src/testing/index.ts` |

Four additional internal functions call the stub: `execute` in
`src/internal/execution.ts`, `register` and `resolve` in
`src/internal/registry.ts`, and `deliver` in `src/internal/response.ts`.
`src/internal/stub.ts` defines `notImplemented`. The ten caller modules import
that helper; there are 34 call sites in total. This inventory describes the
baseline only and must not become a test that implementations remain stubs.

## Scope and invariant checks

- `local-scope`: `git status --short` shows only `docs/implementation/` untracked;
  `git diff --exit-code` confirms tracked files are unchanged. Package remains
  private; no consumer repository or git lifecycle action was involved. The
  external runtime link was explicitly authorized by the user.
- `dependency-free-kernel`: `package.json` has `private: true` and no runtime
  dependencies. Source value-import inspection (`rg -n '^import (?!type)' src
  --pcre2`) finds only the internal throwing stub helper, with no eager builtin,
  schema, handler or application transport imports.
- `compiler-controls-intact`: full registered typecheck passes, including the
  isolated positive-only program before negative fixtures. Source, fixtures,
  TypeScript settings, exports and wrappers are unchanged. The helper has 34
  calls in ten caller modules (`rg -n 'return notImplemented\(' src`).

This task is documentation and environment initialization only, with no new
runtime behavior to pin, so test-first does not apply. Governing source:
`.cc/graph-workflow-docs/implementation-contract.md`, decisions 1, 14 and 15,
and "Validation and launch preparation".
