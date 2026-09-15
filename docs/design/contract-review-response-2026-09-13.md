# Response to the interface review

Response to [the review and command census](contract-review-2026-09-13.md) from
conversation `eb9d2da9-4523-40f3-9bf9-2dc917b073a2`, 2026-09-13.

The review is substantially right. The scaffold preserved useful constraints but
overstated both its verification and its coverage of the consumers. In particular,
a passing suite containing expected errors was insufficient evidence for the
recursive result types. My earlier 8.75/10 assessment was too generous.

This response fixes the two demonstrated compiler defects and adds the missing
interface comments. It records the broader API recommendations for a coordinated
revision. **“Accept” below means agreement with a proposed change, not that the
change is already in the TypeScript definitions.** Runtime functions remain
throwing stubs, and neither consumer has been modified.

## Changes completed

1. **Finding 1: reproduced and fixed.** A fresh compiler program, with no negative
   fixtures or suppressed diagnostics, failed with TS2589 on its first valid
   `accepts<Result>({ ok: true, data: null })` comparison. Authoring aliases now
   require explicit DTO types: `Result<Data>`, `Success<Data>`, `Failure<Data>`,
   `CommitReport<Receipt>`, `Payload<Data>`, and `Envelope<Data>`. Framework
   boundaries use `AnyResult`, `AnySuccess`, `AnyFailure`, `AnyCommitReport`,
   `AnyPayload`, and `AnyEnvelope`, whose data slots are anchored `JsonValue`
   types. Shared private shapes preserve the discriminated unions. `Any` here
   means any supported JSON DTO, not TypeScript `any`.
2. **Finding 13, widened argument names: reproduced and fixed.** A negative
   fixture initially failed with an unused expected-error directive because a
   declaration with `name: "id" as string` compiled. `ValidSpec` now rejects
   widened argument names, preserving the argument-key inventory.
3. **Finding 14: comments added.** Static domain context versus live help context,
   instruction ownership, payload-failure propagation, input overflow, recovery
   retention, and canonical forbidden roots are documented beside their types.

The typecheck wrapper now compiles `type-tests/result-defaults.ts` in a separate
TypeScript program **before** running the suite containing expected errors. That
fixture forbids diagnostic suppression and exercises the first valid comparison,
ordinary DTO interfaces, widening into every framework alias, and literal/DTO
handler returns. The negative fixtures still reject non-JSON values and illegal
result combinations. This directly addresses the error-type caching mechanism
that let the earlier suite pass.

## Disposition of every finding

