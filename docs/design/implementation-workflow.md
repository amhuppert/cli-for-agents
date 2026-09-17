# Implementation workflow: first usable library

This is the planning contract for a saved Command Center graph, not authorization
to run it. It resolves the earlier proposal/review conflicts for this milestone.
The workflow must be reviewed and launched separately. It does not establish a
session Alignment charter.

## Scope

Deliver the four public package surfaces as a working ESM TypeScript library,
with no runtime dependency: command authoring, runtime, pure authoritative
guidance, and consumer testing. Include the accepted input/context/runner/response
revisions, strict parsing and help, automatic bounded artifacts (including finite
binary exports), Node process behavior, packaging/startup checks, and two executable
consumer-shaped pilots maintained in this repository.

Do not modify cctl or kb, replace Commander, publish the package, migrate consumer
wire formats, synchronize plugin copies, implement HTTP/job/gate/identity/digest
kits, add live progress or raw-output escape hatches, or implement streaming
exports. The local pilot uses a real temporary JSON-backed store, not SQLite;
the remote pilot uses a real loopback HTTP server. Neither proves an actual
consumer migration. Keep package.private true.

## Governing decisions

1. The current scaffold is a starting point, not a frozen API. Preserve its
   regression protections, including isolated positive result checks and exact
   literal input inventories. Use explicit DTO author types and anchored Any*
   framework types; do not restore JsonData<JsonValue> defaults.
2. Bind a context map, domain error catalog and global flags once with
   commandsFor<Contexts>()({ errors, globalFlags }). The returned family supplies
   defineCommand(spec, binding); createCli consumes the family and its commands.
   A spec selects a literal `requires` context key; `none` skips acquisition and
   removes app from handler input. Providers are keyed by the context map and
   receive typed globals, env, host and cancellation. Result/preparation/commit
   types carry the family's code set plus KernelCode. Runtime rejects foreign
   codes/commands even after JavaScript or type erasure. No obsolete factory
   compatibility alias is required for this unpublished package.
3. Separate caller/example inputs from parsed handler inputs. Flags are optional
   unless required; arguments are required unless optional. Defaulted values may
   be omitted by callers and are present for handlers. Omit empty caller args/flags
   objects. Include finite enum, URL, integer, string/pattern, optional domain ID,
   repeatable flags, final variadic argument and explicitly declared passthrough
   after `--`. Required variadics need at least one item. Reject incompatible
   default/required/repeatable/file-source combinations at registration.
4. A file-valued input supports paths and `-` stdin. A string input may declare a
   derived --name-file alternative, bounded by declared bytes and exclusive with
   its inline spelling. Resolve it to text before the handler. Structured --file
   payloads are a separate declaration. Raw document ingestion uses file input,
   not a fictitious JSON schema. Source kinds, generated names, help and parser
   acceptance derive from the same declaration. Bare required secrets cannot be
   omitted in a supposedly runnable hint; only explicitly declared environment
   credential fallbacks allow secret-free invocation construction.
   Reject more than one selected stdin consumer before reading any input; do not
   make two declared sources race over the same stream.
5. The default detail selector is derived from its level key. An optional
   nonempty tuple declares a combined selector. Choose the unique most-specific
   matching set; reject ties/incomparable matches and extra selector tokens. Thus
   --context can select context and --context --full can select full when those
   exact sets are declared. Domain filters remain independent. Global/generated
   name collisions are rejected within each complete leaf input model. Different
   leaves may reuse a name with different kinds or generated/domain roles. Global
   and framework help/JSON/version flags may surround route tokens; command-specific
   flags follow the complete leaf path.
