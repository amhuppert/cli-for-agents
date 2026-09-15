# Production runtime composition

Governing source: `.cc/graph-workflow-docs/implementation-contract.md`, source-of-truth
entry 1, especially decisions 6 and 10–14. All three ordered runtime-composition tasks are implemented;
validation evidence and the acceptance matrix follow.

## Registered production pipeline

`createCli` continues to call `retainCli` → canonical `register`. `runCli` now calls
`internal/runtime.runProduction`: resolve registry tokens, validate the output
budget, project offline responses or execute a leaf once, collect guidance and
resolve canonical artifact policy in execute's post-operation hook, await release,
arbitrate once, assemble, then deliver every response through the bounded owner.
Invalid budgets produce bounded KERNEL_USAGE before handlers. Omitted hosts call
nodeHost; supplied hosts are used directly. No process streams are accessed.

Offline help/version/exit-codes and parse refusals do not load handlers, acquire
application state, or invoke guidance/artifact sources. JSON offline results use
the ordinary response envelope with help/version/inventory in payload.data; text
uses the existing help projection. Oversized offline data is explicitly omitted.
No artifact directory is guessed on a route without execution.

Execution owns offline success/refusal outcome construction as well as leaf
outcomes. Help retains its structured projection alongside text for composition.
The execution hook now checks and retains the actual immutable resolved policy,
while copying candidate/diagnostic DTOs: JSON-cloning policy broke the artifact
owner's WeakSet identity. The public explicit-output regression reproduces that
failure with cloning restored, and passes with identity retention.

## Initial verification

12 public-package tests in tests/runtime.test.mjs cover registration, six offline
routes/refusals with throwing off-path dependencies, single execution and release,
JSON/text success, budget refusal, oversized offline output, explicit output after
release and omitted Node host hashing. Eleven initial tests failed on the runtime
stub. A separate failing artifact reproduction isolates policy identity loss.

Full tests: vrun-e3e58dd6-3e08-4b05-9fb1-c93e2910348e.
Focused tests: vrun-196dea76-8cec-4c32-ab8d-0c0e3ec7855a.
Full typecheck: vrun-6a8086da-7c6d-4909-b97f-a05a6484989b.
Full build: vrun-32232653-56e5-43b2-baf8-3824a44c62b0. All launched checks settled.

Concrete audits: git diff --check; package remains private without runtime
packages or export changes; no direct process output or static Node builtin
imports in changed runtime owners; production calls reuse canonical resolve,
execute, arbitrate, assembleResponse, deliver, budget and value/error owners.
Consumer repositories and git lifecycle actions remain outside scope.

## Integrated failures and references

The public suite now has 34 cases. It additionally covers context-free catalog and
command identity, local schema refusal before any transport, thrown and reported
provider failures, exactly one authoritative conflict event, applied spill failures
in JSON/text, domain precedence through four secondary failures, finite binary
byte identity with automatic/explicit output, payload prepare/twin/commit parity,
combined scope selectors independent of filters, nested doctor plus continuation,
pre-acquisition cancellation and malformed post-commit guidance.

Six behavior assertions initially failed on valid binary requests, unchecked local
rule scopes and three invalid reference ingress paths. Execution now validates
binary provenance through its canonical owner and retains the request itself.
It no longer attempts to recapture the owned bytes getter as raw application data
or reconstruct a second request. Forged requests fail without invoking getters.

Evaluation privately retains local rule declarations on its output; explicit
re-decoding preserves this association. Composition checks the retained inventory
with checkRuleReferences, including references that did not fire. Transport batches
remain authenticated by the application's provider and strictly decoded by the
kernel. Candidate hints, handler hints and error continuations are checked with
current-registry rebindInvocation before assembly. Invalid optional hints are
removed independently, so valid required instructions in the same batch survive.
The existing response owner remains the only arbiter.

An additional undefined-guidance regression failed before repair. Every returned
provider value is decoded, including undefined; malformed guidance becomes
KERNEL_CONTRACT while known applied effects, recovery and handler instructions
survive. Provider execution rejection is KERNEL_GUIDANCE (or cancellation).

Focused tests: vrun-9903fd59-b182-4c3f-afdc-6846111a25ef.
Final checkpoint full test/typecheck/build IDs are in runtime-composition-output.json.
Finalization coverage is recorded below.


## Finalization and final acceptance

49 public-package cases now pass. A deliberately lifetime-sensitive app throws
if any hook accesses it after release. Nine cases check handler, guidance load,
guidance settlement, policy resolution/settlement, awaited release and then
artifact writing. They cover success, handler/domain failure, guidance/policy
failure, an aborted host sleep, cancellation during either hook, and rejected
cleanup. None-context hooks have no app/provider/finalizer; failed acquisitions
skip all hooks. Explicit promise gates prove release and the final response wait
for both hooks. Release-time mutation cannot alter retained DTOs or host policy.

The policy-cancellation test failed with KERNEL_OUTPUT before repair and now
returns KERNEL_CANCELLED. Required guidance, domain classifications and observed
effects remain intact; artifact failures can append further secondary codes.
A final large-registry refusal test found parser explanations exceeding the
canonical diagnostic summary limit. That test failed before usage outcome
construction gained an explicit omission fallback pointing to --help. All usage
responses still reach the existing final delivery owner.