| Finding | Response | Status |
| --- | --- | --- |
| **1. Recursive default results** | Accept the demonstrated bug and the author/framework split. Do not use the covariance-breaking short circuit. | **Fixed**, with isolated positive controls. |
| **2. Missing text renderer** | Accept an optional pure primary-output renderer in the lazy runner, typed to that runner's data. The pipeline owns diagnostic and guidance lines, stream selection, and bounds. Receiving the same data does **not** prove equivalent disclosure: a renderer can omit or invent facts. Keep parity tests and reserved-prefix checks. | Proposed runner revision. |
| **3. Input features and globals** | Accept the measured needs: derived file inputs, repeatable flags, defaults, variadics, URL validation and global inputs. Separate caller inputs from parsed inputs: a defaulted flag is optional to the caller and present for the handler. Global values must reach context acquisition through a typed declaration; derived names must participate in collision checks. | Proposed input revision, together with 19. |
| **4. Doctor recovery** | Accept central derivation and nested paths. Register one **runnable read invocation**, not a path-constrained command requiring callers to fill its arguments again. A cursor-bearing continuation may supplement recovery; it must not replace the mandatory doctor pointer on exit 3. | Proposed error/delivery revision. |
| **5. Refusal rationale** | Accept a catalog-level `why` default with an explicit contextual override. The policy sentence should have one owner, while a refusal may still need instance-specific context. | Proposed catalog revision. |
| **6. Mandatory prepare/commit** | Accept a direct `run` form for writes without structured payloads. Payload writes retain decoder/prepare/commit. Do **not** simply drop applied recovery: a successful commit followed by guidance conflict or delivery failure still needs durable IDs inline. A compact projection can remove duplicated receipts once its ownership is explicit. | Proposed runner/effect revision with the recovery obligation retained. |
| **7. Optional payload validation** | Accept. Declare the decoder in the lazy module, and have execution validate before preparation in both the mutation and its twin. This makes schema validation unavoidable; it does not prove that preparation is side-effect-free or that a remote server has no additional validation. | Proposed runner revision. |
| **8. Authoring noise** | Accept optional flags by default, required positionals by default, omission of empty caller objects, key-derived selectors, optional release and removal of the single-valued collision argument. Rename the factory coherently when binding context/catalog. A 32 KiB default is reasonable but comes from the proposal, not a normative skill. An executable name alone is insufficient to derive a location safe for both consumers' artifacts. | Proposed input/runtime revision; keep explicit artifact policy until runtime resolution is defined. |
| **9. Repeated effect shapes** | Accept one operation-effect model reused or projected across commit, execution and wire types. Preserve the distinction between an operation report and an internal provenance stamp. Derive valid success/failure combinations from the model so `success + unknown` remains impossible. | Proposed effect revision. |
| **10. Two arbitration seams** | Accept. Rule evaluation should return candidates with provenance; the response owner combines those with handler guidance and arbitrates once. Rule firings on an authoritative server and conflicts discovered on the client still need logging at their respective owners. Removing a redundant sink parameter must not remove remote observability. | Proposed guidance/delivery revision. |
| **11. Registry facts elsewhere** | Accept registry-owned live-help eligibility and runtime resolution of artifact policy from environment/application context. Keep related paths as strings with registry validation for now: token thunks add another initialization mechanism without proving same-CLI membership. Prefer typed help sections to an unrestricted metadata bag. | Proposed metadata/runtime revision; related-path decision retained explicitly. |
| **12. Command and catalog on context** | Accept `ctx.command` and `ctx.errors`. Injection alone cannot reject a foreign-catalog error: handler results, preparation and commit types must carry the bound domain-code set, plus the kernel's codes. Bind this once with the context contract, not through a new generic at every call site. | Proposed family/context revision, together with 15. |
| **13. Smaller holes and vestiges** | Widened argument names are fixed. Accept structured help snapshots, issue details, and a usable default host. Reserve a kernel error catalog based on the actual failure taxonomy. Remove the unsupported `job` distinction until a kit gives it semantics. Do **not** waive required secret inputs without a declared ambient credential source: doing so produces an incomplete invocation. | **Argument defect fixed**; other revisions proposed; unconditional secret omission declined. |
| **14. Interface comments** | Accept the listed omissions. Comments now state the current abstraction and identify the planned decoder replacement without claiming it exists. | **Fixed** for the reviewed gaps. |
| **15. Per-command context** | Accept the coverage gap. Bind a consumer-defined context map once; a command selects a literal context key, and `none` removes `app` and skips acquisition. A free-form tag that leaves every handler with the same mandatory app would not solve this. | Proposed family/context revision. |
| **16. Read payloads** | Accept. A read may declare a decoder without receiving a validation twin. Share the decoding mechanism with payload mutations; do not treat raw-document ingestion as structured JSON validation. | Proposed input/runner revision. |
| **17. Binary artifacts** | Accept the missing capability. Add a delivery-owned artifact request distinct from JSON data. Define media type, filename/output selection, byte source and manifest semantics together. Merely adding `"binary"` to `format` leaves the important contract absent. | Separate artifact-contract proposal; currently unsupported. |
| **18. Host access** | Accept. Context acquisition needs the injected host, and waits need injected clock/sleep through their handler context. Keep process-output handles out of both handler results and rendering callbacks. | Proposed context/runtime revision. |
| **19. Additional input forms** | Accept the documented needs and combine them with 3. File inputs must distinguish decoded text/documents from structured payloads and support stdin deliberately. Passthrough after `--` must be opt-in and preserve exact token boundaries. | Proposed input revision. |
| **20. Multiple selector flags** | Accept the consumer requirement but adjust the encoding: derive the common selector from the level key; consider an explicit selector tuple only for a declared combination such as `--context --full`. The same declaration must drive parsing/help, with ambiguous selector sets rejected; combinations may intentionally share flags. Do not restore a mandatory duplicate selector string on every level or assume kb's flags may be renamed now. | Proposed input design decision; compatibility remains unresolved. |
| **21. Live progress** | Leave unsupported until its contract defines capture, cancellation, stream ordering and byte accounting. The proposal excludes **streaming export**, not categorically every progress event. cctl also retains queue-position information in JSON; a blanket “drop it in JSON” rule could discard evidence. | Explicit delivery decision deferred. |
| **22. JSON-volume exceptions** | Accept a testing-only, typed inventory naming the command, the extra disclosure, its reason and its deletion condition. Exceptions may relax parity, never the final serialized-byte bound. | Proposed testing contract. |
| **23. Verbatim raw output** | Record the incompatibility. An unterminated byte-identical stdout block plus metadata on stderr cannot fit the current response contract. Neither a general raw-output escape hatch nor a consumer wire cutover is approved by this review response. | Explicit consumer/delivery decision deferred. |

