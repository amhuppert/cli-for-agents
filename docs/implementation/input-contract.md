# Caller, parsed input and selector contract

Governing source: `.cc/graph-workflow-docs/implementation-contract.md`, decisions
2–5. This document freezes the type choices for downstream parser, help and
execution owners. Runtime entry points remain throwing stubs in this context.

`CallerInputs<S>` describes programmatic inputs with branded domain IDs.
`ExampleInputs<S>` describes raw parser examples with string IDs. `ParsedInputs<S>`
(and `Inputs<S>`) describes handlers after local validation and resolution.
Callers may omit args/flags containers when every member is optional, including
empty inventories. Handlers always receive both containers. Variable-held
invocations undergo exact top-level and nested key checking too.

| Declaration | Caller | Parsed handler |
| --- | --- | --- |
| Argument without required | Required scalar | Required scalar |
| Argument with required:false | Optional scalar | Optional scalar |
| Flag without required | Optional scalar | Optional scalar |
| Flag with required:true | Required scalar | Required scalar |
| Scalar with default | Optional scalar | Required resolved scalar |
| Optional repeatable flag | Optional array | Array, empty when absent |
| Required repeatable flag | Nonempty array | Nonempty array |
| Final variadic argument | Nonempty array unless required:false | Nonempty array, or empty array for absent optional variadic |
| passthrough:true | Optional token array | Token array, empty when absent |

Defaults must match the value kind (enum defaults must be members). Required plus
default, repeated/variadic plus default, file plus default, secret plus default,
and derived-file plus default are invalid. Required arguments cannot follow
optional/defaulted arguments. Argument names are unique and a variadic is final.
Repeatable boolean/file inputs and variadic files are invalid. Repetition of a
nonrepeatable flag is a parse refusal, never last-value-wins. Repeated values keep
occurrence order. Numeric finiteness, integer/range checks, pattern compilation,
string bounds, URL validity and actual default validity are registration/parser
obligations beyond TypeScript's primitive checks. URLs are validated absolute URL
strings, not eagerly constructed URL objects. IDs retain their declared domain.

A `value:{kind:"file",maxBytes}` accepts a path or `-` and resolves bounded UTF-8
text before execution. Raw documents use this form without a JSON schema. A string
flag can declare `fileSource:{maxBytes}`; its key derives `--<key>-file`. Caller
flags accept exactly one inline or file spelling (or neither when optional).
Handlers see only the original string key. Repeatable, secret and non-string
flags cannot derive a file alternative. A structured top-level `file` remains a
separate payload declaration; there is no inline JSON payload field.

All selected stdin consumers (raw files, derived alternatives and structured
payloads) are counted before any read; more than one is refused. All reads enforce
declared bytes and cancellation, never silently truncate. Passthrough requires
explicit opt-in and applies only after `--`: preserve tokens including empty
strings, spaces and leading dashes. They are not reparsed as flags. Without opt-in,
`--` ends options and remaining tokens belong to declared positional arguments;
extra tokens are refused.

Suggestions reject every possibly-secret flag, including widened secret flags.
A required secret makes a runnable invocation impossible unless it declares
`credential:{env:"ENV_NAME"}`. That fallback permits omission in a suggestion;
actual dispatch must resolve the environment credential or refuse before provider
acquisition. It does not authorize embedding the value. Fallbacks are limited to
nonrepeatable secret string flags and cannot combine with defaults/file sources.

Disclosure levels derive a simple selector from the level key. `selectors` may
instead name a nonempty literal tuple, e.g. context defaults to `["context"]`,
while full declares `["context","full"]`. Dispatch chooses the unique
most-specific matching set, then rejects unconsumed selector tokens. Equal sets,
ties and incomparable matches are invalid; domain filters are independent.
Callers select the level key with `level`, never a second inventory of booleans.
Only artifact-eligible levels accept `out` in this contract; the separate binary
output revision belongs to runner-response-contracts.

The declaration boundary rejects widened paths, argument/flag/enum/level
inventories, reserved flags, derived-file/domain collisions, selector/domain
collisions and reserved selectors. Family binding adds global collisions. Runtime
registration must repeat these checks for JavaScript/type erasure and enforce
registry-wide boolean/value consistency, cross-command generated/global name
collisions, selector set ambiguity and valid spellings. Help and parser inventories
must derive from these declarations, not copied tables.

Compiler evidence: `type-tests/input-positive.ts` is compiled in a fresh program
without suppressed diagnostics, after the existing isolated Any* controls.
`type-tests/input-negative.ts` pins invalid combinations; the existing literal,
generated-input and adversarial fixtures retain their brand and exact-key checks.
This is type-only work: no runtime behavior was added and runtime TDD is deferred
to the named downstream `tests/registry.test.mjs` family.

## Bound families and context access

`commandsFor<Contexts>()({errors,globalFlags})` returns a family with
`defineCommand(spec,binding)`. Every spec selects one literal `requires` key or
`none`. Context inventories must be closed and cannot declare the reserved none
key. `createCli` accepts that family, its commands and `contexts`, a provider map
keyed by Contexts. The catalog cannot be replaced at CLI construction. The old
standalone `defineCommand<App>()` factory and single application option are removed.

A selected handler receives its selected app type and `ctx`; a none handler has
no app property. The context contains resolved domain args/flags, `globals`, the
registered `command`, the bound `errors` catalog, env, signal, host and clock
(now/sleep). Providers receive resolved globals, env, host and signal; successful
acquisition reports app and release. Host exposes only bounded file, canonical-path,
clock, sleep and hash capabilities, with no process-output or exit handles.
Programmatic invocations and examples include globals in the same flags object;
handlers keep globals separate from command-local flags. Declared credential
fallbacks allow omission in caller/example forms while parsed required credentials
are present. Missing environment values remain a local dispatch refusal.

