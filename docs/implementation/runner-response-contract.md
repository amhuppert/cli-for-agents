# Runner and response boundary contract

Governing source: `.cc/graph-workflow-docs/implementation-contract.md`. Decisions
6–7 supersede historical optional handler decoding and prepare-every-write proposals.
All function bodies remain throwing stubs; compiler checks prove assignability,
not execution, output bounds or application purity.

## Lazy modules and typed rendering

| Declaration | Lazy default | Execution obligation |
| --- | --- | --- |
| read without payload | ReadHandler | Direct run; exhaustive declared levels |
| write without payload | WriteHandler | Direct run returning a commit report |
| read with payload | payloadRead(PayloadReadHandler) | Required Standard Schema v1 decode before acquisition; no twin |
| write with payload | mutation(MutationHandler) | Required decode before acquisition; shared prepare for twin and commit |

Schemas exist in lazy modules only. Declarations contain bounded file metadata;
read payloads cannot declare validatePath. Handlers receive decoded `payload`,
never a callable ctx.payload. Execution must finish local flags/files/JSON/schema
validation before acquiring any network-capable context. Preparation purity is an
application promise. The private execution owner mints and tracks Prepared tokens
with a non-null payload hash and command/run identity, and rejects foreign-command,
foreign-run and consumed tokens. Type brands prevent author construction and
cross-command substitution; runtime identity/consumption checks remain mandatory.

`runner<Input,Data,Code>({run,text?})` validates the runner/renderer pairing and
retains its renderer privately. `writeRunner` does the same for commit reports.
Each read level can use a different Data type. Direct functions use the structural
default renderer. Renderers receive only their checked JSON data and return text;
response assembly adds protocol/diagnostic prefixes; artifact-delivery enforces
the final serialized byte bound. They
cannot return envelopes/process handles through the signature. Runtime validates
untyped returns and keeps the erased renderer paired with the exact result that
produced its data. No public erased renderer accepts arbitrary JSON. ExecutionResult.renderPrimary
is the internal closure over checked DTO data or binary summary; response calls
it after app release and classifies throws as secondary output failures.

Compiler controls: isolated unsuppressed `runner-positive.ts`, hostile
`runner-negative.ts`, plus retained family/input/literal/exact/brand and anchored
Any* programs. `tests/execution.test.mjs` and `tests/response.test.mjs` belong to
later runtime owners; the existing harness only verifies built entry points.

## Effects, errors and recovery

Decisions 8–11 replace receipt-as-recovery, literal doctor paths and arbitrated
provider results. `OperationEffect` is canonical: read and not_applied have no
recovery; applied requires ReportedRecovery; unknown requires CompactRecovery.
Commit reports derive write alternatives from that union, use `effect` (no second
status vocabulary), and allow success only when applied. Execution and envelopes
reuse its success subset (read/applied). Failure after an applied operation retains
that effect and recovery. ExecutionResult alone adds private validated provenance;
an application report is not proof of execution or a durable commit.

`recoveryFacts` validates a nonempty list of actual app-reported kind/id references,
with at most 1024 serialized UTF-8 JSON bytes. Result data can be arbitrarily richer
and remains independent. Throwing/unacknowledged writes use private
`unknownAcknowledgment(ParsedInvocation,payloadHash?)`: only the registered command
path, payload hash when applicable, and `inspect_before_retry`. It carries no raw
arguments, flags, credentials or invented durable IDs. Scalar writes omit hash;
payload writes retain the already-computed hash. Known app-reported facts survive
later failures. Instructions/doctor/continuation explain inspection before another
mutation; the fallback does not promise a receipt lookup when no ID was reported.

`kernelErrors` is the single finite code/class/default-rationale inventory.
KernelCode derives from its keys. Owners use KERNEL_USAGE for invocation/registry
configuration refusals, KERNEL_INPUT for local file/JSON/schema failures,
KERNEL_CONTRACT for malformed application/protocol values, KERNEL_CANCELLED for
cancellation, KERNEL_HANDLER for unacknowledged runner failures, KERNEL_CONTEXT
for failed acquisition, KERNEL_GUIDANCE for guidance failures/conflicts,
KERNEL_OUTPUT for renderer/artifact/process delivery failure, and KERNEL_RELEASE
for finalizer failures. The table assigns usage to the first/input cases,
connection to acquisition, and failed to the other cases; domain version failures
remain catalog-owned. Domain catalog description is its default rationale;
explicit ErrorOptions.why overrides it. No runtime owner invents a sibling map.