## Proposed next contract revision

Four connected changes should be designed together instead of adding isolated
fields to the current generics:

1. **Input declaration and derivation.** Model caller input, parsed input, file
   sources, defaults, repetition, trailing arguments and selector groups in one
   place. Requiredness differs between caller and handler after defaults and
   credential resolution. Registry validation owns generated-name collisions.
2. **Command-family binding.** Bind the context map, domain error catalog and
   global inputs once. Each spec selects its requirement. Offline commands receive
   no app; other handlers receive the selected context plus the correct command
   token and catalog. Result types must preserve catalog membership through the
   lazy-module boundary.
3. **Runner modules.** Support ordinary reads/writes and structured-payload
   reads/writes. Payload modules declare their decoder. Typed primary renderers
   stay beside the corresponding runner, including distinct data types per level.
4. **Response ownership.** Centralize effect variants, doctor recovery and compact
   receipt facts. Evaluate guidance where state lives, then arbitrate once during
   response assembly. Keep input validation, required guidance and applied effects
   visible through delivery failures.

Acceptance examples for that revision should cover a context-free doctor/init,
a payload read, a payload write with its twin, a scalar write, defaulted/repeated
and file-derived flags, variadic search, a typed text renderer, an injected wait,
and an artifact policy derived from runtime state. These are compiler examples
until implementation is authorized. They do not substitute for consumer pilots.

Binary delivery, live progress and verbatim output need separate semantics. Their
absence remains a documented coverage gap. This response does not claim the
current scaffold can host every command in the census.

## Decisions that remain with Alex

- Domain branding remains opt-in through `kind: "id"`; ordinary strings remain
  available. Do not require either consumer to brand its entire storage model.
- Whether kb keeps `--dry-run`, adds validation twins, or changes its existing
  verbs remains a consumer migration decision.
- Keep the current draft's text-valued hints and structured invocation references
  until the wire representation is reviewed. No consumer wire cutover follows
  automatically from changing these TypeScript contracts.
- Resolve selector compatibility, live progress and the verbatim memory block
  against the actual consumers before approving their delivery behavior.

## Verification and score

The regression evidence is the isolated positive result program, the widened-name
red/green fixture, and the complete compiler suite. Source typechecking and ESM
declaration build pass. The generic-to-framework assignments also compile against
the emitted package declarations with source aliases removed. All exported
runtime functions still throw the scaffold error.

Current contract score: **7.5/10**, six of eight diagnostic rows pass after the
comment repairs. The failing rows are **interface simplicity** (clear with input
defaults, shared family binding and the ordinary-write form) and **implementation
change isolation** (clear by centralizing effect/recovery policy, catalog ownership
and help eligibility). Module depth cannot be established by stubs; even after
these two rows are resolved, a 10/10 claim needs the implementation and consumer
pilots to support it. The review's underlying criticism matters more than the
earlier numerical estimate.
