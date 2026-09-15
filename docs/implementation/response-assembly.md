# Response assembly

Governing source: `.cc/graph-workflow-docs/implementation-contract.md`, charter
source-of-truth entry 1, decisions 7–11. The canonical predecessor contracts are
`runner-response-contract.md`, `kernel-values.md` and `guidance-candidates.md` in
this directory. Evidence is optional; candidate evaluation never arbitrates.

`src/internal/response.ts` owns the sole `arbitrate` function. Runtime composition
passes handler guidance, all retained local/authoritative batches, the command
path and its configured conflict sink once, after operation collection/release.
Batch ingress is repeated defensively. An invalid batch becomes a bounded
KERNEL_CONTRACT failure without dropping valid protocol from other batches.

Required instructions compare by exact text. Equal text across different owners
is compatible; distinct text conflicts even with equal owner or rule IDs. The
conflict retains each instruction with handler/rule provenance and emits one
awaited conflict event. Repeated identical entries are deduplicated. Its selected
instruction is the canonical bounded stop-and-report instruction. Event failure
adds a diagnostic without removing the conflict or instruction.

Reminders sort by descending priority, then rule ID, authority and value. Equal
text is deduplicated; two at most survive. Different texts with colliding local
and remote IDs remain independently eligible. The selected aggregate must fit
1024 serialized UTF-8 bytes; invalid aggregates fail without truncating text.
Instruction suppresses every hint. Otherwise handler advice wins; candidate hints
use stable rule/authority ordering. Firing diagnostics retain authority in their
issue paths. Invalid sources are failures; sink observability issues alone are
nonfatal.

`assembleResponse` consumes this selection and the upstream ExecutionResult,
registered doctor, executable and secondary failures. It preserves operation
effect/recovery and existing domain classification/rationale. Conflict converts
success to KERNEL_GUIDANCE, and secondary failures never overwrite an existing
domain error. Conflict details retain competing provenance. Connection errors
append the doctor and retain an independent read continuation. References are
validated together. Success issues are top-level; failure issues are error.issues;
why only occurs under error.

When an individually valid continuation exceeds the combined reference budget
with the registered doctor, assembly omits that continuation and records a bounded
secondary KERNEL_CONTRACT explaining the omission. The doctor remains unchanged,
as do the domain code/class/rationale, issues, guidance and operation recovery.
This follows governing decisions 8, 10 and 11: the oversized aggregate is invalid
protocol, and cannot prevent the retained operation report from reaching delivery.
The decoder still rejects an oversized transported aggregate. A regression uses
real registered references with 600-character arguments and both applied and
unknown effects to verify assembly returns a decodable response.

All kernel errors are created through `kernelError` in the kernel-values owner,
`src/results.ts`; its code/class/rationale comes from the existing kernelErrors
catalog. No public package export is added. Detached hint rendering reuses the
registry's token/quoting implementation; runtime composition must first rebind
references to its current registry. Shape validation cannot prove membership.

The private AssembledResponse retains envelope, structured selected guidance,
primary text, executable spelling for references and optional finite binary request
separate from JSON summary.
`internal/artifacts.deliver` already consumes this type. Delivery owns the final
byte bound, spill, emergency formatting and host output; it never re-arbitrates.
Runtime composition owns invoking these seams with its post-operation facts.
These downstream implementations remain their separately assigned graph tasks.

## Rendering and wire admission

`assembleResponse` snapshots JSON data before invoking the execution-owned renderer
closure once. Invalid JSON becomes KERNEL_CONTRACT and is never passed to rendering.
Custom renderers return synchronous strings; exceptions, promises, nonstrings,
terminal controls and reserved protocol prefixes become KERNEL_OUTPUT. Rejected
native promises are observed without accepting asynchronous renderer work. Neither
exception messages nor rejected primary text are emitted. Existing domain errors
remain primary; successful read/applied responses become failure with their known
effect/recovery retained. Instruction/reminder selection survives either failure.

`renderStructural` supplies the default for execution-owned closures: recursively
sorted object keys, preserved array order and pretty JSON with escaped Unicode line
separators. Quoting keeps protocol-looking DTO keys/values inside data. Execution
retains the typed runner/level data pairing; this owner consumes only renderPrimary,
without introducing an erased renderer that accepts arbitrary data.

`renderResponse` is a pure, explicitly unbounded projection. JSON is one envelope
plus newline on stdout. Text success uses stdout; failure uses stderr with its
catalog error/rationale, doctor and continuation, effect/recovery, optional primary
body, issues/details/secondary failures, then reminders and instruction or hint.
No stream handles reach a renderer. Delivery alone makes the projection byte-bounded
and constructs RunResult; the executable field lets it reuse reference rendering.
Doctor, continuation and hint shell strings are never passed through prose escaping:
U+2028/U+2029 are valid invocation token characters and remain literal inside shell
quotes. Tests parse each displayed command with a real POSIX shell and compare
the executable, positional, flag and passthrough tokens, including a literal
backslash-u spelling, a single quote and an empty token. JSON references retain
the same registered inputs. Prose/structural JSON display escaping stays separate.

Public runtime `decodeEnvelope` delegates to `results.decodeWireEnvelope`, beside
the canonical wire types and checked value owners. It snapshots descriptor values
before validating exact fields, status/effect/recovery correlations, optional failure
issues, required rationale, kernel class matching, secondary kernel codes, guidance
exclusivity and reminder uniqueness/cap. It repeats serialized UTF-8 instruction,
reminder, recovery, reference, diagnostic-summary and manifest limits. Reported
recovery uses recoveryFacts. Artifact path/hash/unit fields are shape-checked;
transported artifacts do not prove filesystem authorization, nor do transported
invocations prove current-registry membership. Domain classification cannot be
checked against an application catalog without that catalog; only kernel classes
are checked here. Optional body/detail and aggregate diagnostics are bounded by
delivery, not by this decoder's input-size contract.

## Acceptance evidence

62 focused behavior tests cover all six context criteria and wire admission:

- Single selection: handler/local/remote inputs, stable priority ties, text
  deduplication/cap, instruction suppression and source-ID collisions.
- Conflict recovery: awaited conflict sink with full competing provenance;
  sink failure retains the stop/report instruction, domain outcome and recovery.
- Error precedence: read/applied/unknown outcomes, release/rendering/sink failures,
  malformed JSON, and no rejected body or private exception disclosure.
- Doctor append: registered doctor survives alongside a separate continuation;
  exit 3 and coherent text/JSON stream routing are asserted.
- Rendering ownership: exact custom text ordering, reserved/control/nonstring
  rejection, immutable decoding, structural ordering, and actual parsed text/JSON
  projections asserting disclosed records, unknown totals, omissions and next step.
- Wiring ownership: AssembledResponse remains the input of internal/artifacts.deliver;
  existing compiler controls prohibit treating assembly as bounded RunResult.
  Runtime composition owns invoking arbitration/assembly with post-operation
  reports and configured conflict sink, as fixed by governing decisions 6–11.

The initial task's required-guidance assertion failed against its stub. The second
task's canonical decoding, structural/text projections and reserved-prefix assertions
failed against the remaining stubs before implementation. Later regressions proved
coercible discriminants, invalid failure-data rendering and optional diagnostics
handling red before repair. Settled focused/full/typecheck/build run IDs and invariant
checks are recorded in `response-assembly-output.json`.

Context-validation repairs additionally reproduced the escaping aggregate-reference
exception and all three Unicode shell token changes before fixing them. The
reference-overflow case returns a strict-decodable response while preserving the
registered doctor and operation facts; the shell regressions compare actual parsed
tokens rather than comparing two strings produced by the same renderer.
