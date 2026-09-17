# Canonical API and runtime ownership inventory

Ownership map for the 40 functions and two constant objects across the four package
surfaces. All listed functions have implemented owners; no public path reaches the
unused private scaffold helper. No deep import below the four package export paths is
a supported consumer API. Source signatures are canonical, not copies in this
document; reconcile this map against `src` when a public signature changes.

## Public value exports

| Package surface | Export | Runtime owner | Contract / production caller |
| --- | --- | --- | --- |
| root | bytes | kernel-values | Validated finite byte unit; all bounded IO/delivery |
| root | count | kernel-values | Validated count; disclosure |
| root | milliseconds | kernel-values | Validated duration; host/help |
| root | id | kernel-values | Validated domain-branded identifier; parser/consumers |
| root | defineErrors | kernel-values | Finite catalog, reserved codes, default rationale; command families |
| root | kernelErrors | kernel-values | Sole finite kernel code/class/rationale inventory; every runtime owner |
| root | protocolLimits | kernel-values | Canonical UTF-8 serialized field/output limits; ingress and delivery |
| root | recoveryFacts | kernel-values | Bounded app-reported IDs; write handlers/execution |
| root | commandsFor | registry-parser | Binds context map/catalog/globals; consumers |
| root | defineGroup | registry-parser | Static group/help declaration; consumers |
| root | defineFlow | registry-parser | Reference-sequence metadata; consumers |
| root | invocation | registry-parser | Exact, credential-safe registered command reference; guidance/paging |
| root | validationInvocation | registry-parser | Payload-write twin reference, same caller inputs; consumers |
| root | mutation | execution-lifecycle | Checked lazy schema/prepare/commit module; payload writes |
| root | payloadRead | execution-lifecycle | Checked lazy schema/read/level module; payload reads |
| root | runner | execution-lifecycle | Retains checked Data/text pairing privately; response consumes renderer |
| root | writeRunner | execution-lifecycle | Commit-result Data/text pairing; response consumes renderer |
| root | page | page-disclosure | Already-paged source and typed read continuation; handlers |
| root | binaryArtifact | artifact-delivery | Finite bytes/media type/basename/JSON summary request; handlers |
| runtime | createCli | runtime-composition | Synchronous graph/shape construction via registry; consumers |
| runtime | runCli | runtime-composition | Resolve/execute/hook/finalize/arbitrate/assemble/deliver; process adapter/testkit |
| runtime | nodeHost | node-host | Lazy bounded Node capabilities; runCli and reference tooling |
| runtime | main | process-adapter | Drain streams, EPIPE, exit, optional compile cache; executables |
| runtime | helpNode | help-reference | Structured static registry projection; runtime offline route |
| runtime | commandReference | help-reference | Offline marker-block content generation; reference tooling |
| runtime | validateReferences | help-reference | Async file existence/canonical containment via lazy/injected host; build/check tooling |
| runtime | writeCommandReference | help-reference | Validates references then write/check named block; consumer tooling |
| runtime | decodeEnvelope | response-assembly | Validates untrusted envelope and bounded protocol; testkit/transport consumers |
| runtime | renderInvocation | registry-parser | Safe token rendering; response/help |
| guidance | hint | kernel-values | Bounded action and invocation constructor; handlers/rules |
| guidance | instruction | kernel-values | Bounded required protocol with owner ID; handlers/rules |
| guidance | defineReminderRule | guidance-candidates | Checked reminder declaration; state authority |
| guidance | defineSteering | guidance-candidates | Checked hint/instruction rule; state authority |
| guidance | evaluateGuidance | guidance-candidates | Candidates/provenance/firings only; local/remote authority |
| guidance | decodeEvaluatedGuidance | guidance-candidates | Validates transported candidate batches; runtime provider |
| testing | createTestHost | node-host | Implements file snapshots/call recording and deterministic clock/sleep cancellation; consumer-testkit and contract tests consume it |
| testing | runForTest | consumer-testkit | Concrete keyed contexts plus real runCli; consumers/pilots |
| testing | contractTests | consumer-testkit | Runner-neutral contract case inventory; consumers |
| testing | expectBounded | consumer-testkit | Checks final serialized stream budget; consumer cases |
| testing | createContractFixtures | consumer-testkit | Seven canonical fixture callbacks; consumers replace all callbacks to prove their domain paths |
| testing | expectDisclosureParity | consumer-testkit | Actual projection inventories plus typed disclosure exceptions; final byte bound always applies |
| testing | expectLazy | consumer-testkit | Declaration/help import laziness; consumer cases |