6. Plain reads and scalar writes have a direct runner. Structured-payload reads
   and mutations declare Standard Schema v1 decoders in their lazy modules.
   Local flag, file, JSON and schema errors fail before context acquisition that
   could contact a network. Payload writes then share prepare with their generated
   validation twin; commit accepts an invocation-scoped prepared token with payload
   hash. Runtime rejects cross-command, cross-run and already-consumed tokens.
   Read payloads have no twin. Preparation purity remains an application promise,
   not something a TypeScript brand proves. Remove effects:job until a kit owns it.
   The private execute seam accepts a caller-supplied post-operation hook and
   finalizes a successfully acquired context exactly once when that hook settles,
   including rejection or cancellation. Runtime supplies guidance collection and
   app-dependent artifact-policy resolution as that hook. Resolve that
   policy to an immutable host-only value before releasing the app. Release exactly
   once in a finalizer on success, failure or cancellation, then assemble/deliver
   with the retained facts; release failure cannot erase an operation outcome.
7. Lazy runner modules may supply pure primary text renderers typed to their JSON
   data, with separate data types for levels. Provide a deterministic structural
   default. Renderers cannot supply guidance/diagnostic prefixes, process handles,
   or an unbounded delivery bypass. Same input does not prove parity: test text
   and JSON projections. Static help metadata includes typed titled sections;
   dynamic help is explicitly opted in by the command/group declaration.
8. One OperationEffect union owns read/not-applied/applied/unknown semantics and
   compact recovery facts. Success permits read or applied only. Preserve applied
   and unknown recovery facts after renderer/guidance/artifact failure. Application
   reports are distinguished from private runtime provenance. The catalog owns
   exit class and default rationale; explicit contextual rationale may override it.
   Register one runnable read invocation as doctor, allowing nested paths. Append
   it centrally on exit 3; a continuation supplements it instead of replacing it.
   A throwing/unacknowledged write gets a bounded unknown-acknowledgment recovery
   fact identifying the registered command and, for payload writes, its payload
   hash. Never invent a durable receipt ID. Only IDs already reported by the app
   are guaranteed; the fallback excludes secret input values and advises inspection
   through doctor/continuation before another mutation.
9. Rule evaluation returns candidates, stable provenance and firing events. It
   does not accept handler guidance or choose final instruction/hint. Response
   assembly arbitrates once over handler, local and decoded authoritative batches.
   A guidance provider may return one evaluated batch or a readonly batch array;
   each authority retains its own provenance and firing events. Invalid batches
   fail the response without discarding valid sibling guidance.
   Instruction suppresses hint; reminders are priority ordered with stable-ID ties,
   deduplicated and capped at two. Distinct required instructions produce one
   stop-and-report conflict. Evidence stays optional. A rule source requires a
   firing sink at its authority; local arbitration requires a conflict sink.
   Sink failure is visible as diagnostics without suppressing required guidance.
10. Domain failure remains the primary code/class if a later rendering/delivery
    failure occurs; record the secondary KernelCode separately. An otherwise
    successful request with guidance conflict or output failure becomes exit 1
    while preserving operation effect and compact recovery. Error diagnostics are
    only error.issues, success diagnostics only top-level issues. why occurs only
    on failure. Text success is stdout; text failure is coherent stderr; JSON is
    one envelope on stdout. No TTY branching, ANSI or cross-stream ordering premise.
11. Enforce byte limits on the serialized UTF-8 envelope, not rows or JS length.
    Default output budget is 32768 bytes; reject configured budgets below 8192
    before executing. Constructor/ingress limits measured as serialized JSON:
    instruction 1024 bytes; selected reminders combined 1024; recovery facts 1024;
    doctor/continuation references combined 1024; manifest 2048. Bound diagnostic
    summaries and prove the actual minimal JSON and text responses fit the reserved
    budget, including labels and shell-quoting expansion. The emergency text form
    may render invocation references as compact structured argv instead of a shell
    string; their original token boundaries remain recoverable.
    Oversized mandatory fields are contract-invalid input, not valid guidance to
    truncate. A malformed post-commit batch yields a bounded contract failure with
    known effect/recovery retained. The guarantee preserves valid bounded protocol
    fields, not arbitrary unbounded strings. Optional detail spills or is omitted
    with explicit omission facts; no fallback dumps the rejected body.
