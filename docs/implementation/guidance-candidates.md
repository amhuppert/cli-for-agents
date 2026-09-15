# Guidance candidates

Governing source: `.cc/graph-workflow-docs/implementation-contract.md`, source-of-truth
entry 1, decisions 9 and 11. Evaluation owns candidates and firing observability;
response assembly alone owns conflicts, selection, deduplication and aggregate
selected reminder limits. Evidence is optional, superseding the historical required
evidence proposal in the charter's feedback-tier source.

## Rule admission

Public hint/instruction reuse the kernel-values constructors and their canonical
serialized UTF-8 limits. `defineReminderRule` and `defineSteering` call the private
`internal/guidance-rules` owner. Definitions are captured from own data descriptors;
accessors, extra fields, sparse/decorated reference lists and forged command tokens
are refused. Reference arrays and metadata are immutable; callbacks and genuine
command identities are retained. No state callback or handler loads at admission.

IDs use the existing nonempty/no-whitespace identifier syntax with the 512-byte
serialized summary limit. Optional evidence is nonempty bounded text under that
same limit. Priorities accept finite numbers (including negative/fractional values).
Rule references must be nonempty, unique, genuine commands from one family.
Callbacks must be synchronous functions; evaluation additionally checks actual
return values because ordinary functions can still return promises or invalid data.

The registry's existing `checkRuleReferences(registry,rules)` owns current-CLI
membership and duplicate registration checks after lazy loading. Construction may
precede registration. Runtime composition must validate loaded rule inventories
against the current registry; evaluating a single command cannot prove membership
of other references in that CLI.

## Evaluation and authoritative ingress

`evaluateGuidance({command,authority,state,rules?,eventSink?})` admits the entire
source before invoking callbacks: it rejects unknown fields (including handler),
forged rules, duplicate IDs and command scopes from another family. Every nonempty
inventory requires a function sink, even if all its rules are inactive. Omitted
rules or an empty list can produce an empty batch without a sink.

Only rules scoped to the actual command identity evaluate their predicates.
Predicates must return a boolean synchronously; only true predicates render.
Callback exceptions and asynchronous/invalid returns reject the evaluation as
contract-invalid input. Native rejected promises are observed without awaiting
invalid asynchronous rule work. Errors do not echo application exception messages.
State purity remains an application obligation, not something branding can prove.

Every valid candidate retains its tier/value, authority, command path, stable rule
ID, reminder priority and optional evidence. Candidate order is declaration order;
there is no sorting, deduplication, cap, instruction suppression or conflict choice.
Two different instruction texts with the same owner survive, as do competing hints
and more than two reminders. Each rendered value is detached immediately, and all
state callbacks finish before awaiting any sink. This prevents sink side effects
from changing later predicates during the same evaluation.

After candidate validation, each immutable firing event is sent once to the source's
sink and awaited. A synchronous throw or asynchronous rejection adds a
`KERNEL_GUIDANCE` issue with a bounded message and `path:["rules",ruleId]`, continues
to subsequent events, and preserves every candidate and firing. The batch authority
and command path provide source context for these diagnostics. No conflict event is
emitted here; conflict observability belongs to the final arbiter.

`decodeEvaluatedGuidance(unknown)` captures and freezes finite JSON before validation.
It checks exact root/candidate/provenance/value/event/issue fields, supported tiers,
valid command-path syntax, IDs and authority, candidate provenance matching the
batch, reminder IDs matching provenance, finite priorities, and one matching firing
per unique candidate rule ID. Event order is preserved, without requiring it to
match candidate order. Extra/missing/duplicate firings and duplicate candidate rule
IDs within one batch are invalid. Independent batches remain independent inputs for
assembly to reconcile. Decoding emits no events and cannot establish authenticity;
the application's transport owns that obligation.

Instruction ingress calls the canonical constructor (whole `{ownerId,text}` at most
1024 serialized bytes). Hint ingress calls its canonical constructor (512-byte action
and 1024-byte wrapped invocation reference). A reminder must fit by itself as
`[{ruleId,text}]` within 1024 bytes; response assembly must check the entire selected
reminder aggregate. Candidate batches themselves are not final output and may exceed
that budget. Mandatory values are rejected, never truncated. Issue codes/messages
use the canonical 512-byte summary bounds and issue paths use strings/nonnegative
safe integers; downstream response/delivery owns total diagnostic budgeting.

The decoder checks hint invocation shape only. Detached local hint references and
transported references both require the registry's `rebindInvocation` before use in
the current CLI, which owns membership, runnable inputs and secret validation. A
transported invocation's structure is not proof of command identity.

## Producer/consumer wiring

The public guidance exports now reach implemented constructors/evaluation/decoding;
no guidance public function is a scaffold stub. The downstream ownership follows
implementation-contract decision 9 and its verification matrix, plus the seeded
`runner-response-contract` and `api-inventory`:

- The lazy post-operation provider runs at the state authority, while acquired app
  state is still alive. Runtime composition supplies it through execution's
  `PostOperationHook`, retaining detached batches/issues before finalization. Remote
  providers decode authenticated transport data; local providers evaluate rules.
- Runtime composition supplies operation handler guidance and local/authoritative
  batch arrays to `internal/response.arbitrate` once. `ArbitrationInput` already
  requires both these inputs and a conflict sink; evaluation has no handler input.
- Response assembly owns priority/stable-ID ordering, reminder deduplication/cap,
  instruction suppression and stop/report conflicts with full provenance. It
  carries batch sink issues into diagnostics and preserves known operation effects
  and recovery if guidance collection or decoding fails after a commit.
- `assembleResponse` consumes the branded arbitration result. Artifact delivery
  consumes that assembly without re-arbitration and owns final envelope/text bounds.

Those downstream production callers remain their separately assigned graph contexts;
this context neither implements a parallel arbiter nor changes execution lifetime.
The passing full typecheck includes the existing positive/negative response controls
for candidate-only evaluation and mandatory conflict sinks.

## Acceptance evidence

`tests/guidance.test.mjs` contains 42 tests using public package exports, with only
registry reference checks imported through the established private seam.

| Criterion | Evidence |
| --- | --- |
| candidate-evaluation | Exact state boundary and identity scopes; all competing instructions/hints and three reminders retained; stable provenance and priorities; runtime handler-input refusal |
| rule-observability | Matching firing events at the source, inactive rules emit nothing, awaited sinks, sync/async failures preserve candidates and attributable diagnostics, later sinks still run |
| trusted-decode | Malformed provenance/events/tiers/diagnostics rejected; exact ASCII/Unicode/escaping thresholds plus one-byte overflow; hostile getter/proxy/serialization fixtures; detached immutable round trips |
| guidance-wiring-owner | Public exports call these implementations; no arbitration here; canonical private response and post-operation provider signatures retain the named downstream ownership above |

Constructor and evaluation/decoder stubs failed focused tests before implementation.
A first infrastructure-only failure (missing TypeScript) was resolved with the
existing lockfile dependencies before measuring the constructor red phase.
Registered focused/full tests, typecheck/build and invariant checks are recorded in
`guidance-candidates-output.json`. No runtime dependency, export change, consumer
repository edit or git lifecycle operation was introduced. Concrete source scans
verify no eager heavy builtins, process output, suppression, sorting/capping or
arbitration in the changed guidance implementation.
