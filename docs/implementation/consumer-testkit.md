# Consumer contract testkit

## Public execution and evidence

`runForTest(cli, argvOrInvocation, { host, format, contexts?, env? })` calls public
`runCli`. The host accepts the public `Host` interface, including both real
`nodeHost()` and in-memory `createTestHost()` capabilities. Omit contexts to retain
real providers; supply the complete bound map to substitute concrete services for
one invocation. Services may use real stores or
transport. Overrides do not replace the original CLI's providers. Invocation tokens
retain membership checks and canonical argv derivation. Format selection respects
already-selected JSON; contradictory/duplicate flags still use canonical parsing.
No handler is rerun to capture a second format.

Results include bounded streams/exit code, a discriminated JSON envelope for JSON
runs, delivery manifests for either format, host calls, and typed handler/context,
arbitration and guidance events. Private request-local observation records existing
runtime facts. Host wrappers isolate concurrent calls, including shared hosts.
Artifact bytes remain available through the injected host. Guidance firing events
are the validated batch's firing records; conflict events are recorded when the
real conflict sink is invoked. Lifecycle events indicate attempted calls, including
calls that throw. They do not claim external durable logging succeeded.

`expectBounded` checks UTF-8 bytes across both streams, including the exact bound.
`expectLazy(command, cli?)` exercises command help, version, exit-codes and a parse
refusal without handler loads or context acquisition. The refusal spelling cannot
be declared under the input name grammar. Commands must already be registered;
omitting cli uses their most recent registration. Pass cli explicitly for commands
shared by several registries. Distribution guards separately own import graph
checks; this helper observes runtime lazy loads.

## Inherited cases

The testing export supplies `ContractFixtures`, `ContractEvidence`, `ContractCaseName`,
`JsonTestRun`, `createContractFixtures` and `contractTests`. Cases are independent
async functions and import no assertion/test-runner dependency:

```ts
for (const check of contractTests(cli, consumerFixtures)) {
  test(check.name, check.run); // use the consumer's own runner
}
```

`createContractFixtures(cli)` creates fresh public-runtime/host fixtures. Its offline
scenario targets the supplied consumer registry. Its other six scenarios are
canonical in-memory runtime controls. Constructing the inventory executes no
handler. To claim coverage of a consumer's domain/transport paths, provide all
seven typed callbacks; each owns its setup, fresh services/hosts, execution and
cleanup. Fixture setup failures propagate unchanged, so they cannot masquerade as
named contract assertion failures.

| Stable case name | Required scenario and assertions |
| --- | --- |
| `offline-paths` | Help throughout the registry, version, catalog and usage refusal; no handler load/context acquisition; bounded output. |
| `schema-issue-survival` | Invalid Standard Schema payload; exact issue message/path in JSON and message in text; exit 2 before context acquisition. |
| `single-guidance-arbitration` | Different handler/authoritative instructions; exactly one arbitration and one conflict retaining both instructions, firing evidence, stop instruction and exit 1. |
| `unknown-totals` | Inline truncated page; unknown total without invented count, exact returned count and read continuation. |
| `shell-safe-references` | Delivered hint and rendered invocation; independent shell-subset decoding preserves original tokens and rejects expansion/operators, unquoted reserved words and assignment-like executables. |
| `unicode-spill` | Inline JSON at the exact byte bound and one astral character over it; code-unit length fits while UTF-8 exceeds the bound; manifest and full artifact bytes match the original response. |
| `operation-recovery` | Applied/unknown operation followed by artifact write failure; known effect/recovery and required instruction survive JSON/text delivery with output failure. |

`tests/fixtures/testkit-invalid.mjs` deliberately corrupts one invariant in each
public-runtime evidence object. The tests require each rejection's named reason,
not just any thrown error. The positive controls execute every scenario first.
No suppressed diagnostics or fabricated brands are used by TypeScript fixtures.

Distribution-guards, local-pilot and remote-pilot own invoking this interface from
their later executable fixtures. This context implements and tests that callable
surface; it does not claim those later executable runs have happened.

## Disclosure exceptions

`DisclosureException` is a JSON record with required `command`, nonempty
`extraFields`, `rationale`, and `deleteWhen`. The current inventory is the empty
array in `disclosure-exceptions.json`; no production exception is granted here.
A consumer can store records with this shape:

```json
{
  "command": "inspect",
  "extraFields": ["receipt"],
  "rationale": "Temporary compatibility disclosure for the existing reader.",
  "deleteWhen": "The reader retrieves receipts from artifacts."
}
```

Call `expectDisclosureParity(cli, inventory, observations, options?)` with the
actual JSON/text runs and their disclosed field inventories. Consumer assertions
must derive those field inventories from their projections; generic text has no
universal field parser. Each observation contains command, textFields, jsonFields,
text and json. JSON-only extras must exactly equal the inventory entry. Unknown
commands, duplicates, missing rationale/deletion condition, empty fields, unused
entries, fields that no longer differ, and uncovered differences fail. Pass the
conditions verified as satisfied in `options.satisfiedDeletionConditions`; matching
entries must then be deleted. The checker does not interpret arbitrary prose.

Every observation checks both streams against the CLI's configured budget. The
inventory accepts no bound override or disable switch. Compiler fixtures separately
reject missing metadata, empty extra-field tuples, missing scenarios and text
capture masquerading as a JSON envelope.

## Verification and charter

41 focused tests cover helpers, seven positive/negative cases, disclosure inventory,
concurrency, format selection, shell lexical edge cases and refusal-name collision.
The initial helper tests failed on five stub assertions. The contract/exception
checks failed on their missing behaviors before implementation. Shared-host call
leakage, duplicate injected JSON flags, unquoted reserved/assignment executables and
refusal flag collision each had a failing reproduction before repair. The missing
local TypeScript dependency was installed with locked `npm ci --ignore-scripts`;
that setup failure was not counted as a behavior test.

Exact settled validation IDs and artifact paths are in consumer-testkit-output.json.
Source-of-truth entry 1, implementation-contract decisions 9–15, governs canonical
arbitration/protocol/delivery, offline behavior, injected hosts and runner-neutral
cases. Static audits verify package privacy, no runtime dependencies, four exports,
no eager builtins/package imports or process output in changed owners, no testkit
stubs, canonical invocation/parse derivation and public runCli execution. The full
runtime suite retains domain classification, required guidance and operation
recovery through delivery failure. No consumer repositories, publishing or git
lifecycle operations are part of this change.

## Context-validation repair: partially quoted assignments

The shell-reference assertion now snapshots quoting at the first equals sign.
Quotes in the value cannot clear an unquoted assignment prefix. The reported
`TOOL='contract'`, `TOOL=contract''` and `TOOL='con'tract` forms, plus two sibling
forms, failed with missing expected rejection before this repair. All five now
fail at the shell-reference assertion. Five positive controls retain acceptance
when the whole executable, its name, or the equals sign is quoted. The new
fixtures update both the delivered hint and JSON stream, preserving coherent
public contract evidence. The public renderer and runtime are unchanged by this
repair. Source-of-truth entry 1 decisions 11 and 15 governs shell-safe references
and inherited contract checks.
