# Public contract

Status: implemented private ESM TypeScript library. The design proposal in this
directory preserves provenance; its scaffold-only status and proposed API spellings
are historical. Consumer repositories and wire formats have not been migrated.

Read [adding a command](../implementation/add-a-command.md) for concise examples
of plain/payload reads and writes, contexts, renderers and guidance. Source
signatures are canonical; deep source/dist imports are not supported.

## Public boundary

The package has four export paths, 39 function exports and two constant objects.
The [complete value/type/owner inventory](../implementation/api-inventory.md)
is reconciled with built ESM. Private brands appear in declarations for checking,
but their key and stamping mechanisms have no public export.

| Import | Implemented values |
| --- | --- |
| `cli-for-agents` | `commandsFor`, `defineGroup`, `defineFlow`, `invocation`, `validationInvocation`, `runner`, `writeRunner`, `payloadRead`, `mutation`, `defineErrors`, `recoveryFacts`, `page`, `binaryArtifact`, `bytes`, `count`, `milliseconds`, `id`; constants `kernelErrors`, `protocolLimits` |
| `cli-for-agents/runtime` | `createCli`, `runCli`, `main`, `nodeHost`, `helpNode`, `commandReference`, `validateReferences`, `writeCommandReference`, `decodeEnvelope`, `renderInvocation` |
| `cli-for-agents/guidance` | `hint`, `instruction`, `defineReminderRule`, `defineSteering`, `evaluateGuidance` |
| `cli-for-agents/testing` | `createTestHost`, `runForTest`, `contractTests`, `createContractFixtures`, `expectBounded`, `expectLazy`, `expectDisclosureParity` |

`family.defineCommand(spec, binding)` and `catalog.error(code, options)` are
callable members. No public parser, arbiter, artifact writer or unbounded renderer
seam is exposed. `examples/notebook` remains an intentionally compile-only fixture; the
local/remote pilots are the runnable examples.

## Declaration and input derivation

`commandsFor<Contexts>()({ errors, globalFlags })` binds the literal context map,
error catalog and globals once. Each command selects one `requires` key; `none`
skips acquisition and removes `app` from its handler input. `createCli` accepts
that family, member commands, groups, contexts, output policy and a runnable read
`doctor` invocation. Synchronous construction checks graph/reference shapes and
membership without importing handlers, acquiring app state or checking files.
Every context key requires a provider, including optional properties in the
context map; a provider may still return an optional app value when declared.

Keep specs literal, for example `as const satisfies CommandSpec`. The binding
contains nonempty examples and a lazy handler module loader. Widened/open input
inventories, unknown caller keys and secret suggestion values fail compiler
controls. Runtime admission checks JavaScript/erased values, duplicate paths,
parents, examples, catalog membership and name collisions within each complete
leaf input model. Different leaves may use the same flag name with different
kinds or generated/domain roles. Globals and framework help/JSON/version flags
may surround command-path tokens; command-specific flags follow the full leaf path.

Caller inputs and handler inputs are distinct:

- Flags are optional unless required; arguments are required unless optional or
  defaulted. Defaults may be omitted by callers and are present for handlers.
- Finite enums, URLs, integer ranges, string bounds/patterns and optional domain IDs
  are supported. Repeatable flags and final variadic positionals produce arrays.
  Required variadics need an item. Passthrough after `--` is explicitly declared.
- File-valued inputs accept paths or `-` stdin and resolve to UTF-8 text. A string
  flag can declare a bounded, exclusive `--name-file` alternative. Structured
  payload `--file` is a separate declaration. Multiple selected stdin consumers
  fail before reading; invalid input fails before application acquisition.
- Level keys derive selectors. Explicit nonempty tuples support combinations such
  as `--context --full`. Selection requires a unique most-specific declared set;
  ties, incomparable matches and extra selector tokens fail. Domain filters remain
  independent. An artifact-eligible level permits `--out`; finite binary commands
  permit it without a level.
