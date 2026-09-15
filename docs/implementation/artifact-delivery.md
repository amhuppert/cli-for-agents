# Bounded text and binary delivery

Governing source: charter source-of-truth entry 1,
`.cc/graph-workflow-docs/implementation-contract.md`, decisions 6 and 10–12.
The user selected **Add opt-in host cleanup** in question batch
`q_89cbb93c-e7b1-47f4-a051-41ee21699e98`, authorizing the optional host extension
needed for working retention. No consumer repository or public package export
was changed, and the package remains private with no runtime dependencies.

## Production seams and ownership

`internal/artifacts.validateOutputBudget` is pure: it defaults to 32768 bytes,
uses canonical `values.bytes`, and rejects unsafe integers or budgets below 8192.
Runtime-composition must invoke it before loading handlers/acquiring contexts,
including its offline/usage paths. This context implements and tests the seam;
the separately assigned composition context owns the production invocation.

While the application remains open, runtime invokes its configured
ArtifactPolicySource.resolve with app/env, then `resolveArtifactPolicy(policy,host)`.
That resolver validates existing directories and forbidden roots, canonicalizes
paths, validates retention and freezes an app-free snapshot. Private provenance
prevents forged resolved policies from reaching the writer. Runtime retains that
snapshot object itself (do not JSON-clone the branded policy), releases the app, assembles the response and invokes `deliver` for every
response class. Neither policy delivery nor cleanup reads or reacquires an app.

`deliver(AssembledResponse,options)` is the single final bound. It preserves the
assembly's guidance selection and classification; it never re-arbitrates.
Only a measured pair of serialized streams receives the RunResult brand. Handler
and primary-renderer code receives no process output handle or delivery bypass.

## Byte reservation and response layout

`measureOutput` counts the actual UTF-8 bytes of stdout and stderr separately and
adds them, including JSON escaping, framing and newlines. Inline output at the
exact limit is accepted. Optional body/detail/diagnostic/advisory-hint content
spills or is explicitly omitted. Valid instruction, selected reminders, effect,
recovery, primary code/class/rationale, doctor/continuation and existing
manifest remain intact. Ingress rejects oversized mandatory values; delivery does
not truncate them. Secondary artifact failures use the canonical KERNEL_OUTPUT
catalog constructor/classification, preserving an existing primary error.

Text success uses stdout and includes applied-write receipts even when custom
primary text omits them. Text failure is coherent stderr. JSON is exactly one
envelope on stdout. Diagnostics remain top-level issues only on success and
error.issues on failure; why remains failure-only.

Minimal text first uses normal shell references. If quoting exceeds the budget,
`doctor argv` and `continuation argv` expose JSON token arrays for the current
executable, avoiding shell apostrophe expansion and repetition of an arbitrarily
long executable spelling. If Unicode prose escaping still exceeds the reservation,
text uses the compact JSON envelope on the same selected stream. Its structured
references preserve original token boundaries. Renderer ingress reserves artifact,
doctor argv and continuation argv labels as well as existing protocol labels.

Tests fill all reserved groups simultaneously: 1024-byte instruction/reminders/
recovery/references, 2048-byte manifest, and maximal primary diagnostic summaries.
Actual JSON and text output fit 8192 with apostrophes, backslashes, Unicode
separators and emoji, including secondary delivery failure. Optional content is
never dumped during fallback.

## Atomic files and manifests

Automatic spill stores the complete JSON envelope and reports contains=response.
Explicit JSON --out stores inline DTO data and reports contains=data; other
nonbinary response spill paths store the JSON response. Thus artifact format/media
are independent of the selected final text/JSON stream presentation.
Binary output always stores raw bytes and reports format/contains=binary.

Relative --out is interpreted inside the policy directory; absolute --out must
also remain within it. Both automatic and explicit destinations obey canonical
forbidden-root checks, including symlink ancestors, nested forbidden subtrees and
prefix lookalikes. Directories must already exist; the library guesses no location
and creates no dataset directory. The writer checks manifest feasibility before
publication and snapshots bytes before awaiting host operations.

One Host.files.writeAtomic path provides flushed no-clobber publication, identical
content reuse and collision refusal. The manifest reports the absolute canonical
path, exact byte count and lowercase SHA256, actual requested format/media, reason
and contains discriminator. Invalid host digests and over-budget manifests are
refused before writing. Write errors expose only bounded diagnostics, including
when publication occurred before a later host flush failure. Known domain operation
receipts survive; the library invents no artifact or operation receipt on failure.

## Opt-in retention

Host.files.retention is optional and provides direct regular-file listing plus
content-checked removal. Node and test hosts implement it; old injected hosts work
without it when retention is off. Configured retention on an unsupported host is
rejected during policy resolution rather than silently ignored.

Expiration runs lazily before artifact writes, never on import or a timer.
Automatic files created with retention enabled receive an atomic
`.agent-cli-retention.json` sidecar containing creation time, name, bytes and hash.
Age means elapsed time since first creation. A sweep keeps the artifact currently
being written/reused, scans direct children only, and checks canonical location,
current and retained forbidden roots, sidecar shape, exact bytes and content hash.
Invalid/unrelated metadata, replaced contents, symlinks and protected explicit
outputs are left intact. Metadata symlink writes are refused.

