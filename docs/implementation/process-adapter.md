# Node process adapter

Governing source-of-truth entry 1, implementation-contract decisions 10, 13 and
14, assigns process delivery to main and preserves the existing runtime's
classification, offline routing and bounded response ownership.

Public main lazily imports the private process adapter. It forwards argv.slice(2)
and process.env, omits the host to use runtime's lazy nodeHost, and maps SIGINT and
SIGTERM to the invocation AbortSignal. Runtime still owns release and outcome
assembly. Compile cache is opt-in, feature-detected, and best-effort. Declaration
imports do not acquire Node builtins; offline routes import no handler or crypto.

The adapter writes only the existing bounded RunResult. It waits for each write
callback and, when write returns false, drain; it monitors errors and premature
close. EPIPE means the downstream reader stopped and preserves the operation's
exit code quietly. Other stream failures turn success into exit 1 while retaining
any existing nonzero exit. It never retries execution or emits a replacement
response after partial delivery. A broken destination cannot receive remaining
bytes; transport failure is conveyed through exit status without adding another
envelope or exceeding the serialized output budget.

## Node adapter task evidence

The executable tests/fixtures/process-cli.mjs invokes main through package exports.
Its application module is lazy. tests/process.test.mjs covers argv/env/default
host, six offline routes, lazy module acquisition, cache off/supported/absent/
throwing, Node 20, and EPIPE arriving during runtime work before delivery.

The initial seven behavior tests failed against the throwing main stub. A real
process run exposed that EventEmitter methods are on node:process's default
export; the private declaration and adapter use that export. The pre-delivery
EPIPE reproduction failed with exit 1 (vrun-13ecca30-9a14-4eef-841d-d8d080245213)
before preserving the recorded pipe-error classification.

Lifecycle stress and cancellation are proved by the ordered second task below.

## Child-process acceptance evidence

The fixture's extra read/write/wait routes are test scaffolding; they reuse the
existing production runtime and adapter. No new production behavior was introduced
for this test-only task. Fixture state records acquire/run/mutation/release events
to a temporary file, outside response streams. The test harness never detaches a
child: it captures status on close after streams settle, and kills/awaits children
on timeout or failed assertions. Stream fault injection is private preload code
inside disposable child processes; it adds no public output escape hatch.

| Acceptance outcome | Concrete evidence in tests/process.test.mjs |
| --- | --- |
| drain-before-exit | Five text/JSON success/domain/applied runs deliver every byte of an 80,000-emoji body (>320 KB with envelope), within the configured 1 MiB budget, to paused/resumed readers. A false-completion negative control reproduces truncation. Separate callback-first, drain-first and accepted-write controls verify both completion signals. |
| pipe-failure-classes | Three actual closed-pipe runs observe EPIPE on stdout/stderr. Twelve injected callback/event/throw/premature-close failures verify success becomes exit 1, domain connection stays exit 3, and mutation/release happen once. Captured attempted envelopes retain reported effect, instruction and recovery. |
| offline-startup | Real module-resolution trace proves declarations acquire no Node builtin; offline main acquires the adapter/host lazily and imports no handler/crypto/cache module. Cache off/supported/absent/throwing controls and actual Node 20 opt-in execution pass. |
| process-production | Fixture imports public main from cli-for-agents/runtime. SIGINT/SIGTERM cancel real waiting reads and unacknowledged writes through the production AbortSignal; one release completes before exit 1. Unknown-acknowledgment recovery identifies save-wait and says inspect_before_retry. SIGTERM during a slow drain preserves the assembled applied result and instruction. |

All 43 focused tests passed (vrun-5a2a8d46-c23d-4877-84e6-cf80454a407a).
The full suite passed after strengthening exact unknown-acknowledgment assertions
(vrun-7435a03a-395c-41da-975e-e61aadbbf4ee). An initial stress-test assertion used an
incorrect recovery DTO shape; it was corrected to the canonical reported/
references union. That failure was a test-authoring error, not production evidence.

## Charter checks

- local-scope: only this worktree changed; package.json remains private with its
  four existing exports, no runtime dependencies, and no publication/consumer edits.
- dependency-free-kernel: source scan finds no eager non-type Node import;
  the isolated loader trace verifies real import ordering. Only main loads the
  adapter and only explicit cache opt-in loads node:module.
- protocol-preservation: child tests compare complete text/JSON bytes, required
  instruction and receipt recovery; interrupted writes retain canonical unknown
  acknowledgment. Domain failures retain exit 3 under stream faults. The existing
  full runtime suite retains guidance/artifact failure protections unchanged.
- no-output-bypass: source scan finds process streams/exit only in the private
  process adapter. Handlers and renderers have no direct writes. The adapter calls
  runCli once and passes exactly its bounded stdout/stderr to the writers.
- git diff --check passes. All validation uses registered cctl commands; terminal
  IDs and final status are recorded in process-adapter-output.json.

Final strengthened reported-recovery assertions also pass in focused run
vrun-3a432511-109a-4e46-b299-cf8eccfeaf93. Full typecheck
vrun-514a336b-ffe2-41a5-a23b-b6acc16bad35 and full build
vrun-d0fd9674-89c1-4df4-ae49-b1907bc584f4 pass. All launched checks settled.
