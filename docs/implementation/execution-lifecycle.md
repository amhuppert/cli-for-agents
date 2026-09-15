# Execution lifecycle

Governing source: `.cc/graph-workflow-docs/implementation-contract.md`, source-of-truth
entry 1, decisions 2, 4, 6–8 and 11. All three execution-lifecycle tasks are
implemented. The canonical private production seam is
`execute(invocation, resolvedRequest, contexts, postOperation)` in
`src/internal/execution.ts`. Public runtime composition remains its downstream
caller, as explicitly assigned by the task and API inventory.

## Local input and lazy modules

`internal/local-input.resolveLocalInput` checks parser invocation provenance and
consumes the parser's immutable source/credential descriptors. Raw argument, flag
and global files resolve to fatal-decoded UTF-8 text. Derived string sources apply
the declared string constraints; their byte limit applies to inline text too.
The host receives the declared limit and cancellation signal; execution independently
checks returned byte arrays. The parser rejects duplicate stdin consumers before IO,
with a defensive execution check. Required environment credentials resolve and
validate before handler loading or context acquisition.

Structured payloads always parse JSON and run Standard Schema v1 from the lazy
module. `payloadRead` and `mutation` retain checked schema/run/level/prepare/commit
references in private WeakMap state. Copied, forged and mismatched module tokens
are refused. Structural schemas may expose the standard protocol through prototype
properties/getters; execution reads only that protocol, not unrelated schema state,
and preserves the validator receiver. Real ESM import namespaces are accepted by
capturing only their default export; Symbol.toStringTag and unrelated named exports
are not mistaken for handler metadata. Decoders may be asynchronous and their
transformed output becomes the handler payload. Schemas are not initialized by
declaration imports.

Schema issue paths normalize primitive and `{key}` segments into strings/numbers
(symbols become their string form), then the canonical catalog checks diagnostic
bounds and path validity. Invalid schemas/modules/results become KERNEL_CONTRACT;
file/JSON/schema refusals and decoder exceptions become KERNEL_INPUT; cancellation
becomes KERNEL_CANCELLED. Exception text never echoes raw input, secrets or host
paths. Local refusals skip every provider and the post-operation hook.

## Context lifetime and dispatch

The selected runner and exact declared level inventory are checked before acquiring
the keyed provider. `none` never acquires and omits `app` from handler and hook
inputs. Other keys select only their corresponding provider, passing resolved
globals and request env/host/signal. Handler ctx retains the bound family catalog,
resolved args/flags/passthrough, and injected clock methods.

Direct reads, scalar writes, payload reads and selected levels use their declared
runner. `runner`/`writeRunner` retain text privately; checked JSON data (or finite
binary summary) is closed over for response assembly to render after release. The
default renders structural JSON with two-space indentation. Finite binary requests
are delegated to the existing artifact-delivery `binaryArtifact` constructor; no
parallel binary implementation or public erased renderer was added here. The
binaryArtifact constructor is still a scaffold stub in this worktree: successful
binary-result execution remains an unresolved artifact-delivery dependency and
is not claimed by the verified lifecycle behavior.

The app remains alive until the caller-supplied post-operation hook settles. The
private finalizer then runs exactly once, including failure and cancellation.
Execution never races pending acquisition/operation/hook work against an early
cancellation return. Acquisition retains a safely obtainable release method before metadata capture or
app validation. Prototype methods and own non-enumerable methods preserve their
receiver and remain available on missing, inherited, accessor-backed or
non-enumerable app refusals. Invalid metadata getters are never invoked, and a
shadowing release accessor does not expose an ancestor method. Hook facts are detached and
frozen. Hook/release failures become bounded secondary kernel facts; neither erases
the acknowledged operation. Runtime-composition supplies the actual guidance and
app-policy hook, then consumes retained facts for assembly and host-only delivery.

## Preparation provenance and effects

Payload writes and generated validation twins use the identical decoder and
prepare function. Both hash the exact bounded input-file bytes through Host before
acquisition; `values.checkedSha256` validates the digest. Preparation values may be
opaque application objects. A successful twin returns `{valid:true,payloadHash}`
with read effects and does not expose preparation values or call commit.

For a mutation, `internal/preparations` creates a private scope bound to the actual
command identity and payload hash, mints an immutable Prepared token only after
successful preparation, and consumes it immediately before invoking commit. Its
WeakMap provenance rejects foreign commands, foreign runs, changed hashes, copies
and consumed tokens. A throwing commit still consumes its token. None of these
scope/mint/consume functions is a package export or public ownership handle.
Preparation purity remains an application promise, as required by decision 6;
token validation does not claim to prove application behavior. The payload hash
identifies the submitted source snapshot, not a serialization of opaque preparation.