The family method `defineCommand(spec,binding)` belongs to registry-parser;
`ErrorCatalog.error(code,options)` belongs to kernel-values. They are callable
members, not additional package-level exports. No public parser, arbiter, execute,
prepared-token mint, policy resolver or artifact writer exists.

## Public type owners

| Source / exported type family | Canonical types | Owning runtime context |
| --- | --- | --- |
| values | ArtifactPath, Bytes, Count, Id, JsonData, JsonValue, Milliseconds, NonEmpty, Sha256, ShellSafe | kernel-values |
| input | Argument, CallerInputs, ParsedInputs, ParsedFlags, ExampleInputs, Flag, InputSpec, Inputs, PayloadDeclaration, MutationPayloadDeclaration, StandardSchema, ValueKind | registry-parser (declarations/parsing); execution-lifecycle (lazy schema) |
| commands | Command, CommandBuilder, CommandFamily, CommandExample, CommandSpec, DisclosureLevel, Flow, Group, HelpSection, Invocation, RelatedCommand, SkillReference | registry-parser; help-reference consumes the same metadata |
| runners | HandlerContext, HandlerInput, HandlerModule, MutationHandler, MutationModule, ReadHandler, WriteHandler, PayloadHandlerInput, PayloadReadHandler, PayloadReadModule | execution-lifecycle |
| results | AnyCommitReport, AnyEnvelope, AnyFailure, AnyResult, AnySuccess, CliError, CommitReport, ContractViolation, Effect, Envelope, ErrorCatalog, ErrorDefinitions, FamilyCode, KernelCode, ErrorOptions, ExitClass, ExitCode, Failure, Issue, OperationEffect, SuccessfulEffect, WriteEffect, OperationOutcome, CompactRecovery, ReportedRecovery, UnknownAcknowledgment, RecoveryReference, ResponseError, SecondaryFailure, Preparation, Prepared, Result, Success | kernel-values owns constructors/catalog/recovery; execution-lifecycle owns preparation/provenance; response-assembly owns envelopes/classification |
| disclosure | AnyPayload, AnyBinaryArtifactRequest, BinaryArtifactRequest, ArtifactManifest, ArtifactPolicy, ResolvedArtifactPolicy, Omission, Page, Payload, Total | page-disclosure (page/omission); artifact-delivery (policy/request/manifest); response-assembly (payload) |
| runtime host/context | Environment, Host, ContextProvider, ContextProviders, SelectedContext, InputFileSource, PostOperationContext, GuidanceSources, GuidanceProvider, ArtifactPolicySource, CliOptions, Cli, RunRequest, ResolvedRunRequest, RenderedText, RunResult | node-host (capabilities); execution-lifecycle (acquisition/lifetime and immutable nonsecret file origins); runtime-composition (wiring); artifact-delivery (bounded RenderedText/RunResult) |
| runtime help/reference | HelpContextProvider, HelpContext, DocumentationRoot, HelpFlag, HelpArgument, HelpNode, ReferenceIssue, ReferenceValidation, ReferenceHost, ReferenceOptions | help-reference |
| guidance | Hint, Instruction, RuleId, Reminder, ReminderList, HandlerGuidance, FinalGuidance, WireGuidance, ReminderRuleDefinition, ReminderRule, SteeringDefinition, SteeringRule, GuidanceRule, ConflictingInstruction, GuidanceConflict, GuidanceEvent, GuidanceEventSink, RuleRegistration, RuleFiring, ConflictEvent, FiringSink, ConflictSink, GuidanceProvenance, GuidanceCandidate, EvaluatedGuidance, GuidanceEvaluation | guidance-candidates owns rules/evaluation; response-assembly owns final selection; kernel-values owns bounded hint/instruction constructors |
| testing host | HostCall, TestHost | node-host owns implemented file/clock/sleep capabilities and recording; consumer-testkit consumes them |
| testing cases | ContractCase, TestRunResult, TestRunOptions, TestEvent, ContractCaseName, ContractEvidence, ContractFixtures, JsonTestRun, DisclosureException, DisclosureParity | consumer-testkit |

