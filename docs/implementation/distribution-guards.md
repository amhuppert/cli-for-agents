# Distribution guards

## Package and executable consumer

`tests/distribution.test.mjs` stages only package.json and the declared dist payload
in an isolated consumer installation. A differently named consumer package.json
ends repository self-name resolution. TypeScript's imported module symbols and
Node's import.meta.resolve must point into the staged installation for every
public export. A strict NodeNext TypeScript program checks
all four public exports with skipLibCheck disabled and no ambient project types.
Separate negative programs require exactly TS2307 on each private import; real ESM
imports require ERR_PACKAGE_PATH_NOT_EXPORTED for the same private paths.

Development-only esbuild 0.25.12 bundles the consumer to one executable ESM file,
with deterministic minification, Node 20 target, no source map or split chunks.
The test compares two builds byte for byte, checks that only builtin imports remain,
and runs a copied file without adjacent sources. The fixture's inspect and contracts
commands use public main for bounded output. The contracts command invokes all seven
inherited cases; the offline case targets its own registry and the other six are
canonical runtime controls, as documented by the upstream testkit. These are not
claims about downstream pilot domain/transport behavior.

Lazy bindings snapshot `(await import('./handler.mjs')).default` into
`{ default: value }`. The runtime reads the module's `default` export directly, so
esbuild's accessor-backed namespaces work either way; the snapshot only keeps the
consumer's declaration module free of a static handler import.

Run locally through registered validation:

```
cctl validate run test --queue-if-busy -- tests/distribution.test.mjs
```

## Packed consumers and local publication

`tests/packaging.test.mjs` exercises the real package lifecycle rather than copying
the worktree's `dist`. Each run copies the producer's `src`, package and lock
files, TypeScript configs, `scripts/prepack.mjs` and the build wrapper into a
fresh root under `.cc/temp/packaging/`, links the installed development
dependencies, and never touches the worktree's own `dist` or the user's global
yalc store. npm runs with an isolated cache, offline.

- `npm pack --json --pack-destination` runs from a missing `dist` and from a
  poisoned one that includes an obsolete emitted file. The `prepack` hook deletes
  `dist` and rebuilds it through `scripts/validate/build.sh`, so the archive holds
  fresh exports, no obsolete file and nothing outside `dist` but `package.json`.
- The real archive is extracted into a separately named consumer's
  `node_modules/cli-for-agents`. A strict NodeNext program with
  `exactOptionalPropertyTypes`, no `paths`/`baseUrl` alias and explicitly linked
  Zod, `@standard-schema/spec` and `@types/node` compiles direct Zod and official
  Standard Schema assignments, previews, the Host capability and reference types;
  TypeScript must resolve every `cli-for-agents` import inside the archive, and no
  shipped declaration names a development-only package. A subprocess imports the
  four public entries and is refused private paths. A packed CLI validates a
  preview and spills into a missing artifact directory, which the kernel creates.
- The pinned `node_modules/yalc` executable publishes with
  `publish --private --scripts --store-folder <fixture-store>`. The stored package
  is fresh; a consumer adds it, installs offline and sees a source marker; a second
  publication with a changed marker reaches the consumer through `yalc update`.
  A compile error with stale `dist` present makes both `npm pack` and
  `yalc publish` fail, creates no archive, and leaves the earlier stored snapshot
  and the consumer's installation intact.

yalc 1.0.0-pre.53 runs `prepack` before copying only when scripts are enabled;
`publish` defaults them on and `push` defaults them off, so the documented
workflow passes `--scripts` explicitly and avoids bare `push`. TypeScript, esbuild,
`@types/node`, Zod, `@standard-schema/spec` and yalc are development dependencies;
the package keeps zero runtime dependencies.

`scripts/distribution/bundle.mjs` is the reusable bundle entry point (requires an
existing emitted dist). `.github/workflows/distribution.yml` provisions all three
pinned runtimes before calling `scripts/distribution/ci.sh`, which uses the canonical
validation wrapper in standalone CI without a CC server. The exact runtime pins
and local executable defaults live in `scripts/distribution/runtimes.json`.
Explicit environment overrides allow provisioned CI locations; the major version
must match the pin. Missing executables and mismatched majors fail; no skips.
CI configuration has been authored here; a hosted Actions run is not claimed.

## What the guards assert