12. Artifact policy is explicitly configured, or resolved lazily from env/app
    after execution and before app release; retain an immutable host-only policy
    for delivery. No dataset-safe directory is guessed from the CLI name.
    Validate canonical forbidden roots and symlink-resolved destination ancestors.
    Atomic writes reject unrelated collisions and reuse identical content. --out
    follows the same policy. Return absolute path, true bytes/hash, format/media
    type, reason and contains discriminator. Retention is off unless configured.
    Binary requests carry a finite Uint8Array, media type, suggested basename and
    JSON summary separately from JSON DTO data; they always use the artifact writer
    and permit --out without a detail level. No streaming byte source is introduced.
13. Offline help/version/exit-codes and parse refusals import no handler and acquire
    no app. Optional help enrichment has one total deadline (default 500ms), at
    most three bounded blocks, and silent byte-identical static fallback. Explicit
    live-state commands use normal failures. Flow metadata describes help/reference
    sequences only; lazy steering constructs actual next-step invocations. Related
    paths remain registry-validated strings. Referenced skill-document paths must
    exist in the consumer's declared documentation root. Foundation types define
    the root/reference-validation seam: synchronous createCli checks graph shape
    without filesystem acquisition; asynchronous reference write/check tooling
    uses an injected or lazy host to reject missing or outside-root files.
    Page helpers accept already-paged
    sources, preserve unknown totals and require a typed read continuation when cut.
14. Node host supplies bounded file/stdin reads, canonical paths, clock/sleep,
    atomic files and hashing; runCli defaults to nodeHost but accepts injection.
    main drains streams before exit, handles EPIPE separately from other write
    failures and enables compile cache only when supported/opted in. Kernel imports
    no heavy builtin eagerly; optional application transport is app-owned.
15. Consumer contract cases are runner-neutral. A typed JSON disclosure-exception
    inventory names command, reason, extra fields and deletion condition; it never
    exempts the final byte bound. Architecture checks enforce lazy declarations,
    no direct process output in handlers, export privacy and an eager-import
    allowlist. Default consumer distribution is one bundled file. Record bundle
    sizes and a downward-only ratchet at the first real build; idle timing is
    advisory paired measurement, never a CI wall-clock gate. Prove Node 20 and the
    available current Node path, plus Bun bundle execution, in the compatibility job.

## Validation and launch preparation

Verified planning baseline: the worktree has the four stub entry points, positive
and negative compiler fixtures, npm/TypeScript 5.9.3, and local typecheck/build
wrappers. The canonical `cctl validate list` reports zero registered commands.
The scaffold and these planning files are not yet committed. A saved graph does
not carry uncommitted source into lane forks.

Compatibility runtimes are also launch prerequisites. The lane agent must invoke
these exact executables directly, without depending on an interactive shell or
`nvm` initialization:

| Runtime | Exact version-check command | Verified at review repair |
| --- | --- | --- |
| Node 20 floor | `/Users/alex/.local/share/cli-for-agents/runtimes/node20/bin/node --version` | Absent; must be provisioned before launch, and must report major 20 |
| Current Node | `/Users/alex/.nvm/versions/node/v24.16.0/bin/node --version` | v24.16.0 |
| Bun | `/Users/alex/.bun/bin/bun --version` | 1.3.14 |

The Node 20 path is a proposed fixed installation location, not a claim that the
runtime is installed. Normal launch preparation must provision it and confirm
these paths execute from a lane agent shell. If a location changes, update this
contract and the saved definition before launch. `baseline-harness` repeats these
checks before implementation and records resolved paths and versions in
`docs/implementation/baseline.md`; missing/incompatible runtimes halt at that first
context as infrastructure. `distribution-guards` consumes those same paths for
actual compatibility execution; no source inspection or skipped job substitutes
for a required runtime.

