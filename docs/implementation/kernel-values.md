# Checked values and domain results

Governing source: `.cc/graph-workflow-docs/implementation-contract.md`, source-of-truth
entry 1, especially decisions 8 and 11 and the checked-boundary validation rules.
Ownership follows `docs/implementation/api-inventory.md` and the upstream
`docs/implementation/runner-response-contract.md`.

## Implemented public owners

- `src/values.ts`: bytes/count/milliseconds accept nonnegative safe integers,
  normalize negative zero, reject coercion, and establish their distinct brands.
  IDs validate both domain and value: nonempty Unicode text without whitespace,
  controls or lone surrogates. They preserve the original string. Domain brands
  are compile-time distinctions; application-specific ID syntax remains the
  application/parser's responsibility.
- `src/results.ts`: defineErrors validates and snapshots finite definitions,
  rejects every reserved KernelCode collision, and constructs immutable errors
  with the declared class and default description as why. Contextual why overrides
  the default. Unknown codes and extra/misplaced options are rejected. Error code,
  description, message, why and issue code/message each fit the 512-byte serialized
  diagnostic-summary limit. Issue paths contain strings or nonnegative safe
  integers. Optional details remain finite JSON with no output-budget cap at this
  boundary; final output sizing and spill remain delivery responsibilities.
- `recoveryFacts` checks a nonempty array of exact kind/id records, retains only
  those supplied facts, and bounds the complete `{kind:"reported",references}`
  object to 1024 serialized UTF-8 bytes. It snapshots and freezes every reference.
  The library cannot establish whether an application actually persisted an ID.
- `src/guidance/index.ts`: instruction checks owner/text and bounds the complete
  structured instruction to 1024 bytes. Hint checks an action within the 512-byte
  summary limit and its wrapped invocation within the 1024-byte reference limit.
  These checks establish only Hint/Instruction brands, not registry membership.
- `kernelErrors` and `protocolLimits` are immutable canonical tables. Root value
  exports already re-export their implemented owners; the guidance surface calls
  its implemented constructors. No public export or dependency was added.

## Private boundaries for downstream owners

`src/internal/validation.ts` is available by source-relative import to registry,
execution, guidance and response owners; it is not a consumer package subpath.

- `assertJsonValue(unknown)`: finite JSON primitives, dense undecorated arrays,
  plain/null-prototype records, and shared acyclic children. Rejects undefined,
  nonfinite numbers, bigint, functions, symbols, cycles, custom prototypes,
  sparse arrays, named array properties, accessors and nonenumerable fields.
  Validation does not invoke getters or toJSON hooks. JSON strings may contain
  escaped controls/lone surrogates; protocol text uses the stricter assertText.
- `serializedJson(unknown)`: materializes detached data from checked own data
  descriptors, then serializes that data. It never serializes the original object
  or reads a caller's virtual toJSON property. Array lengths also come from their
  descriptors. Native serialization failures become a bounded TypeError without
  echoing rejected data.
- `assertSerializedLimit(value, limit)`: validates finite JSON, then counts actual
  UTF-8 bytes of JSON.stringify using TextEncoder. The numeric limit must be a
  nonnegative safe integer. Pass the **entire selected aggregate** for reminders,
  doctor plus continuation, recovery, or manifest using canonical protocolLimits.
  This helper enforces JSON validity/size; the owning decoder must also check the
  protocol field's specific shape and provenance. It never truncates a field.
- `frozenJson(value)`: captures checked descriptors once, serializes only the
  detached data and freezes the parsed snapshot. It does not mint any brand.
  Constructors must capture first, then run domain/size checks against that
  snapshot and retain it. Checking a live value and capturing it afterward is
  unsafe: proxy descriptors can change between observations. Large arrays avoid
  argument-spread stack limits. Serialization retains JSON semantics (including
  negative zero). JSON assertion helpers observe values; they cannot stabilize a
  caller-owned proxy for subsequent use.
- `assertInvocation(value, effect?)`: checks exact candidate reference shape,
  path, effect, string tokens and finite flag values, with optional read-only
  restriction. It asserts the structural fields only, never the Invocation brand.
  Registry/delivery must still verify membership, credentials and runnable inputs.
- `assertRecord`, `assertFields`, `assertText`, `assertIdentifier`, and
  `assertNonnegativeInteger` support the same checked constructor boundaries.

The catalog checks a continuation's wrapped size locally. Response assembly still
owns the combined doctor/continuation limit after central doctor insertion and
all transported protocol ingress checks. Execution owns unknown-acknowledgment
provenance; no durable ID is invented here. Response/delivery own classification,
aggregate diagnostic budgeting, effect preservation, final text/JSON limits and
fallbacks. Existing stubs outside this context's ownership are unchanged.

## Verification

`tests/values.test.mjs` exercises public constructors; `tests/results.test.mjs`
exercises public catalogs/recovery/guidance constructors and private JSON/size
checks. Hostile JavaScript shape fixtures explicitly make no registry provenance
claim. Exact-file runs confirmed missing behavior against existing/new skeleton
stubs before implementation. Subsequent failing reproductions pinned oversized
error codes, recovery array getter execution, and large-detail snapshot overflow;
each was fixed before its exact-file rerun.

Context-review repair: additional failing regressions reproduced virtual toJSON
hooks replacing catalog classes, nested error facts and bounded recovery/hint
references. The repair materializes descriptor data before serialization and
moves every affected constructor's shape/size checks onto its retained snapshot.
Sibling regressions cover root/nested proxies, stateful hooks, changing descriptor
traps, property reads concealing invalid descriptor facts, and hooks concealing
oversized data. No virtual hook is executed. Ordinary JSON keys such as
__proto__ and non-callable toJSON remain data.

Threshold tests cover ASCII, multibyte Unicode, supplementary characters, quotes,
backslashes, aggregate overhead, exactly-at-limit acceptance and one-byte overflow.
Mutation tests pin detached immutable definitions, errors and recovery. Existing
compiler fixtures retain literal IDs/units, catalogs, class correlation and Any*
protections without new diagnostic suppressions. Final settled validation IDs and
invariant checks are recorded in `docs/implementation/kernel-values-output.json`.