- `invocation` checks exact caller inputs and preserves argument token boundaries.
  Secret flags are excluded; only a declared credential environment fallback makes
  omission runnable. `validationInvocation` targets the generated read-only twin.
  Runtime rebinding checks the current CLI's registry and accepted inputs.
  References must retain nonsecret scope/filter/cursor values supplied by the
  application. An invocation is plain JSON with no hidden identity: hints, error
  continuations and received references are all rebound by path against the
  current CLI before use.

The same `inputModel` supplies parser, help and invocation acceptance. `defineFlow`
is help/reference sequence metadata; lazy steering constructs actual next steps.

## Execution and context lifetime

| Behavior | Lazy module contract |
| --- | --- |
| Plain read | `ReadHandler` with default `run` plus exactly the declared level runners |
| Scalar write | `WriteHandler.run`, returning `CommitReport<Data, Code>` |
| Payload read | `payloadRead({ decode, run, levels? })`; no validation twin |
| Payload write | `mutation({ decode, prepare, commit })`; twin shares decode/prepare |

Payload modules carry a structural Standard Schema v1 decoder that matches the
official v1 types, including explicit `undefined` optional members, so Zod and other
conforming libraries assign directly under `exactOptionalPropertyTypes`. Schema
libraries are app-owned and lazy. File, JSON and schema errors occur before context
acquisition.

