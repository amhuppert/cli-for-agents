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

Lazy bindings explicitly snapshot `(await import('./handler.mjs')).default` into
`{ default: value }`. esbuild generates accessor-backed namespace exports; the
runtime deliberately requires executable data properties. Snapshotting at this
consumer boundary preserves lazy evaluation without weakening that validation.
The real bundled execution test reproduced KERNEL_CONTRACT before this repair.

Run locally through registered validation:

```
cctl validate run test --queue-if-busy -- tests/distribution.test.mjs
```

`scripts/distribution/bundle.mjs` is the reusable bundle entry point (requires an
existing emitted dist). `.github/workflows/distribution.yml` provisions all three
pinned runtimes before calling `scripts/distribution/ci.sh`, which uses the canonical
validation wrapper in standalone CI without a CC server. The exact runtime pins
and local executable defaults live in `scripts/distribution/runtimes.json`.
Explicit environment overrides allow provisioned CI locations, but versions must
still match exactly. Missing executables and mismatched versions fail; no skips.
CI configuration has been authored here; a hosted Actions run is not claimed.

## What the guards assert

Package/bundle tests execute the pinned runtimes in `runtimes.json` at their exact
absolute paths, running all seven inherited contract cases, an ordinary read, a
shebang invocation, help, version, exit-codes and a parse refusal on each. They
also assert that the package stays private, exposes exactly four exports and
carries zero runtime dependencies, that every lockfile package is development-only,
and that fixture handlers reach stdout only through public `main`.

## Startup and size guards

`scripts/distribution/baseline.json` holds a **size budget of 112,640 bytes**
(110 KiB) for the single-file bundle, including the lazy inherited contract
harness, alongside the measured source/offline module allowlist. The budget is not
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
the only persisted calibration, with 68 source/offline entries. Empty imports
and inline `type` specifiers retain side-effect edges under verbatimModuleSyntax;
only declaration-level `import type`/`export type` erases them. Both missing-edge
cases failed before repair. A real deliberately eager `node:os` offline trace fails
the allowlist check.

## Compatibility and advisory idle measurement

`scripts/distribution/compatibility.mjs` performs 42 actual executions, not
availability checks: seven requests against emitted ESM and against the single-file
bundle, on each runtime pinned in `runtimes.json` (Node floor, current Node, Bun).
Each form executes inspect, all seven inherited contract cases, root and command
help, version, exit-codes and a parse refusal; versions and exact argument arrays
land in the generated report. Consumer bundle paths are scratch files removed after
the run. Required-runtime checks reject a missing executable or a mismatched
version, and a negative fixture proves each refusal — nothing is ever skipped.
Hosted CI provisions the equivalent exact versions, runs these same tests and
uploads the generated JSON as a workflow artifact.

`scripts/distribution/idle.mjs` measures nine fresh-process pairs per Node version
after one discarded warmup pair. Each pair runs an empty Node process (`node -e ''`)
and the same runtime executing the bundled CLI's `--version` path, alternating order
to reduce order bias, with the compile cache disabled. The reported median of paired
differences is computed per pair, so it need not equal the difference of the two
separate medians. Elapsed time includes process launch, module initialization and
host contention; this is not a cold-disk experiment. Timings are advisory: **there
is no timing gate**, and a synthetic slow-sample control proves the summary accepts
slow timings. Process failures and missing compatibility runtimes still fail.

Reusable script entry points (the test imports the same functions):

```
node scripts/distribution/bundle.mjs .cc/temp/distribution/manual
node scripts/distribution/compatibility.mjs .cc/temp/distribution/manual/consumer.mjs .cc/temp/distribution/manual-compatibility.json
node scripts/distribution/idle.mjs .cc/temp/distribution/manual/consumer.mjs .cc/temp/distribution/manual-idle.json
```

These assume emitted dist exists. Within CC, run the registered exact-file test
shown above; do not bypass validation with the standalone commands. Standalone CI
uses the checked-in ci.sh wrapper.