Every CLI registers one runnable read doctor invocation, including nested paths.
This covers kernel connection failures even for catalogs without domain connection
codes. Registration verifies membership and runnable, credential-safe inputs.
CliError can supply a read continuation; ResponseError requires doctor for
connection-class delivery. Response assembly appends it centrally. Continuation
cannot replace it. Why is failure-only, success diagnostics are top-level issues,
and failure diagnostics are exclusively error.issues. A later failure is recorded
as a SecondaryFailure with a KernelCode; the existing domain code/class/why wins.
For otherwise successful operations, guidance conflict or output failure creates
exit 1 while retaining effect/recovery. Release failure cannot erase an outcome.

`protocolLimits` is the canonical serialized UTF-8 JSON byte table: output default
32768/minimum 8192, instruction 1024, selected reminders together 1024, recovery
1024, doctor plus continuation references together 1024, manifest 2048, and each
diagnostic summary 512. These are runtime validation obligations, not nominal
string-length proofs. Mandatory overflow is rejected, never truncated. Runtime
must bound diagnostic count/aggregate size to the remaining reservation and prove
minimal complete JSON/text responses fit 8192 including labels/escaping. Emergency
text can use compact structured argv preserving token boundaries. Optional data
spills or is omitted with explicit omission facts; rejected bodies are never
printed. Malformed post-commit guidance becomes a bounded contract failure while
valid known effect/recovery survives. Envelope decoders repeat ingress validation.

## Guidance ownership

`evaluateGuidance` requires authority and state, plus a firing sink when rules are
present. It accepts no handler guidance and returns branded candidates, stable
provenance, firing events and diagnostics. Candidates retain priority and optional
evidence. `decodeEvaluatedGuidance` validates authoritative transport batches;
transport owns authenticity. Neither selects final instructions/hints/reminders.
The private response `arbitrate(ArbitrationInput)` is the only boundary accepting
handler guidance plus local/decoded authoritative batches. It requires a conflict
sink; distinct required instructions produce a stop-and-report conflict,
instruction suppresses hint, and reminders sort by priority/stable ID, deduplicate
and cap at two. Sink failures are visible diagnostics and do not suppress valid
required guidance. Conflict entries retain each instruction together with handler
ownership or candidate authority/command/rule provenance in the arbitration result
and conflict sink event. `assembleResponse` in internal/response consumes the
branded arbitration result, operation facts, doctor and secondary failures. It
produces AssembledResponse: a validated envelope, primary text, selected structured
guidance and optional binary request separate from JSON. This is not yet a final
byte-bounded response. `deliver` in internal/artifacts consumes that handoff and
alone produces bounded RunResult, handling serialized UTF-8 measurement, spill,
explicit output, binary writing and failure fallback without re-arbitration.
Runtime-composition invokes both stages for every response class. This follows
response-wiring-owner, serialized-budget and delivery-wiring-owner in the approved
graph. validateOutputBudget belongs to artifact-delivery and is invoked by runtime
before execution.

Compiler evidence: isolated `response-positive.ts` and negative
`response-negative.ts` cover all effect outcomes, compact recovery brands,
connection response doctor, error/diagnostic placement, candidate-only evaluation,
and the mandatory conflict sink. Runtime owners must establish serialized bounds,
primary precedence, authoritative validation and failure preservation through the
named guidance/response/delivery/process tests; this context adds no runtime claims.

## Host, lifetime and delivery

Decisions 6, 12 and 14 govern the execution seam. `runCli` accepts an optional host;
omission calls asynchronous `nodeHost()` lazily. The internal execute request has
a required resolved host. Host provides bounded file/stdin reads, canonical paths,
file-kind inspection, atomic writes, clock/sleep and hashing. The node-host
context implements both nodeHost and testing.createTestHost, including captured
calls, file snapshots and deterministic clock/sleep cancellation. Consumer-testkit
consumes that host and implements runner-neutral cases and execution helpers.
Host has no process
streams, exit, transport or logger. Providers may return an optional synchronous or
asynchronous release. A missing release means no finalizer work, not a failed
acquisition. The Node adapter owns stream drain/EPIPE and opt-in compile cache.

