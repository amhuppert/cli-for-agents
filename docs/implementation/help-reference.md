# Help and reference owners

Governing source: source-of-truth entry 1,
`.cc/graph-workflow-docs/implementation-contract.md`, decisions 7 and 13.

Public `helpNode` and `commandReference` now project the registered graph through
`src/internal/help.ts`. Text and JSON carry derived flags, source kinds, arguments,
examples, effects, levels/selectors, payload limits, sections, skill references,
related edges, generated validation twins and flow steps. Hubs list direct children; only root text expands shared flags. Group/leaf text
uses one global-help pointer, while JSON retains complete input metadata. Unknown help paths throw a usage TypeError with a parent
help recovery; the parser's invalid route remains an invalid resolution.

HelpNode now explicitly types effects, levels, payloads, binary output and flows.
Examples that pass the existing invocation checker keep authentic invocation tokens.
Declaration examples that cannot be runnable references are labelled input templates,
with secret flags redacted. They never become forged runnable suggestions. This
resolves the tension between declaration examples accepting sample credentials and
decision 4 forbidding secret-bearing runnable references.

The private `renderHelp(cli,path)` is the text owner for runtime-composition;
`projectHelp`/public `helpNode` is the JSON owner. `renderExitCodes` and
`exitCodeInventory` derive kernel and family catalog entries without loading lazy
rules. `commandReference` uses these same projections. There is no eager rule
inventory in CliOptions; reference generation must never load application guidance
to discover rules. Runtime-composition owns routing help/version/exit-codes through
these owners before handler loading, as already assigned by decision 13 and the
verification matrix. The version value is retained registryState.version.

Public `validateReferences` uses `src/internal/references.ts`. It checks actual
regular files through an injected/lazy host after synchronous registry construction,
including canonical containment in the declared documentation root and contextual
invalid-reference issues for unresolvable paths. Generated
validation twins do not duplicate their source's file checks. No host is acquired
when no references exist. The marker write/check tool invokes this same seam before reading or changing its
target block.

Validation evidence and bounded context output: `help-reference-output.json`.

## Optional live context

`renderOffline(cli, resolution, request)` is the private runtime-composition entry
for resolve's offline branch. It handles help/version/exit-codes without loading a
handler, guidance module, app or default Node host. Explicit live commands stay in
the leaf/execution branch and retain its ordinary failure behavior.

Only help for a command/group with dynamicHelp:true can invoke helpContext.load.
One deadline includes loader and provider resolution (500ms by default). An injected
host supplies clock/sleep; otherwise platform timers and the monotonic clock suffice.
At most three providers and three total blocks are accepted, with lower maxBlocks
honored. Strict text-only blocks must fit maxBytes in both added text and serialized
JSON representations, including labels/escaping. No partial enrichment is retained.
Success adds Context text or JSON context blocks to the unchanged static projection.
Provider, authentication, schema, byte-limit, timeout and cancellation failures return
the original static bytes and empty stderr. Parent listeners/timers are cleaned up;
late loader resolution cannot start providers after cancellation. Elapsed-time checks
also reject results when synchronous provider work delays timer callbacks.

## Executable reference tool

After the registered build, `node scripts/generate-reference.mjs` regenerates
`docs/reference-fixture/reference.md`; `--check` reports drift without writing.
The exact-file help tests and full registered suite run that default check and
exercise both modes in real child processes. The script accepts `--fixture` (an
ESM module exporting a CLI as default), `--file`, `--marker` and `--max-bytes`.
It invokes public commandReference directly for the reported projection and public
writeCommandReference for validated marker replacement. No subprocess compiles code.

Exit 0 means success/current content, 1 means reference-validation failure or check
drift, and 2 means malformed options/markers or file-operation refusal. Default read
and generated-document caps are 1 MiB. Only a unique, properly paired whole-line
marker block is replaced. Missing, duplicate, reversed, unclosed or nested markers
are rejected; unrelated bytes and CRLF are preserved. A changed declaration or
fixture rule-documentation item produces drift; regeneration clears it.

The fixture's single rule-documentation inventory produces typed leaf sections.
Those same sections appear in help and reference output; no lazy runtime guidance
rules are acquired to generate documentation. This uses the existing section seam,
not a second eager rule registry. Command and error inventories come from the real
family/CLI. `src/internal/exit-codes.ts` supplies one numeric exit taxonomy and
exitCodeForClass helper for reference output and downstream response composition.