Any* types anchor JsonValue directly. Author DTO types have explicit Data/Summary
parameters. Do not add recursive JsonData<JsonValue> defaults or suppress isolated
positive diagnostics. JSON data, finite byte requests, manifests and final stream
text remain distinct.

Renderer helpers can import `JsonData<Dto>` from the package root to name the
readonly JSON projection passed to `runner` and `writeRunner` text callbacks.

## Private producer/consumer seams

| Source and symbol | Producer / owner | Consumer | Boundary obligation |
| --- | --- | --- | --- |
| internal/registry: register(CliOptions) → Registry | registry-parser | createCli/runtime-composition | Family/doctor/graph/input/reference shape validation; no host/app acquisition |
| internal/registry: resolve(Registry,argv) → Resolution | registry-parser | runtime-composition | Offline/leaf/invalid union; derived input inventory |
| internal/registry: ParsedInvocation | registry-parser | execution-lifecycle | Validated registered command + parsed input; retains family/code/globals |
| internal/execution: execute(invocation,resolvedRequest,contexts,postOperation) → CompletedExecution | execution-lifecycle | runtime-composition | Local/schema errors before acquisition; shared twin preparation and private run-token consumption |
| internal/execution: ExecutionResult / OperationOutcome | execution-lifecycle | post-operation hook, response-assembly | Application effects checked; private provenance separate from reports |
| internal/execution: ExecutionResult.renderPrimary() → string | execution-lifecycle | response-assembly | Exact runner/level renderer closed over validated DTO or binary summary only; invoked after release and bounded by delivery |
| internal/execution: unknownAcknowledgment | execution-lifecycle | execution failure handling | Registered path + optional payload hash only; no invented IDs or input secrets |
| internal/execution: PostOperationHook → PostOperationFacts | runtime-composition implements hook | execution-lifecycle invokes before finalizer | Collect guidance and resolve app policy while app is alive; retain detached immutable facts |
| internal/execution: CompletedExecution | execution-lifecycle | runtime-composition | Hook status and secondary failures; acquired context released exactly once after hook settles |
| internal/artifacts: resolveArtifactPolicy | artifact-delivery | runtime-composition post-operation hook | Validate/canonicalize/freeze host-only policy before release |
| internal/artifacts: writeArtifact | artifact-delivery | internal/artifacts deliver and deliverBinary | One atomic writer for spill/out/binary; canonical roots, symlinks, collisions, actual hash/bytes |
| internal/artifacts: deliverBinary | artifact-delivery | internal/artifacts deliver | Finite request always becomes artifact; no inline/raw-stream path |
| internal/response: arbitrate(ArbitrationInput) → ArbitratedGuidance | response-assembly | runtime-composition | Sole handler + local/authoritative candidate arbiter; required conflict sink |
| internal/response: assembleResponse(execution,options) → AssembledResponse | response-assembly | runtime-composition invokes; artifact-delivery consumes result | Central doctor, primary/secondary precedence and rendered primary text; retained effect/recovery and selected structured guidance; no final byte-bound claim |
| internal/response: AssembledResponse | response-assembly | internal/artifacts deliver | Branded envelope + primary text + structured guidance + optional separate binary request; sufficient retained facts for bounded fallback without another arbitration |
| internal/artifacts: validateOutputBudget(budget?) → Bytes | artifact-delivery | runtime-composition before execution | Default 32768; reject configured budgets below 8192 before handlers/context acquisition |
| internal/artifacts: deliver(AssembledResponse,options) → RunResult | artifact-delivery | runtime-composition for every response class | Combined-stream serialized UTF-8 bound, inline/spill/out/binary selection, truthful manifests, emergency fallback and final bounded RunResult construction |
| internal/brand: Brand | kernel-values and owning validated boundaries | all owners | Unexported unique symbol; brands only after runtime checks |
| internal/stub: notImplemented | unused historical placeholder | none | No imports or calls outside its own file; not a supported package export |