| Acceptance | Concrete evidence |
| --- | --- |
| createcli-production | Existing retainCli/register call preserved; public foreign-family registration rejection; hook options exercised by runCli |
| offline-production | Six throwing off-path routes; JSON help/large usage bounds; budget refusal before loading; help/value data comes from renderOffline |
| leaf-production | Single loader/provider/runner/release event counts; execute receives collect as post-operation; nine lifetime cases and delayed-hook gates; assembly/delivery follow execute settlement |
| failure-production | Public success/usage/provider/domain/cancellation/conflict/applied-spill cases; known recovery and valid instructions survive; scope/filter/nested doctor and continuation assertions |
| default-host | Omitted host hashes through Node capabilities; supplied test hosts capture file IO and fail off-path operations; source audit finds no process output |

Final registered run IDs live in runtime-composition-output.json. All launched
checks settle before task completion. This context wires public runCli; main's
process drain/exit/compile-cache body remains the separately assigned
process-adapter owner. Publishing and consumer migrations remain outside scope.

## Charter checks

- local-scope/dependency-free-kernel: package.json and lockfile unchanged, private
  true, no runtime dependencies or export additions; changed owners have no static
  Node builtin value imports. Files remain in this worktree.
- single-declaration-derivation: runtime calls the existing registry resolve and
  help projection; the shared input model is unchanged. The parser retains format on refusals as documented below. Public tests use declared
  scopes, filters, payloads and generated twins.
- canonical-constructors: outcomes stay in execution's checked owner; errors use
  kernelError/checkedError; units, references, policy and binary requests use their
  established owners. Runtime creates no branded RunResult or sibling value/error
  constructor. Binary construction duplication was removed.
- protocol-preservation: JSON/text applied spill failure, malformed post-commit
  guidance, domain precedence, invalid optional hint with valid instruction, and
  independent policy failure are tested within 8192 combined serialized bytes.
- single-arbiter: one runtime arbitrate call followed by assembleResponse and
  deliver; no response or parser implementation copied into composition.
- local-errors-first: parser/offline/budget routes never load application code;
  mandatory schema refusal occurs before the transport provider or hooks.
- no-output-bypass: rg finds no process.stdout/stderr/exit or console output in
  changed owners; all result branches end in deliver. git diff --check is clean.

## Context validation repair: offline metadata

The validator identified that canonical offline text was incorrectly subjected to
handler-only protocol-prefix and Unicode-separator restrictions. Thirty public
regressions were added; twenty-six failed before repair. They cover all reported
siblings in text and JSON: titles/paragraphs, summaries/descriptions, level names,
flow IDs, catalog ERROR codes, executable names, both Unicode separators, group
metadata and dynamic-help blocks, plus oversized output. Four controls continue
to reject handler-rendered prefixes/separators, even with source:offline in data.

The existing offline execution constructor now privately records origin. The
response owner uses that identity to preserve accepted framework metadata while
keeping terminal-control checks. Application results cannot select this behavior.
Both offline and handler results still use the sole assembly/delivery pipeline;
no renderer or output-budget bypass was introduced. Governing source-of-truth
entry 1 decisions 7, 11 and 13 distinguish handler restrictions from offline help.

79 focused cases passed: vrun-fb84ce8e-baef-48aa-9a31-80bb8728f94c.
Full tests passed: vrun-67b70a41-5cca-44a6-a978-7eae34b6d437.
Full typecheck passed: vrun-541e9749-50ec-4fa0-a8fd-068735272231.
Build and final usage-repair evidence are recorded in the structured output.
The separately reopened usage-format task was the next checkpoint; its repair follows.


## Context validation repair: canonical refusal format

Thirty further public cases cover boolean spellings, flag order around unknown
commands/options, false/invalid/duplicate values, conflicting offline routes,
scalar errors, option-value consumption, option delimiters and passthrough tails.
Format assertions failed before repair; all 109 runtime tests now pass.

The canonical parser scans options once and retains its decoded JSON boolean
before reporting a refusal. Scan errors are retained while remaining options are
inspected, so an unknown flag before --json=true does not change representation.
The first scan error remains the refusal. Delimiter and value consumption use the
same scanner as accepted routes; a missing value does not consume the following
option. Duplicate JSON flags remain invalid and retain the first occurrence's
interpretation; an invalid first boolean does not select JSON. No second format
parser exists in composition.

Registry invalid resolutions carry that retained json value. runCli selects
format solely from the resolution for every branch; argv.includes('--json') was
removed. Governing source-of-truth entry 1 decisions 3–5, 10 and 13 require this
single input derivation and coherent usage response routing.

Focused tests: vrun-e75b758c-d871-448b-a7ef-61ece29d8e02.
Full tests: vrun-fa979f18-995a-4080-b81f-f9c59a48b323.
Full typecheck: vrun-95a80243-4a26-419b-9649-ef061d0affa9.
Final build is recorded in runtime-composition-output.json after settlement.

Final acceptance recheck: registration still calls the canonical register owner;
all accepted offline metadata reaches bounded delivery; all usage format decisions
come from canonical parsing; execute/collect/release/assembly/delivery ordering
and the existing binary/domain/cancellation/recovery tests remain green. No app
code is initialized on refusals, no output bypass or second arbiter was added,
and package privacy/dependencies/exports remain unchanged. Both reported context
validation issues are repaired, including their sibling instances.