Before launch, use CC's normal source/config promotion flow to make the scaffold
available to lanes and publish canonical validation profiles. Do not ask workflow
agents to commit or modify the canonical checkout. Required command contract:

| Name | Canonical wrapper | Scope and resources |
| --- | --- | --- |
| typecheck | scripts/validate/typecheck.sh | Full only; isolated positive controls before negative fixtures; one process at a time, 1024 MiB |
| build | scripts/validate/build.sh | Full only; ESM/declarations; 1024 MiB |
| test | scripts/validate/test.sh | Full or exact .test.mjs file paths; compile first, then Node built-in test runner with concurrency 1 and 1024 MiB; reject directories/option tokens, never widen explicit paths |

The test launcher is a launch-preparation deliverable, not runtime functionality:
create the canonical wrapper and register cost 2 (coordinator plus one test worker), pathArgs paths, full/changed
entries selecting the same exact-path-aware wrapper. With no explicit paths it
uses the finite tests/**/*.test.mjs inventory and fails if none match. Full suite
starts once the baseline context introduces its harness controls. No test dependency
is necessary. Public contract, composition and pilot tests import built ESM through package exports. Tests of an internal owner may import that owner from the built internal relative path before public composition exists; this is not a consumer subpath export.

No unregistered name is selected in this draft's automatic script gates. Once
`cctl validate list` confirms the three names, apply the accompanying gate-binding
operations to the saved definition and revalidate/review that revision before
launch. The runnable revision uses typecheck+build at contract boundaries and
adds test at runtime boundaries; the plan's tasks already name those commands.
This is an explicit launch prerequisite, not permission to bypass cctl during
implementation. Do not start the workflow while a required canonical command is absent; the unbound saved draft is not the runnable revision.

Task conventions: red-green-refactor; run `cctl validate run test --queue-if-busy
-- tests/<exact-file>.test.mjs` in the TDD loop; types/config-only work uses compiler
controls. Settle launched checks. No tests may suppress unexpected diagnostics,
raise ratchets to hide failures or use broad type casts to fake provenance. Library
boundaries may establish brands only after runtime validation. Fixtures intended
to test hostile JavaScript must use the real untyped boundary and be labeled.

## Verification matrix and evidence owners

| Surface | Named test family | Owner of production caller |
| --- | --- | --- |
| Page counts/unknown totals/read-only continuation | tests/disclosure.test.mjs | page-disclosure (public page helper with real invocation tokens); pilots exercise it |
| Derived inputs/unknown flags/selector groups/secrets | tests/registry.test.mjs | runtime-composition |
| Local decoder, read payload, prepare/twin/commit, none/acquire/release | tests/execution.test.mjs | runtime-composition |
| Offline help, bounded live context, structured graph/reference --check | tests/help.test.mjs | runtime-composition; help-reference owns reference-check tool |
| Rule candidates, remote provenance, event failures, conflicting protocol | tests/guidance.test.mjs + tests/response.test.mjs | response-assembly; runtime-composition supplies providers |
| Unicode threshold, collision, symlink, binary identity, applied write failure | tests/delivery.test.mjs | runtime-composition |
| Drain, EPIPE, non-EPIPE write error, offline imports | tests/process.test.mjs | process-adapter |
| Export privacy, startup modules, bundled Node/Bun execution | tests/distribution.test.mjs | distribution-guards |
| Local store payloads/contexts/detail/artifacts | tests/pilots/local.test.mjs | local-pilot |
| Real loopback transport, authoritative guidance, disconnect continuation | tests/pilots/remote.test.mjs | remote-pilot |

The final context checks these named surfaces and owns baseline-attributed failures
introduced by this workflow. It does not acquire an unbounded obligation to repair
unrelated consumer repositories or historical defects. It may add bounded remediation
tasks for the enumerated delivered surfaces. Its live pass drives actual child
processes and the two executable pilots, not only imports or source inspection.
