# Executable registry, parser and invocation references

Governing source: `.cc/graph-workflow-docs/implementation-contract.md`, source-of-truth
entry 1, decisions 2–5, 8, 12 and 13. This execution context explicitly assigns
public createCli to registry-parser, superseding the older API-inventory owner row
for that constructor. Runtime-composition still owns public runCli and consuming
private resolve. Help rendering, source loading and lazy runner execution retain
their existing downstream owners.

## Declarations and registration

`commandsFor` binds the canonical catalog and immutable globals once. Its
`defineCommand` checks and snapshots metadata, input declarations and examples,
retaining the lazy handler privately. Group and flow constructors create checked
identity tokens. Membership uses actual command/family identity, not shape equality.
No declaration constructor calls a handler, provider, policy or guidance loader.

`createCli` calls private `register` synchronously. Registration rejects duplicate
paths, missing parents, dangling related/flow references, foreign/forged commands,
missing providers, and generated/global/domain name collisions within a leaf's
complete input model. Unrelated leaves may reuse names with different kinds or
owners. Payload-write twins share their source command and input model;
read payloads have no twin. Skill references require a documentation root and safe
relative syntax. Async reference tooling owns file existence and canonical-root
containment, as required by decision 13.

Every CLI requires a runnable read doctor, including catalogs without domain
connection codes because KERNEL_CONTEXT is connection-class. Its command must
belong to this CLI, its caller inputs must be valid, and its serialized reference
must fit the canonical reference budget. Secret omission is permitted only under
an explicitly declared credential fallback. No live environment or lazy module is
needed to validate these declaration-level obligations.

`internal/input-model.ts` derives the accepted names, help flag descriptors, file
alternatives and selector sets. It validates finite enum inventories, value bounds,
defaults, argument ordering and incompatible input combinations. Units and IDs use
canonical values constructors; this owner creates no catalog errors or bounded
protocol facts through sibling constructors.

## Parsing and execution handoff

`resolve(registry,argv)` returns an offline help/version/exit-codes route, structured
invalid issues, or a checked ParsedInvocation. Bare groups and unknown paths are
usage refusals; explicit help does not require execution inputs. Offline results
include path and JSON selection. Parsing has no host/app/file-read capabilities.
Runtime-composition owns converting ContractViolation data into canonical responses.

Scalar flags accept equals or separate values, strict integers including negatives,
explicit boolean equals values, and declaration-derived value checks. Duplicate
scalar flags, unknown flags and extra inputs are refused. Globals and framework
help/JSON/version flags work around route tokens. Command-specific flags, including
generated file, payload, selector and output flags, follow the complete leaf path;
an earlier occurrence fails with placement guidance without guessing token roles.
Globals remain separate from local flags. Repeated flags retain occurrence order;
absent optional repetitions/variadics become empty arrays. Required variadics need
at least one item. `--` ends options; declared passthrough receives all remaining
tokens verbatim, while other commands assign them to declared positionals.

Selectors choose the unique most-specific matching set and consume exactly the
selected tokens. Negated selectors, ties and extra selectors are refused. Domain
filters remain independent. `out` requires an artifact-eligible level or binary
output. Selected file/stdin descriptors are collected before execution; selecting
more than one `-` source is refused before any read.

Private `ParsedInvocation` exposes command, path, validation-twin boolean, JSON
selection and immutable `input`. Execution must call `checkParsedInvocation` before
trusting its identity. Input contains:

- `args`, `flags`, `globals`: resolved scalar/default/collection values. Raw file
  inputs retain their paths; a selected derived alternative leaves its target flag
  absent until execution replaces it with decoded text.
- `sources`: records with kind (`argument`, `flag`, `global`, `payload`), name,
  path and maxBytes. Execution reads each bounded source before context acquisition.
- `credentials`: missing declared fallbacks with name, env key, global boolean and
  required boolean. Execution resolves and validates environment values before
  acquisition, refusing a missing required credential.
- Optional file, level, out and passthrough selection.

## Invocation safety and delivery handoff

`invocation` and `validationInvocation` use the same caller input model and reject
unknown/mismatched fields, secrets, invalid file/level choices and control characters.
They snapshot all retained values. Construction can precede registration (necessary
for createCli.doctor); public `renderInvocation` requires a genuinely constructed
reference whose target has passed registration. Rendering emits individually quoted
POSIX shell tokens, including safe executable handling for keywords and assignments.
Flags use equals forms. A positional delimiter protects leading-dash arguments.