Package/bundle tests execute the pinned runtimes in `runtimes.json` at their exact
absolute paths, running all seven inherited contract cases, an ordinary read, a
shebang invocation, help, version, exit-codes and a parse refusal on each. They
also assert that the package stays private, exposes exactly four exports and
carries zero runtime dependencies, that every lockfile package is development-only,
and that fixture handlers reach stdout only through public `main`.

## Startup and size guards

`scripts/distribution/baseline.json` holds a **size budget of 110,592 bytes**
(108 KiB) for the single-file bundle, including the lazy inherited contract
harness, alongside the measured source/offline module allowlist. It was raised
from 104,448 bytes when cli-for-agents#3 grew the measured bundle from 102,051 to
107,149 bytes (+5,098) with on-demand artifact directories, validation previews and
generated write hints, spill metadata, reference selection and parity diagnostics;
the eager allowlist did not change. The budget is not
a ratchet: a change that earns its bytes raises the ceiling in that file, as one
line visible in the diff. Its job is catching gross regressions, not policing
every byte — the allowlist is the guard that protects startup, and it admits a new
eager module only when the baseline records it on purpose. Spare byte headroom can
never hide one.

An earlier revision enforced a downward-only ceiling by reading every historical
version of `baseline.json` from git. It deadlocked: four feature commits pushed the
bundle past the recorded 107,929 bytes, and because no proposed ceiling may exceed
a historical one, no legal value remained. The only exits were deleting shipped
features or rewriting history, so the check sat red and stopped nothing.

The TypeScript-parser inventory walks all production TypeScript and the executable
consumer's modules, distinguishes type-only imports and function-contained dynamic
imports, resolves public exports from package.json, follows eager dependencies,
and rejects nonliteral dynamic imports. It scans lazy modules too for direct
process/Bun streams, console output, descriptor 1/2 writes and standard /dev output
paths, including named/default import aliases. Only src/internal/process.ts owns
process streams. These are architecture tripwires, not a JavaScript security
sandbox against arbitrary computed aliases or eval.

Five real Node-floor loader traces cover root help, command help, version,
exit-codes and a parse refusal. They record the actual emitted modules/builtins
loaded and compare output with the bundled equivalent. Handlers, testing fixtures,
crypto, compile-cache modules and application transport must stay absent. The
source graph separately forbids any eager builtin import at declaration time;
Node filesystem/path/process imports after main starts are measured and allowed.
Each run regenerates the detailed source/import inventory and per-request traces
under `.cc/temp/distribution/`; the checked-in baseline retains the gated inventory.

Negative fixtures pin eager static handler/schema imports, eager top-level dynamic
schema imports, console/process/direct-descriptor output (including import aliases),
and unexpected eager modules. A lazy schema is the positive control. Size tests
reject one byte over the budgeted ceiling and any eager module the baseline does
not declare.

Tests regenerate the import inventory and the bundle measurement on every run
rather than trusting a checked-in snapshot; `scripts/distribution/baseline.json` is
the only persisted calibration, with 64 source/offline entries. Empty imports
and inline `type` specifiers retain side-effect edges under verbatimModuleSyntax;
only declaration-level `import type`/`export type` erases them. Both missing-edge
cases failed before repair. A real deliberately eager `node:os` offline trace fails
the allowlist check.

## Compatibility

`scripts/distribution/compatibility.mjs` performs 42 actual executions, not
availability checks: seven requests against emitted ESM and against the single-file
bundle, on each runtime pinned in `runtimes.json` (Node floor, current Node, Bun).
Each form executes inspect, all seven inherited contract cases, root and command
help, version, exit-codes and a parse refusal; versions and exact argument arrays
land in the generated report. Consumer bundle paths are scratch files removed after
the run. Required-runtime checks reject a missing executable or a mismatched
major version, and a negative fixture proves each refusal — nothing is ever skipped.
Hosted CI provisions the equivalent exact versions, runs these same tests and
uploads the generated JSON as a workflow artifact.

Reusable script entry points (the test imports the same functions):

```
node scripts/distribution/bundle.mjs .cc/temp/distribution/manual
node scripts/distribution/compatibility.mjs .cc/temp/distribution/manual/consumer.mjs .cc/temp/distribution/manual-compatibility.json
```

These assume emitted dist exists. Within CC, run the registered exact-file test
shown above; do not bypass validation with the standalone commands. Standalone CI
uses the checked-in ci.sh wrapper.