Explicit --out paths shaped like automatic names receive a durable
`.agent-cli-keep` protection record before publication. Later automatic reuse
cannot make that file expirable. Ordinary explicit outputs require no sidecar.
Both metadata suffixes are reserved. Default automatic delivery creates no
retention metadata and performs no listing or deletion.

The Node host's existing portable-filesystem limitation applies: checks and
publication/removal cannot lock ancestors or directory entries against a separate
process concurrently replacing them. Stable symlinks and changes between calls
are checked; no portable directory-descriptor-relative guarantee is claimed.

## Finite binary requests

Public `binaryArtifact` delegates to the private dependency-free binary owner.
The constructor requires exactly four enumerable data properties, a finite
Uint8Array, safe basename (at most 128 UTF-8 bytes), valid bounded MIME type with
optional parameters, and JSON summary. It rejects accessors without invoking them,
stream-like inputs and non-JSON summaries. Mutable input bytes and summary are
snapshotted. The frozen request exposes a detached byte copy on each observation;
private provenance prevents forged requests from reaching deliverBinary.

`deliverBinary` always invokes the same policy-checked atomic writer, including
empty exports and explicit --out. Bytes never enter a JSON DTO slot. The response
uses an artifact payload with the original JSON summary when it fits; oversized
summaries are explicitly omitted while retaining the artifact and protocol.
Runtime/execution should retain the constructor-produced request object, use its
summary for primary rendering, and pass it separately through AssembledResponse;
do not JSON-clone a binary request. Its bytes property intentionally returns copies.

## Acceptance and validation

67 focused tests in tests/delivery.test.mjs cover all delivery acceptance surfaces:

- Default/floor validation, serialized combined-stream thresholds and maximal
  protocol feasibility in actual JSON/text, with secondary failures.
- App-free canonical policy, exact spill/data contents, atomic byte/hash metadata,
  symlinks, forbidden roots, matching/unrelated collisions and explicit no-clobber.
- Real Node and deterministic retention, default-off behavior, unsupported hosts,
  protection of explicit outputs, changed contents and metadata-symlink refusal.
- Binary identity, empty exports, metadata/summary validation, detached buffers,
  explicit out, oversized summaries and cancellation before publication.
- Unwritable/overlong/unreportable paths, post-publication failures, original exit
  3 and applied/unknown recovery, required guidance and renderer label protection.

Missing behavior was confirmed red before implementing each stage. Additional red
reproductions drove forged-policy protection, metadata symlink refusal, canonical
forbidden-root rechecks and renderer label guards. Response and host regressions,
full tests, full typecheck and full build are recorded with settled IDs in
artifact-delivery-output.json. Charter scans verify private/dependency-free scope,
canonical units/catalog errors, no eager heavy value imports, no direct process
output and no remaining stubs in the delivery/binary owners.

## Context-review repair: secondary failure retention

The review reproduced lost release/rendering failures during compaction. Delivery
now appends the latest artifact failure to the existing secondary list instead of
replacing it. Full messages and order survive when they fit. If diagnostic counts
or prose overflow, a measured fallback keeps one structured entry per distinct
KernelCode and explicitly discloses omitted prose/repetitions. At simultaneous
maximal protocol sizes, primary diagnostic message detail may also be replaced by
an explicit omission message; original code, class and rationale remain intact.
This uses decision 11's diagnostic-summary compaction while satisfying decision
10's separate secondary-code preservation. Required guidance, recovery, references
and manifest are unchanged.

Six regressions cover JSON/text omission, explicit out failure and oversized binary
summary fallback. Maximal protocol tests additionally retain every kernel code
from 270 secondary diagnostics and a later delivery failure within 8192 bytes.
All 63 focused delivery tests passed: vrun-95fc6783-1f43-4264-b29b-a8ad53ba8265.
The metadata current-forbidden-root finding is repaired as described below.

## Context-review repair: metadata publication roots

Automatic ownership metadata and explicit-output protection metadata now resolve
current forbidden roots before publication, checking those targets together with
the retained root spellings. Cleanup and both metadata publishers share the same
root-resolution helper. Containment normalizes trailing separators so a missing
directory-only target cannot be replaced by a metadata file at the same location.

Four real Node regressions replace a formerly allowed forbidden-root directory
with a symlink to the prospective metadata target, with/without a trailing slash.
Both metadata writers reject before that target reaches writeAtomic. For automatic
ownership, the allowed data file may already be published; the metadata failure
propagates into bounded delivery failure while preserving operation facts. Explicit
protection fails before the requested output file is published. No concurrent race
is needed by these tests, and the prior portable concurrency limitation is unchanged.

Both reported findings and the directory-only variant were reproduced with failing
behavior assertions before repair. Final settled validation IDs are in the structured
output artifact. Governing source entry 1 decision 12 requires canonical forbidden
root enforcement for every artifact-related publication, including metadata.