With passthrough enabled, that delimiter belongs exclusively to passthrough. A
leading-dash positional that the parser would interpret as an option therefore
cannot produce a runnable suggestion and is refused. Negative integers and `-`
remain representable. Passthrough token boundaries are preserved exactly.

Rendering alone has no current-CLI parameter. Production consumers must first call
`validateInvocation(registry, reference)` to reject references to another CLI,
even when the other target was registered elsewhere. `invocationArgv` supplies the
same canonical token array used by shell rendering.

The canonical hint/error/recovery constructors snapshot JSON. Their copied nested
references intentionally lack the original private invocation identity. Delivery,
help or runtime consumers of detached/transported reference data must call
`rebindInvocation(registry, data)`: it validates shape, effect, current target,
flag names/types/cardinality, secrets and complete parser acceptance, then constructs
a checked reference. It never trusts a claimed brand. Passing a live foreign
reference to this seam still fails membership. Directly rendering a forged/plain
object remains forbidden. Kernel constructors were not modified or made dependent
on registry internals.

## Remaining private accessors

All seams are source-relative internal imports, not new package exports:

- `commandData(command)` in declarations returns family, immutable model/examples
  and the original lazy handler function. Execution owns evaluating the function.
- `cliRegistry(cli)` and `registryState(registry)` expose name/version and the
  immutable root/group/command/validation graph. Help derives children from paths.
- `cliConfiguration(cli)` returns retained configuration with copied collections,
  contexts and policy metadata and original family/doctor/callback identities.
  Public Cli retains only Contexts, so this accessor erases catalog/global generics
  after checking identity. Runtime uses the retained model to supply checked inputs.
- `checkMembership` checks a command identity against one registry.
- `checkRuleReferences` checks rule IDs, duplicate IDs, nonempty appliesTo and command
  membership. Guidance calls it after lazy rule loading and owns rule/sink validation.
  The canonical CliOptions contains no eager static rule inventory; decision 13
  forbids loading guidance during createCli just to inspect its references.

## Acceptance evidence

`tests/registry.test.mjs` has 100 tests. The registry, scalar parser, compound parser,
renderer, reference validation, executable quoting and explicit-null regressions
were observed failing before implementation or repair. Shell tests execute printf
through `/bin/sh` and compare NUL-separated token boundaries before reparsing.
The ten pairwise stdin cases cover positional/raw/derived/payload/global sources.

| Context criterion | Concrete evidence |
| --- | --- |
| registry-rejection | Duplicate/parent/related/flow/family/forgery/kind/generated-name/doctor rejection fixtures |
| parser-inputs | Scalar, repeated, default, required, variadic, file, selector, passthrough and ten stdin-pair cases |
| offline-resolution | Throwing lazy loaders/providers/policies remain uncalled during createCli and offline/usage resolution |
| invocation-safety | Real shell round trips, control/secret refusals, current-registry membership, detached data validation |
| registry-wiring-owner | Public createCli calls register; parsed provenance and documented seams serve execution/composition |

Settled registered validation IDs and bounded artifacts/checks/summary are in
`docs/implementation/registry-parser-output.json`. The package stays private and
has no runtime dependencies or new export paths. Source checks confirm no eager
builtins, process output, diagnostic suppressions or sibling unit/ID/catalog/bounded
fact constructors. All edits remain in this worktree; no git lifecycle action or
consumer-repository change was performed.

## Context-review repairs

The context review reproduced three gaps. Doctor registration now parses its
final canonical argv against the completed registry and verifies the resulting
command, route and validation-twin identity before registration succeeds.

The shared invocation builder reads only own positional properties. Once an
optional positional is omitted, it leaves later defaults out of argv so parsing
can assign them to their original names. Explicit later scalar or variadic values
are refused when they would shift into the omitted slot, including when both slots
have the same value kind. These checks apply to reads, writes and validation twins.
An omitted argument named constructor never contributes an inherited value.

Detached-reference validation checks the positional/passthrough boundary before
parsing: positional tokens cannot become flags, offline options or the delimiter.
Rebinding reconstructs only positional slots represented by the original tokens;
parsed defaults are not treated as supplied arguments. It then parses the rebuilt
reference and verifies identical resolved inputs against the same registry.

Route traversal validates each root/group argv token with the canonical
single-segment declaration-name checker. Collapsed multiword paths are refused,
including help/version variants. Multiword values after a valid leaf remain valid.

All review reproductions were run through the registered exact-file test command
before their respective repairs. The 100-test suite covers all reported variants,
read/write/twin round trips and same-kind positional shifts. Current focused and
full validation IDs are recorded in the bounded output artifact.