`internal/execution-reports` checks provider refusals, preparation errors, handler
results and commit reports against the bound family catalog plus KernelCode,
including exit-class correlation. Foreign codes become KERNEL_CONTRACT. Writes
observe valid effect/recovery independently before checking the rest of the report,
so malformed result values or accessors cannot erase already-reported applied
recovery. Accessors are never executed. Invalid/unacknowledged reports fall back to
unknown effects; a commit that throws or is cancelled after service changes never
implies rollback. Refused preparation or cancellation before commit is not_applied.

The bounded unknown-acknowledgment fallback contains only registered command path,
payload hash for payload writes and inspect-before-retry advice. It contains no
invented durable ID or secret input. Valid app-reported recovery survives result,
renderer, hook and release failures. The fallback is validated before acquisition,
so an oversized mandatory command-path fact cannot allow an unrecoverable mutation.

## Canonical private helpers and downstream integration

`results.kernelError` and `results.checkedError` share the original checked catalog
constructor with defineErrors. `results.unknownAcknowledgmentFact` owns the bounded
fact; execution verifies invocation provenance before calling it. Recovery always
uses results.recoveryFacts. `values.checkedSha256` owns digest validation. These
source-private helpers are absent from the four package export surfaces. Runtime
owners should consume them rather than invent sibling constructors.

Runtime-composition must resolve a leaf once, call execute once with its guidance/
policy hook, pass execution plus secondary/facts to response assembly, and deliver
after finalization. This follows decision 6 and the explicit production-caller row
in api-inventory; implementing runCli here would cross the assigned ownership seam.
No execution-owned stubs remain. Binary author construction, response arbitration,
assembly, artifact delivery and process adaptation retain their existing owners.

## Verification and acceptance

`tests/execution.test.mjs` imports the built production internal owners while
public composition is downstream. Its 87 tests cover:

| Outcome | Concrete evidence |
| --- | --- |
| validation-before-context | Throw-on-touch providers/hooks for bad file, JSON, UTF-8, byte limit and schema input; read/write/twin decoding; bad host digest |
| none-bypass | No app property and zero provider calls |
| keyed-context-inputs | Selected app identity; env/globals/host/signal identity; deterministic now/sleep |
| finalizer-exactly-once | Success, refusal, thrown operation, cancellation and malformed acquired metadata; release errors are secondary |
| release-after-post-operation | Bounded barrier hooks prove no early release on settlement or cancellation |
| catalog-membership | Foreign provider, handler, preparation and commit codes rejected; known recovery retained |
| runner-transitions | Read, level, scalar write, payload read, mutation and validation twin; exact renderer pairing after release |
| prepared-provenance | Foreign command/run, changed hash, copied/consumed token refused before a commit callback; throw consumes token |
| effect-observation | Bounded service-state mutation, prepare/commit refusal, lost acknowledgment, cancellation, malformed reports and applied renderer/hook/release failure |
| execution-wiring-owner | Tests call the actual execute owner; documented single-call downstream runCli seam matches the approved ownership contract |

Red-green reproductions preceded implementation and repairs for inline UTF-8 bounds,
mandatory mutation/twin decoding, malformed acquired finalizers, malformed commit
accessors, oversized fallback facts, structural schema protocol access and real ESM dynamic
import namespaces. The ESM regression was discovered during the mandatory final
production-call-path audit after task completion and fixed before handoff. The
initial infrastructure failure was missing worktree TypeScript; npm ci restored
the unchanged locked development dependency before behavior testing. Final registered
run IDs and bounded artifacts are recorded in execution-lifecycle-output.json.

Concrete invariant audits check package.private, absent runtime dependencies,
unchanged four exports, no eager heavy imports or direct process output, no
suppressions, no execution-owned stubs, canonical constructors, declaration-derived
source resolution, and clean git diff --check. No consumer repository or git
lifecycle operation was used.

## Context-review repair: finalizer retention

The validator reopened context-and-runners after finding that enumerable metadata
capture omitted prototype/non-enumerable release methods and rejected invalid app
metadata before retaining cleanup. Twenty additional focused cases were added;
nineteen failed behavior assertions before repair. The implementation now obtains
the nearest release descriptor without executing getters, retains a callable method
for a successful acquisition before capturing the other fields, and invokes it
with the original acquisition object as receiver. The generic metadata capture
omits only the independently captured release field; other owners retain their
existing strict capture behavior. Valid methods run once after hook settlement;
malformed app metadata takes the contract-refusal cleanup path. Async cleanup
rejection remains a secondary KERNEL_RELEASE failure.

The tests cover prototype/non-enumerable methods across success, refusal and
cancellation; all three release placements against missing, inherited, accessor
and non-enumerable app fields; receiver identity; awaited cleanup failure; and
refusal of a shadowing release getter without invoking it or a prototype method.
This fixes the reopened finalizer criterion under governing decision 6. The binary
advisory is retained explicitly above as an unresolved downstream dependency.