`execute(invocation,request,contexts,postOperation)` loads the lazy module and
finishes local decoding before acquisition, then runs the operation. Its caller,
runtime-composition, supplies a PostOperationHook for guidance collection and
app-dependent artifact-policy resolution. SelectedContext discriminates each key
and none; none has no app. The hook receives the operation outcome while app is
alive and returns detached candidate batches, issues and an optional
ResolvedArtifactPolicy. Runtime catches collection and policy failures separately:
a rejected policy resolver must not erase valid batches already collected. It
returns those batches/issues without artifacts. A failed hook result can also
retain partial facts; absence of policy never implies absence of guidance.
Execution awaits the hook and invokes optional release exactly once in a finally
path, including hook rejection/cancellation. Release failure is secondary and
cannot replace the outcome. CompletedExecution reports completed/failed/skipped
hook state; local validation refusal skips acquisition and the hook. Runtime must
avoid returning early on cancellation before the hook/finalizer settles.

ArtifactPolicySource is an explicit policy or an execution-only resolver using
app/env. No directory is guessed from the executable name. The post-operation
hook calls private resolveArtifactPolicy to retain an immutable, canonical,
host-only value before release. Delivery accepts only that value, never the app or
resolver. When local validation or policy resolution fails, delivery can omit
artifacts and use a bounded response; it cannot invent a directory or discard an
existing domain outcome. writeArtifact owns canonical forbidden-root/symlink
checks, collision refusal/identical-content reuse and actual bytes/hash metadata.
Retention remains opt-in. Host-only delivery occurs after finalization.

## Finite binary requests

`binaryArtifact<Summary>({bytes,mediaType,basename,summary})` accepts only a finite
Uint8Array and JSON summary. Runtime validates a safe basename/media type and
snapshots mutable bytes. It returns a branded request separate from JSON DTOs;
no stream/file producer/process handle can replace bytes. Success is either
`{ok:true,data}` or `{ok:true,binary:request}`, never both. Typed renderers receive
the request summary as their Data; they never receive raw bytes. Ordinary DTO and
binary summary types widen through anchored Any* forms without recursive defaults.

A declaration with `output:"binary"` advertises --out without a detail selector.
Every returned binary request uses the shared artifact writer even without --out;
no binary bytes enter stdout or an inline envelope. Selected level output rules
continue to apply to ordinary detail requests. The runtime validates declared
output capability for untyped modules. Manifests add binary format/mediaType,
binary_request reason and binary contains discriminator, retaining absolute path,
true bytes and hash. Envelope payload stays JSON inline data or JSON artifact
summary/manifest; a BinaryArtifactRequest never becomes envelope data.

## Help and documentation references

Decision 13 keeps helpNode, commandReference, version and exit-codes offline.
HelpNode carries typed flags/arguments/examples/sections, source kinds, child and
related paths, skill references, node kind and dynamic opt-in. HelpSection has a
title and paragraph/list body; flags derive from the same declaration as parsing,
including globals/generated selectors/files/payload twins. A command/group opts
in with dynamicHelp:true. CliOptions.helpContext loads providers lazily with one
total deadline (default 500ms including loading/acquisition), at most three blocks,
and the configured byte cap. Failure silently returns byte-identical static help.
Live state commands continue to use normal execution failures. Flow describes
reference sequences; lazy steering supplies runnable next steps.

Consumers declare `documentation:{directory}` when any skill references exist.
Synchronous createCli/register checks graph membership, root/reference shape and
syntax only: reject empty/absolute/traversing paths without filesystem access.
It neither imports a handler nor acquires app/host. Asynchronous validateReferences
uses an injected or lazily loaded ReferenceHost (default lazy nodeHost) to require
existing regular files and canonical containment within that root, including
symlinks. ReferenceValidation reports missing root/file, outside root or invalid
reference with command path and reference. writeCommandReference validates first,
then compares or writes only a named generated marker block. Check mode never
writes; host reads are bounded by maxBytes (default 1 MiB). No consumer repository
is touched in this context; all tooling bodies remain stubs.

The isolated delivery-positive and delivery-negative controls pin finite binary
requests/summary typing/--out, optional host/release, context-free APIs, typed
sections, reference hosts, hook presence and resolved-policy lifetime boundaries.
The export-to-owner inventory is `docs/implementation/api-inventory.md`.


Ownership repair verification: compiler controls exercise assembleResponse output
as artifact-delivery input, reject treating assembly as bounded RunResult, retain
partial guidance without policy, and require competing conflict provenance.
Runtime test-first is intentionally deferred because this repair changes only
signatures and ownership documentation; all runtime functions remain stubs.
