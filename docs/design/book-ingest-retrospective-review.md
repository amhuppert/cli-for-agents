# Independent review of the book-ingest retrospective

Reviewed 2026-09-25 for cli-for-agents#3 against library commit `7fd35c1` and
book-ingest branch `csm/envelope-8f4f61` at `e559bcc`.

These are recommendations, not implementation receipts. This review changes no
production code and does not close the ticket's implementation acceptance criteria.

## Recommendation

Fix the confirmed bugs, then improve artifact ownership and validation previews.
Keep the framework's deliberate constraints. The largest opportunity is to stop
consumers reimplementing filesystem setup and validation presentation around the
kernel. Breaking changes are justified at those boundaries; a broad API rewrite
is not supported by this incident.

The retrospective locates real friction, but several remedies overreach:

- Never automatically serialize `prepared.value`: it is explicitly opaque.
- Capture application-dependent artifact policy before releasing the application;
  defer its filesystem work until delivery needs an artifact.
- A richer `start-check` does not replace every use of book's `preview`.
- A parity helper cannot infer all facts communicated by arbitrary prose.
- A library package does not need a CLI/server version-handshake system.

## Evidence and limits

Read the attached conversation compaction, the original retrospective window
(`#62–63`, raw sequences `20026–22200`, with excerpt limits), current library
sources, and the consumer's handlers, harness, guidance, and reference generation.
The current ticket agrees with the charter's issue descriptions.

Mechanical extraction from book-ingest's committed
`eval/runs/2026-09-25/results.jsonl`, filtering `condition === "proposed"`, finds
45 question records, 175 tool calls, 14 calls marked error or denied, and 8 marked
denied. The ticket's 9 allowlist denials are not independently established by
those flags. The records omit raw tool outputs, so they do not prove the cause of
every remaining failure or the claimed maximum response size in UTF-8 bytes.
Several records combine shell commands, making a tool-result size unsuitable as
a single CLI-response measurement. Do not treat the evaluation summary as proof
that the library has no runtime defects.

Fresh, isolated probes ran through the registered CC validators:

| Probe | Observed result |
| --- | --- |
| Strict Standard Schema assignment | Failed on `issues?: undefined` versus `issues?: never` (TS2322/TS2375); the separate `path` incompatibility is also present in the source. |
| Conflicting `runForTest` format | Missing expected `TypeError`; confirmed bug. |
| Missing artifact directory diagnostic | Generic `KERNEL_OUTPUT` with no directory cause; confirmed bug. |
| Small inline result with missing artifact directory | Exit 1 despite successfully computed inline data; broader lifecycle defect. |
| Root command reference | CLI name repeated in consecutive prose lines; confirmed bug. |
| Seeded virtual artifact directory | Small command succeeds with `files: { '/artifacts/.keep': '' }`. |
| Opaque preparation and generated validation | `Map` preparation remains private; validation succeeds with read effect and never commits. |
| Oversized response | Complete data spills with a manifest while inline output remains within the configured budget. |

Runtime evidence: `vrun-e9c38645-ad69-4e0f-8b12-9eb9d8db3dd6` (four expected
behavior assertion failures, three preservation checks passed). Type evidence:
`vrun-dc082961-bb10-41cc-985a-b8e66a645f3e`. Probes and full result receipts are
retained under `.cc/temp/`; the temporary failing type fixture was removed from
the normal type-test inventory afterward. The restored full typecheck passed in
`vrun-8302acf2-5e90-436b-a027-1bf0b6942d47`. These are reproductions for a review,
not completed red/green bug fixes.

Quality comes first: unnecessary command failure and weak test guarantees outrank
cosmetic output. Cost evidence is consumer duplication: the schema adapter,
artifact-directory helper, extra CLI registries, and parity diff code. There is no
verified attribution of implementation token cost or waiting time, so this review
makes no numerical savings or speed claim.

## What worked (preserve these)

| Mechanism | Evidence and property to preserve |
| --- | --- |
| Shared decoder and prepare step for write/check | `src/internal/execution.ts:149` and the fresh opaque-preparation probe: check runs prepare without commit; writes prepare again. A check is not a durable approval or a guarantee that later state is unchanged. |
| Atomic artifact delivery and bounded output | Fresh spill probe retained the complete response and stayed within budget. Existing delivery contracts preserve operation effect/recovery after output failure. |
| Host injection | The fresh in-memory fixture succeeds once its virtual directory exists; kernel tests need not touch the real filesystem. Domain SQLite integration tests can still use real services. |
| Registry-owned command paths, reserved flags, and continuations | Consumer handlers use declaration-backed invocations, and book's references reuse declarations. Preserve consistent `--file`, `--out`, `--json`, `--help`, and `--version` semantics. |
| Separate input and domain errors | JSON/schema decoding belongs to the kernel; semantic admission belongs to the consumer. Book already maps these layers in its guide. |

