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

## Evidence

The first bundle assertion failed on the scaffold's empty output inventory.
The expanded execution test then failed on the accessor namespace behavior above.
Final package/bundle tests execute Node 20.20.2, Node 24.16.0 and Bun 1.3.14 using
the baseline's exact absolute paths. All seven cases and an ordinary inspect run
pass on each; a shebang invocation also passes. Full typecheck and build pass.
Bounded results and settled validation IDs are in distribution-guards-output.json.

Source-of-truth entry 1, implementation-contract decisions 13–15, governs lazy
execution, process delivery, export privacy and the pinned compatibility paths.
Package remains private, has four exports and zero runtime dependencies; all lockfile
packages are development-only. Fixture handlers contain no process-output access
and route their result through public main. No consumer repository, publication or
git lifecycle action is involved.

## Startup and size guards

The first measured single-file bundle is **107,929 bytes**, including the lazy
inherited contract harness. `scripts/distribution/baseline.json` sets that exact
ceiling, with no speculative headroom, and records the measured source/offline
module allowlist. `architecture.mjs` reads every historical version of that file
reachable from HEAD. The current ceiling must not exceed any historical ceiling;
the current allowlist must be a subset of every historical allowlist. Full history
is required (CI fetches it). This prevents a same-change ceiling/allowlist increase
from hiding growth. The initial addition has no historical baseline and is
calibrated from the real build; future runs compare against that committed record.

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
reject one byte over the measured ceiling, a raised ceiling despite a fitting
bundle, new eager modules, and a matching allowlist expansion against history.

Calibration snapshots are checked in as `distribution-import-inventory.json` and
`distribution-measurement.json`; tests regenerate live evidence rather than trusting
these point-in-time copies. The baseline has 68 source/offline entries. Empty imports
and inline `type` specifiers retain side-effect edges under verbatimModuleSyntax;
only declaration-level `import type`/`export type` erases them. Both missing-edge
cases failed before repair. A real deliberately eager `node:os` offline trace fails
the allowlist check. All 17 focused tests pass at the startup-guard checkpoint.

## Actual compatibility and advisory idle evidence

`distribution-compatibility.json` records **42 actual executions**, not availability
checks: seven requests against emitted ESM and the single-file bundle on each
runtime below. Each form executes inspect, all seven inherited contract cases,
root/command help, version, exit-codes and a parse refusal. Versions and exact
absolute argument arrays are recorded. The consumer bundle paths are owned scratch
files removed after testing; rerunning the registered test recreates equivalents.

| Runtime | Exact version-check command | Actual version | Emitted / bundled requests |
| --- | --- | --- | --- |
| Node floor | `/Users/alex/.local/share/cli-for-agents/runtimes/node20/bin/node --version` | v20.20.2 | 7 / 7 passed |
| Current Node | `/Users/alex/.nvm/versions/node/v24.16.0/bin/node --version` | v24.16.0 | 7 / 7 passed |
| Bun | `/Users/alex/.bun/bin/bun --version` | 1.3.14 | 7 / 7 passed |

These are the exact baseline/launch-contract paths, with the Node20 symlink's
resolved executable included in the JSON report. Required-runtime checks reject
missing executables and mismatched versions; a negative fixture proves each
refusal. The initial implementation stub failed both missing-runtime refusal and
actual paired-evidence assertions. Nothing is marked skipped. Hosted CI execution
is not claimed: the checked-in job provisions the equivalent exact versions,
verifies them through these same tests, and uploads the generated JSON evidence.

`distribution-idle.json` records nine fresh-process pairs per Node version in this
Darwin environment (the measuring process reports x64), following one discarded warmup pair. Each pair runs an empty
Node process (`node -e ''`) and the same runtime executing the bundled CLI's
`--version` path. Order alternates to reduce order bias. Compile cache is disabled;
the registered wrapper's heap setting is inherited. Time includes process launch,
module initialization and host contention, and is not a cold-disk experiment.

| Runtime | Empty Node median | Offline CLI median | Median of paired differences |
| --- | ---: | ---: | ---: |
| Node 20.20.2 | 80.37 ms | 132.97 ms | 48.71 ms |
| Node 24.16.0 | 91.83 ms | 123.11 ms | 28.82 ms |

The median paired difference is calculated from each pair, so it need not equal
the difference of the two separate medians. Raw samples, commands, timestamp,
platform and methodology are retained. Timings are advisory: **there is no timing
gate**. A synthetic slow-sample control proves the summary accepts slow timings.
Process failures and missing compatibility runtimes still fail normally.

Reusable script entry points (the test imports the same functions):

```
node scripts/distribution/bundle.mjs .cc/temp/distribution/manual
node scripts/distribution/compatibility.mjs .cc/temp/distribution/manual/consumer.mjs .cc/temp/distribution/manual-compatibility.json
node scripts/distribution/idle.mjs .cc/temp/distribution/manual/consumer.mjs .cc/temp/distribution/manual-idle.json
```

These assume emitted dist exists. Within CC, run the registered exact-file test
shown above; do not bypass validation with the standalone commands. Standalone CI
uses the checked-in ci.sh wrapper. The final full suite includes all 20 distribution
checks, with all launched validations settled before task completion.