The erased runner's renderer is private state retained by execution-lifecycle's
checked wrappers. ExecutionResult.renderPrimary is the canonical data-closed invocation seam.
Response-assembly must consume the exact retained pairing, not
invent an exported `(JsonValue) => string` escape hatch. Runtime-composition is
responsible for passing post-operation candidates and handler guidance into the
sole arbiter after execution finalizes, invoking assembleResponse, then passing its
AssembledResponse to artifact-delivery deliver with the retained policy. Assembly
never writes artifacts or constructs the final bounded RunResult. Delivery never
selects guidance again; it preserves the assembled primary classification and
known effect/recovery when spill or serialization fails.
If policy resolution fails after guidance collection, the runtime hook returns
accumulated guidance/issues without artifacts. Failed hook results may retain
partial facts too. Preserve those candidates and the known outcome; use bounded
failure output without inventing an artifact directory. Decoder/renderer maps and run-token stores are
private implementation state owned by execution-lifecycle.

## Verification ownership

| Acceptance outcome | Current compiler evidence | Runtime proof owner / named family |
| --- | --- | --- |
| runner-variants | runner-positive/negative, family controls | execution-lifecycle: tests/execution.test.mjs |
| typed-rendering | runner-positive/negative; distinct level DTOs | response-assembly: tests/response.test.mjs; text/JSON parity in pilots |
| canonical-effects | response-positive/negative, isolated Any* controls | execution-lifecycle + response-assembly + artifact-delivery: execution/response/delivery families |
| guidance-ownership | response-positive/negative; evaluator handler:never and private branded arbitration | guidance-candidates + response-assembly: tests/guidance.test.mjs, tests/response.test.mjs |
| artifact-request-types | delivery-positive/negative; finite bytes, required summary/media/basename and --out | artifact-delivery: tests/delivery.test.mjs |
| contract-inventory | This exhaustive value/type/seam owner table | final-verification reconciles actual package exports and all owners |

Registry/help/runtime/process/testkit owners additionally prove tests/registry,
help, process and distribution families from the governing matrix. Local/remote
pilots prove composition through real executables. Private/dependency-free package,
no eager heavy imports, no handler/process output, literal/brand/Any* controls and
single arbitration remain global or context-scoped ratchets. Final verification
must reject leftover stubs, missing owner exports and unproven mandatory bounds.

## Ownership repair against approved criteria

Checked saved workflow revision 6 directly: node-host `host-exports` and
`clock-hosts` require both real and test hosts, including createTestHost. The
consumer-testkit context consumes that implementation and owns runner-neutral
cases and execution helpers. Package subpath placement does not change ownership.
Response-assembly `response-wiring-owner` requires an assembled response consumed
by artifact-delivery. Artifact-delivery `serialized-budget` and
`delivery-wiring-owner` require the final byte-bound path for success, usage,
domain failures, conflicts and secondary delivery failures. The explicit
assembleResponse → AssembledResponse → deliver signatures implement that contract
split; all three stages now have implemented production callers.

Conflict entries retain instruction plus handler ownership or candidate
command/authority/rule provenance. Both the conflict sink event and private
arbitration result carry these same entries; no detached instruction-only list
loses competing provenance. The delivery compiler controls exercise the typed
production handoff, partial policy-failure facts and conflict provenance.