ReferenceHost now permits an optional files.replace(path,data,expected,signal)
capability, because Host.writeAtomic deliberately refuses overwriting different
bytes. Hosts without replacement can validate/check (or confirm an unchanged
write). The default reference-only Node adapter is acquired lazily and stages a
synced file beside the target, checks expected content before replacement, preserves
permission bits, rejects symlink targets and cleans staging on success/failure.
This is ordinary atomic file replacement with stale-content checks, not a filesystem
compare-and-swap guarantee against concurrent editors. No artifact-writer collision
semantics changed. Synchronous createCli remains filesystem-free.

## Integration and acceptance

Runtime-composition must call renderOffline for resolve's offline branch before
loading a handler or resolving a default Node host. Its return is an unbranded text
projection; composition retains final RunResult/output-budget ownership. Explicit
live-state commands remain in the normal execution branch. The reference script
already directly consumes the public owners; it does not depend on runCli.

| Criterion | Evidence |
| --- | --- |
| structured-help | Text/JSON projection tests cover usage, examples, effects, argument/flag value kinds and bounds, required file/environment alternatives, levels, payloads, sections and generated related/flow/twin edges. |
| reference-paths-validated | Real script write/check refuse missing roots/files, directories, outside-root symlinks and symlink loops; in-root symlinks pass. Injected/lazy host paths are exercised. |
| enrichment-contract | Opt-in tests, one fake-clock total deadline, native slow loader/provider tests, strict schemas and aggregate UTF-8 caps, cancellation cleanup and exact static text/JSON fallback. |
| reference-command | Actual executable write/check, changed declaration/rule-documentation drift, regeneration, stale/nested markers, CRLF, bounded reads, permission preservation and unchanged default fixture check. |
| help-wiring-owner | Public helpNode/commandReference/reference APIs invoke implemented owners; private renderOffline serves the explicitly assigned downstream runtime-composition branch. |

Source-of-truth entry 4, progressive-disclosure-tooling, governs terse text hubs,
global-help pointers and child-list recovery. Entry 1 decisions 7/13 govern full
structured metadata and offline/lazy ownership. A failing reproduction revealed a
shared-global-file alternative omitted from hub help/parser acceptance; both now
consume the existing FlagEntry.global metadata, with no manual name list. Unknown
parser paths include the registered parent's help command and derived children.

Final verification after retry: all 57 focused tests and full tests/typecheck/build passed;
all launched checks settled. `exitCodeInventory(cli)` returns `{exits, errors}`:
the finite numeric taxonomy plus kernel/family catalog entries carrying exitCode.
The bounded output artifact records the exact registered validation IDs. Concrete
source/package checks verify private/unpublished status, unchanged package exports,
zero runtime dependencies, no eager builtin acquisition or process output in kernel
owners, shared parser/help input entries, and actual reference-tool wiring.

## Validation retry: input help

Positional enum choices now render from value.values for scalar, optional and
variadic inputs, including validation twins. Flag enums share the same formatter.
HelpFlag.value includes the framework-only output-path descriptor: the shared input
model supplies this to help, parser and invocation checking. It represents an
artifact destination without stdin semantics or fictitious input byte limits.
The actual tool regenerated the shipped reference. Five failing behavior
regressions preceded the repair; 51 focused tests and full tests/typecheck/build
pass. See the output JSON for registered run IDs. The documentation-root repair
is described below.

## Validation retry: native documentation paths

Reference checking now lazily acquires native path operations inside its async
owner. Child paths are joined using those operations; containment compares canonical
paths with the native separator boundary. It never rewrites backslashes or strips
filename bytes. This preserves POSIX directories ending in a literal backslash and
rejects symlinks to sibling directories such as docs\outside.

Six real write/check regression cases first failed, then passed: outside sibling
targets, valid backslash-ending roots, and refusal to substitute a neighboring root
when the intended document is missing. These POSIX cases run on this host and skip
on Windows, where backslash is a separator. All 57 focused tests and final full
tests/typecheck/build pass, including existing enrichment fallback, symlink, marker
and default-reference drift coverage. All launched checks settled. Synchronous
createCli and declaration imports still acquire no filesystem or builtin modules.