These constraints protect consistent invocation, input handling, and honest effect
reporting. They do not warrant opt-outs because an agent found them inconvenient.

## Changes to make

### 1. Restore the advertised contracts first

**Standard Schema:** match Standard Schema v1 exactly at the structural boundary,
including optional `undefined` members. Keep the runtime dependency-free. Use the
official interface as a compile-time fixture, covering failure paths and success
results separately so fixing one does not conceal the other. Include direct Zod
consumer compilation in package verification rather than maintaining an adapter.

**Format conflicts:** keep `runForTest`'s explicit format selection. A contradictory
explicit format flag is a test-call error and should throw before execution.
Reuse parser knowledge of explicit format presence; do not introduce a second,
loosely equivalent argv parser. Respect `--`, distinguish absent flags from
`--json=false`, and avoid fabricating duplicate flags. Malformed argv that tests
intentionally submit must remain testable as CLI usage errors.

**Artifact diagnostics:** preserve fixed framework causes and bounded, classified
filesystem explanations. A catch around an application-supplied resolver must
not blindly print every thrown message. When a write has already applied, better
output diagnostics must retain its effect and recovery facts.

Owners: `src/input.ts`, `src/testing/index.ts`, `src/internal/parser.ts`,
`src/internal/runtime.ts`, `src/internal/artifacts.ts`; existing type, testkit,
execution, and delivery test suites.

### 2. Let the kernel own artifact-directory creation

Adopt lazy creation, together with a directory-creation capability on `Host.files`
implemented by both Node and test hosts. Adding only `mkdir` leaves every consumer
responsible for when and how to call it. Adding only lazy resolution cannot create
the missing directory through the injected host.

Keep the policy declaration/snapshot stage while the selected app is alive.
Book's forbidden root comes from `input.app.dir`, and the provider closes its
SQLite handle on release. After release, delivery uses detached paths and roots;
it canonicalizes them, checks containment, and ensures the configured directory
only for automatic spill, explicit `--out`, or binary output. A small response
must succeed without a usable artifact directory. Retain snapshot failures until
artifact delivery actually needs that policy.

Check forbidden roots before creating directories. Preserve symlink-aware
containment, no-overwrite publication, and cancellation behavior. Create the
configured root recursively; keep the existing requirement for caller-selected
nested `--out` parents rather than silently creating arbitrary output trees.
Offline help and parse errors must still avoid application acquisition; retain
bounded omission when no application-derived artifact policy is available.

Also expose `createTestHost({ directories: [...] })` for explicit empty-directory
fixtures. The retrospective's claim that in-memory hosts force disk-backed command
tests is too strong: seeding a child already works. That workaround deserves a
proper fixture API, not a fake host that sees ambient disk state.

Owners: runtime policy collection, artifact delivery, `Host`, Node/test/capture
hosts, and `docs/implementation/consumer-testkit.md`.

### 3. Add an explicit validation preview, not serialization of preparation

Keep required generated twins for payload writes. Let successful preparation
return an optional JSON-safe `preview` alongside opaque `value`. The validation
result remains framework-owned, for example
`{ valid: true, payloadHash, preview: { counts, plannedChanges } }`. The ordinary
write still receives only its prepared value/hash and owns its commit result.
Use structural text rendering initially; custom presentation does not need a new
execution lifecycle in this ticket.

Allow normal successful-preparation guidance for the validation response; refusal
guidance already exists. Add a default write hint only when there is a faithfully
replayable invocation. Preserve arguments, nonsecret flags, global selectors, and
file origins, not just `--file`. Never embed credentials. Suppress the automatic
hint for consumed stdin, including scalar file alternatives, and when required
inputs cannot be represented. Consumer guidance takes precedence. A hint remains
advice, not authority to perform the write.

Book's `start` preparation retains source bytes and a full extraction. Its separate
`preview` does not require a destination; `start` requires one and refuses existing
packages. Consequently, this change can remove duplicate preview logic where
semantics coincide, but removing book's `preview` verb is a separate consumer
decision. Do not weaken write admission just to make the verbs interchangeable.

Owners: `Preparation`, mutation execution/report checking, canonical invocation
construction, and preparation/guidance tests. Consumer follow-up owns removal of
its redundant steering rule where the generated hint is sufficient.

### 4. Improve documentation, diagnostics, and packaging without new frameworks