`FamilyCode<D>` is the domain catalog's finite key set plus `KernelCode`. Read
results, preparation, commit and provider failures retain this set; opaque mutation
modules and command tokens retain it after private data erasure. Foreign unrelated
catalogs fail at lazy binding and CLI registration. Kernel code names are reserved
in defineErrors: KERNEL_USAGE, KERNEL_CONTRACT, KERNEL_INPUT, KERNEL_CANCELLED,
KERNEL_HANDLER, KERNEL_CONTEXT, KERNEL_GUIDANCE, KERNEL_OUTPUT and KERNEL_RELEASE.
Runtime owners assign their precise exit classes at validated constructors.
The Any* boundaries still anchor JsonValue directly, without recursive defaults.

Family/global collision checking covers local flags, derived file alternatives
and level selectors. Same-shaped independent families cannot be nominally
separated by TypeScript generics alone: runtime registration must check actual
family membership and reject erased/foreign command tokens and error codes.

`createCli.doctor` now takes a runnable read invocation, including nested paths;
registration must verify its membership and resolved requirements. The old
handler error recovery shape, optional payload decoder and mutation/direct-runner
split are still scaffold seams owned by runner-response-contracts; this context
only threads code bounds through those shapes. No runtime implementation or claim
of dispatch/lifetime correctness is made here.

Additional compiler evidence: `family-positive.ts` has its own unsuppressed
program; `family-negative.ts` covers none access, wrong/missing context providers,
foreign read/preparation/commit/provider codes, opaque mutation erasure, global
secret and name collisions, widened catalogs and reserved kernel names.

## Migrated consumers and acceptance evidence

The root authoring barrel exports the revised inputs, family and code types.
Runtime consumes a family and keyed providers. Guidance consumes the same command
and invocation tokens without a second declaration. `runForTest` consumes keyed
concrete context values. Internal parsed invocation/execution stubs preserve the
context, global and code parameters. Notebook declarations and lazy handler type
annotations use the bound catalog; there is no obsolete factory alias.

| Acceptance outcome | Compiler controls |
| --- | --- |
| caller-parsed-types | input-positive default flags/arguments, empty invocation and parsed resolved values; input-negative missing resolved default |
| input-feature-types | input-positive URL, raw file path/stdin, derived files, repeats, optional final variadic and passthrough; input-negative required nonempty arrays, exclusive sources, ordering/default/collision/enum refusals |
| family-context-types | family-positive selected app, none, empty context map, typed globals/host/clock and bounded errors; family-negative wrong/missing/swapped providers, no app/output handles and foreign codes |
| credential-suggestions | input-negative required bare secret versus declared environment fallback; family-negative secret globals and exact variable-held inventories |
| selector-types | input-positive key-derived context and explicit combined full tuple; generated-inputs exhaustiveness/output eligibility; negative empty/widened/colliding selectors |
| contract-consumers-migrated | family-positive imports all four entry points and uses keyed test contexts; existing result-defaults, results, literal-arguments, generated-inputs and adversarial checks remain active |

The final compiler pass also includes a reproduced and repaired example-exactness
bug: variable-held examples with extra flags or top-level fields originally left
two expected-error directives unused (registered run
`vrun-4eebbde4-26d2-41f9-8309-29a85934dd86`). Binding now checks those inventories
as strictly as invocation inputs. The repaired run passed
`vrun-af4f96b5-5614-4c44-9d95-778b85f49ab2`.

Final registered evidence and the bounded context output are recorded in
`docs/implementation/input-family-output.json`. All launched checks settled.
The built-entry harness is import/fixture-lifetime evidence only; parser, execution,
selector matching and file reads remain future runtime test obligations.

## Validation repair: uncertain credentials

Suggestion safety is universal across union members, for both local flags and
family globals. A secret property in any possible member blocks serialization,
even when that key is absent from another member. Potential requiredness includes
`required:boolean` and the optional boolean field in a widened `Flag`. Omission
is safe only when every potentially required member guarantees its environment
fallback. An optional or branch-specific credential declaration is not a guarantee.
Nonsecret union alternatives must likewise satisfy every member's input contract.
This policy applies identically to invocation and validationInvocation; ordinary
caller/example authoring remains distinct from constructing secret-free suggestions.

`type-tests/credential-unions.ts` reproduces the widened Flag, secret/public union,
partial-fallback union and boolean-requiredness defects at the public declaration
and invocation boundaries. `input-positive.ts` retains isolated unsuppressed
controls for fallback unions that are safe in every branch, optional visibility
unions and widened flags explicitly proven optional, both locally and globally.

## Validation repair: single context selection

A registered declaration must have exactly one literal `requires` key. Unions
such as remote|none and local|remote are rejected at family.defineCommand, even
when the handler happens not to read app. Narrow a conditional choice before
constructing each declaration. The guard runs before the shared lazy binding, so
it protects default reads, level reads and opaque mutation preparation/commit
modules uniformly. It prevents a union containing none from producing a usable
app:never binding. Ambiguous specs may appear as structural authoring types, but
cannot cross the public registration boundary.

`type-tests/context-unions.ts` reproduces the six accepted ambiguous declarations
from the original boundary, including unrelated read/level/prepare/commit services.
`family-positive.ts` compiles narrowed remote and none declarations in isolation;
the remote runner can use its endpoint and the none runner's input keys contain
only ctx. Existing literal-key, missing-key, foreign-code and provider controls
remain active.