A successful preparation returns an opaque `value` and may add a JSON-safe
`preview` (any JSON value, typed by `Preparation`'s trailing `Preview` parameter)
and one hint or instruction. The kernel checks only the preview and guidance; it
never serializes or freezes the value. The validation twin returns
`{ valid: true, payloadHash, preview? }` with that guidance and never commits. The
write prepares again, ignores successful-preparation guidance and preview, passes
only `{ value, payloadHash }` to commit, and returns commit's own result and
guidance. A refusal's guidance applies to check and write alike. A check is not an
approval: preparation purity and durable domain truth remain application obligations.

A context provider receives typed globals, environment, host and cancellation,
and returns app state plus optional release, or a catalog error. Execution calls
the post-operation hook while the app is alive: it collects guidance and captures a
detached artifact policy snapshot (a static policy, or the resolver's result), then
releases exactly once. Capturing does no filesystem work; a resolver failure is kept
as a deferred policy failure. Release/hook failures cannot erase a known operation
result. Rendering and delivery occur afterward.

`runner` and `writeRunner` retain each DTO/text pairing privately. Renderers are
synchronous primary-text functions; reserved protocol prefixes and controls are
rejected. A deterministic JSON structural default is available when no renderer
is supplied. Actual text/JSON disclosure parity needs consumer tests.

## Results, effects and guidance

Author `Result<Data>`, `CommitReport<Data>` and other DTO-bearing types with
explicit data parameters. Ordinary interfaces work without index signatures.
Framework `Any*` slots anchor `JsonValue` directly; they do not recursively default
`JsonData<JsonValue>`. JSON boundaries reject cycles, nonfinite numbers, undefined,
functions, sparse arrays and non-plain objects, and keep a detached frozen copy.
Binary requests are distinct from JSON.

`OperationEffect` owns `read`, `not_applied`, `applied` and `unknown`. Success
permits read/applied only. Applied writes carry bounded `recoveryFacts` containing
app-reported IDs. An unacknowledged write gets unknown recovery identifying its
registered command and, for payload writes, its hash; no durable ID is invented.
Inspect doctor/continuation and saved state before repeating a mutation.

`defineErrors` owns code/class/default refusal rationale. Connection failures
centrally receive the registered read doctor; a continuation supplements it.
Exits are 0 success, 1 failure, 2 usage/local input, 3 connection/authentication and
4 version mismatch. A local input refusal names its stage in `message` (read,
UTF-8, JSON, file value or thrown decoder) and, in `why`, the flag, argument or
payload, its quoted path or stdin, and the cause, including the JSON parser's line and
column when available. Long paths are elided, secret paths are omitted, and file contents
and exception text are never echoed; returned schema issues keep their paths in `issues`.
Text omits the `why:` line when it exactly equals the message; JSON keeps
`error.why` on every error. Later rendering/guidance/delivery failures preserve an existing
domain classification and appear as secondary kernel failures. An otherwise
successful operation with a conflict/output failure becomes exit 1 and retains
known effect/recovery. `why` and failure issues occur only inside `error`;
success diagnostics occur only in top-level `issues`.

Handlers author one hint or instruction. Rules evaluate pure synchronous
predicates in the CLI process, returning candidates, provenance and firing events.
They do not arbitrate handler guidance. Sources with rules require a firing sink;
configured local arbitration requires a conflict sink. Evidence is optional.

A `GuidanceProvider` returns the one batch evaluated for the executing command.
A malformed or wrong-command batch is a contract failure; the runtime never
synthesizes firing evidence.

After a successful validation twin the kernel generates one fallback hint,
`Apply the validated payload: <tool> <write> ...`, when the original invocation
replays faithfully: arguments up to the first omitted positional, globals, repeated
and boolean flags, the payload file and file origins (`--name-file` paths, never
file contents). Rebinding and reparsing must reproduce the same parsed inputs. It is
omitted, without failing the check, for consumed stdin, a supplied secret, nonempty
passthrough or a reference over its byte limit; environment credential fallbacks
stay implicit. It is advice, not authority to write.

Response assembly is the sole arbiter. A handler or preparation hint wins, then the
deterministic rule hint, then the generated fallback. Instructions suppress hints. Reminders
are priority ordered, tied by stable rule ID, text-deduplicated and capped at two.
Distinct required instructions produce one stop-and-report conflict retaining
provenance. Sink failures remain diagnostics without removing required guidance.

## Bounded delivery and process output

Every `runCli` path ends in artifact delivery. The default combined stdout/stderr
budget is 32,768 **serialized UTF-8 bytes**; budgets below 8,192 fail before
execution. Protocol limits are measured as serialized JSON:

| Mandatory field group | Maximum bytes |
| --- | ---: |
| Instruction | 1,024 |
| Selected reminders combined | 1,024 |
| Compact recovery | 1,024 |
| Doctor/continuation references combined | 1,024 |
| Artifact manifest | 2,048 |

Oversized mandatory input is contract-invalid. Valid bounded required guidance and
known recovery survive artifact failure; optional detail spills or is explicitly
omitted. Fallback never dumps the rejected body. Emergency text can use structured
argv/JSON to retain reference token boundaries within the bound.

A successful automatic spill is normal delivery, not a diagnostic. The artifact
payload carries `spill: { format, inlineBytes, maxBytes }`: the attempted complete
serialized stdout plus stderr in the requested format, and the run budget. Text
prints `notice: response <inlineBytes> bytes exceeds the <maxBytes>-byte budget; full
response in artifact.` followed by the `artifact:` manifest line. Success keeps
`ok`, effect and exit code and gains no `KERNEL_OUTPUT` issue; legitimate issues
stay while they fit, and the complete response artifact holds any that must be
dropped. A failed primary response spills the same way and keeps its classification.
Explicit `--out` and binary receipts carry no spill metadata. The decoder requires
spill metadata exactly on `stdout_budget_exceeded` manifests.

Artifact policy is explicit or resolved from environment/app state before release.
Delivery prepares it only when a response needs an artifact: it canonicalizes the
directory and forbidden roots through symlinks, refuses a directory inside a
forbidden root before creating anything, then creates the missing configured
directory and ancestors through `Host.files.ensureDirectory`. A small inline response
does no artifact filesystem work and succeeds even when the policy is missing,
forbidden or unavailable. Caller-selected nested `--out` parents must already exist.
Policy failures report fixed causes (invalid policy, forbidden root, file in place of
the directory, unresolved path, denied permission, no space, non-directory ancestor,
generic creation failure) with the configured directory when it fits; resolver and
host exception text is never printed. Routes that never reach the post-operation
hook use only a static policy and never call a resolver. Automatic spill, explicit `--out` and finite binary
requests share atomic collision/refusal semantics. Identical content may be reused;
unrelated files are not overwritten. Manifests report absolute path, actual
bytes/SHA256, format/media type, reason and `contains`.
Wire decoding enforces the writer's media-type syntax and format/content
correlation: binary format requires binary contents, and other formats cannot
claim binary contents. Decoding does not grant filesystem authority.

`binaryArtifact` snapshots finite `Uint8Array` bytes and carries separate JSON
summary/media type/basename. It always uses the artifact writer. Automatic response
spill contains JSON; explicit JSON `--out` can contain data only, as the manifest
states. No streaming source or direct byte stdout path exists.

Text success is stdout; coherent text failure is stderr. JSON is one envelope on
stdout. `main` owns SIGINT/SIGTERM cancellation, stream writes, callback/drain
settlement, quiet EPIPE handling and process exit. Other output failures do not
retry the operation or write a replacement envelope. Compile cache is opt-in and
feature-detected. `runCli` accepts an injected host or lazily resolves `nodeHost`.
A structural `Host` implements `files.ensureDirectory(path, signal)`: it creates the
directory and missing ancestors, succeeds for an existing directory, refuses a file
or file ancestor without changing it, and checks cancellation before and after.

## Help, testing and enforcement limits

Help/version/exit-codes and parse refusals import no handler or application
transport and acquire no app. Optional help enrichment requires declaration opt-in,
uses one total deadline (default 500 ms), at most three bounded blocks and a silent
byte-identical static fallback. Dynamic providers must cooperate with cancellation.
`helpNode` and `commandReference` are offline. Optional `CliOptions.description`
is the root help/reference prose; text prints the summary once and omits a description
that is empty or equal to it. `commandReference(cli, { commands })` documents the
selected command or validation leaves, a selected write's generated twin, their
ancestors and the root, with child navigation filtered to documented nodes; related
links may point outside the selection. Roots, groups and unknown paths throw.
Asynchronous `validateReferences` and `writeCommandReference` accept the same
selection, check actual files and canonical containment for included nodes' skills
only, and named-block check mode does not write. The writer reports UTF-8 `sizes`
(generated block, whole document, limit) after successful validation and refuses a
document over `maxBytes` with those counts instead of trimming.

The testkit runs the production runtime, captures output/artifacts/host calls/events,
and supplies seven inherited cases. `runForTest` renders the requested format
without rewriting argv; one valid explicit `--json[=bool]` that contradicts it
throws before host or handler access, while malformed or duplicate format flags stay
testable usage failures. `createTestHost({ directories })` seeds empty virtual
directories. Default fixtures are canonical library controls; consumers supply all
seven callbacks to prove their own services. `expectDisclosureParity` checks
caller-supplied field inventories, not the meaning of prose, with an explicit typed
JSON-only exception inventory (reason, extra fields, deletion condition); exceptions
never relax byte bounds. A failure lists every mismatched command in path order with
its text-only, unlisted JSON-only and stale exception fields.

Types and architecture tests are guardrails, not a callback sandbox. Applications
own schema semantics, storage transactions, preparation purity, transport security,
durable logging and truthful reported IDs. Test-host clocks and
files are deterministic substitutes; actual host/process/pilot tests provide the
real filesystem/transport evidence. Supported runtime evidence is enumerated in
the final report, not a claim for every operating system.

Owner-controlled consumers use private local snapshots built fresh by `prepack`.
Consumer migrations/wire cutover, registry publication, Commander replacement,
plugin synchronization, optional transport/job/gate/identity/digest kits, live
progress, streaming artifacts, raw-output escape hatches, interactive prompts and
ANSI/TTY branches are outside this milestone.