| Ticket proposal | Judgment and concrete owner |
| --- | --- |
| Root description / bug 4 | Add optional `CliOptions.description`, use it for root help/reference, and omit missing or repeated prose. Own in runtime options, registry root metadata, help renderer/tests. |
| Filter and size command references | Accept. Select command paths from the real CLI and include selected writes' generated twins and ancestor navigation. Reject unknown selections. Keep the full CLI as the source for related-command validity; links may point to commands outside this guide. Return UTF-8 sizes for the generated block and resulting document. Existing `maxBytes` already rejects oversized output but is not a useful size report. Own in help/reference APIs and reference tests. |
| Automatically fit reference to budget | Decline automatic trimming or ranking. Consumers choose the relevant guide; report sizes and fail explicitly rather than silently dropping documentation. Test the final instructions command because Markdown size alone excludes JSON framing and other response fields. |
| Parity failure diagnostics | Accept. Report command, text-only fields, unexpected JSON-only fields, and stale exceptions as a deterministic diff. Own in `src/testing/contracts.ts` and its tests. |
| Automatic prose understanding | Decline. Keep field inventories, describe the helper as checking supplied inventories, and require consumer assertions for prose facts. Finding JSON leaf values in text cannot prove the reverse direction. Own that explanation in the consumer-testkit documentation; do not add an NLP engine or claim semantic proof. |
| Spill notice with sizes | Accept the distinction. Successful spill is normal delivery metadata, not a `KERNEL_OUTPUT` issue. Extend artifact payload metadata with measured inline bytes and budget; the manifest already records file bytes/path/reason. Render a notice from those facts in text and preserve them in JSON. Measure the attempted serialized response, not the artifact bytes. Keep real write/delivery failures as errors. Own in delivery, envelope decoding, rendering, and disclosure contracts. No generic severity/notification subsystem is needed. |
| Repeated why line | Omit it from text when it is exactly the message; preserve a distinct rationale and the structured JSON `why`. Apply centrally across error codes. Own in response rendering/tests. |
| Fresh local package | Add one clean build-on-pack hook (`prepack`) and a documented private yalc workflow, including dependency installation and consumer refresh. Verify the actual installed yalc lifecycle; do not assume it fires the hook. Test a real pack from missing/stale `dist` and an isolated consumer import/typecheck against that package. Keep `private: true` and gitignored `dist`. Own in package/build scripts, distribution tests, and README. |
| Commit stamp | Defer. A SHA alone cannot prove a build matches dirty source; a build-on-pack guarantee solves this incident directly. Add provenance later if a consumer will expose and inspect it. Do not copy the plugin's CLI/server handshake design into a library or add per-invocation Git work. |

## Delivery order and boundaries

1. Land bug reproductions/fixes and packaging freshness first. Add the root
   description and small diagnostic fixes in the same round if convenient.
2. Change artifact lifecycle and host capabilities as one coherent contract
   change. Verify real temporary-directory creation and no-write inline behavior,
   plus applied/unknown recovery after delivery failure.
3. Add validation preview and safe hint generation. Test opaque preparation,
   prepare-once per invocation, no commit on validation, stdin, secret inputs,
   globals, and consumer guidance precedence.
4. Add reference selection/sizing and parity diagnostics. Update the two consumers
   at their call sites rather than introducing deprecation shims.

For implementation, each bug needs a regression that fails on the original
behavior; then run scoped red/green checks and the registered broader gates.
Package tests must use the packed exports, since source-based imports cannot
detect stale shipped output. Keep generated documentation and contract prose in
sync with each breaking change. `ENVELOPE.md` also needs a factual refresh: its
claim that nothing outside this repository imports the library is now contradicted
by book-ingest; that does not require public compatibility promises.

Do not add batch commands to accommodate an evaluation shell allowlist, weaken
reserved flags, merge kernel/domain error taxonomies, remove validation twins,
increase the output budget to hide missing pagination, or change book's product
semantics inside this library ticket. Status pagination belongs to book-ingest.

## Interface-design diagnostic

The design skill's rubric has five demonstrated rows out of eight (6.25/10 as an
evidence score, not a measured product-quality rating): identifiable module
purposes, generally deep interfaces, useful interface contracts, explicit design
review, and meaningful ownership of decisions. Two rows fail in the reviewed
surfaces: implementation changes leak into consumer setup, and newcomers must
inspect implementation to understand artifact/validation boundaries. Kernel-owned
directory creation, explicit preview data, and updated contracts address those.
The time-allocation row is unmeasured; do not manufacture a percentage or add a
new time-tracking process for this ticket. Reassess the observable rows after the
consumer workarounds are removed.
