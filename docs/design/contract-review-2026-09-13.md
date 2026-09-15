# Review of the draft public contract (2026-09-13)

Status: a review of the scaffold under `src/`, `examples/` and `type-tests/` against the
objective in `HANDOFF.md`, the six normative skills, and both consumers. Nothing under
`src/` was changed. Every "measured" figure below was taken from source on 2026-09-13;
consumer figures come from a read-only survey of `command-center/src/cli` and
`knowledge-base-ingest/src/cli` and cite the file that holds the fact.

Method: read all 1,229 lines of the scaffold and its contract document; read the
proposal, the audit and the six skills; ran the project typecheck (passes, exit 0);
compiled eight scratch probe files against the real sources to confirm suspected holes.
The probes are reproduced in the last section so the findings can be re-checked.

## Verdict

The scaffold gets the hard guardrails right: lazy handlers by construction, omission
that cannot truncate silently, exact inputs that survive variable assignment, secrets
that cannot enter suggestions, reminders that handlers cannot author, a validate twin
that cannot commit, manifests and prepared values that only the pipeline can mint. Keep
all of that.

It falls short of the objective in three ways. First, one type bug makes the default
`Result` family unusable for ordinary consumers and hides itself behind an expect-error
fixture. Second, the authoring surface is noticeably heavier than the "minimal overhead"
goal, and several framework decisions are pushed back onto every call site. Third, the
types omit things both consumers measurably rely on today: per-command text rendering,
derived and repeatable flags, defaults, variadic positionals, runtime-resolved artifact
locations, and a doctor pointer that is appended centrally rather than authored per error.

Design score by the software-design-philosophy diagnostic: **7/10** (five of eight rows
pass). Failing rows and the change that clears each:

| Failing row | Why | Change |
| --- | --- | --- |
| Interfaces simpler than implementations | Declaring one command touches three files and repeats `required`, `args: {}`, `flags: {}`, `bytes(...)`, `selector` | Findings 3, 8, 12 |
| Change implementation without touching callers | Effect state has three representations; doctor recovery and refusal rationale are authored at call sites; help-context opt-in lives outside the registry | Findings 4, 5, 9, 11 |
| Interface comments describe the abstraction | `context`, `ownerId`, `payload()` rejection behaviour and the recovery field are undocumented or documented only in the contract prose | Finding 14 |

## Findings, ranked

### 1. The default `Result` type trips the compiler's recursion limit (bug)

`Success<Data = JsonValue>` declares `data: JsonData<Data>` (`src/results.ts:55-57`),
and `JsonData<JsonValue>` recurses without an alias anchor (`src/values.ts:9-13`). Every
framework signature that uses the bare default is affected: `ReadHandler.run`
(`src/commands.ts:46`), `CommitReport.result`, `GuidanceProvider.result`, `Payload`,
`Envelope` and `decodeEnvelope`.

Evidence. In a fresh program the positive control below fails with TS2589:

```ts
accepts<Result>({ ok: true, data: null });     // TS2589: excessively deep and possibly infinite
```

The same failure hits `const widened: Result = concreteResult` when `concreteResult` is a
`Result<Receipt>`, which is exactly the handler-to-framework flow. The repository's own
check stays green only because `type-tests/adversarial.ts:141` is the first comparison
against the bare `Result` in the program and its `@ts-expect-error` absorbs TS2589 along
with the intended error (a probe of that line without the directive reports both
diagnostics). After the first failure the compiler substitutes the error type, so later
comparisons of the `data` slot pass unchecked: the literal that failed as the first use
in one probe passed when placed second in another.

Fix, verified by probe. Split the two roles the alias is carrying:

- Keep `Result<Data>` for authoring, with no `JsonValue` default.
- Add a non-generic wire-side type (`AnyResult`, or rename as you prefer) whose data is
  plain `JsonValue`, and use it in every framework signature. A `Result<Receipt>` built
  from an ordinary DTO interface assigns to it structurally, because the mapped
  `JsonData<Receipt>` is an anonymous object type with an implicit index signature.
- Do the same for `Envelope` and `Payload`.

Do not fix it by short-circuiting the alias (`[T] extends [JsonValue] ? T : ...`): that
makes the alias measurably covariant, and `Result<Receipt>` then fails to assign to
`Result<JsonValue>` because interfaces lack index signatures. Both variants were probed.

Add positive-control fixtures so the pin cannot pass vacuously again:
`accepts<AnyResult>({ ok: true, data: null })` as the first line of a type-test file, and
a handler returning an inline literal.

### 2. Text rendering has no slot, so neither consumer's output fits

Handlers return JSON data only (`ReadHandler`, `MutationHandler` in `src/commands.ts`),
and the pipeline "renders text or JSON from one envelope". The proposal says domain text
renderers stay with the applications, but the types give them nowhere to plug in.

Measured need: cctl renders text per command with hand-written code (`render(json,
humanStdout, envelope)` in `src/cli/shared.ts:450`; 21 of 38 implementation files call
it; nothing is derived generically from JSON). kb uses a generic structural walker
(`formatText`, `src/cli/output.ts:130-221`) with an opt-in `renderHuman` used by exactly
one command (`doctor`).

Change. Give the lazy handler module an optional pure renderer per runner, keyed on the
runner's data type, with the generic walker as the default:

```ts
readonly run: (input) => Promise<Result<Data>>;
readonly text?: (data: JsonData<Data>) => readonly string[];   // primary lines only
```

This keeps "handlers hold no stdout handle": the renderer sees the same data object the
JSON path serialises, so text and JSON disclose the same facts by construction, and the
pipeline still owns issue lines, guidance prefixes, ordering and the byte bound. It
requires a `Data` parameter on `ReadHandler`/`MutationHandler`, which the module already
knows. A runtime tripwire should reject renderer lines that begin with a guidance prefix.

### 3. Flag and argument features both consumers use are unrepresentable

`ValueKind`, `Flag` and `Argument` (`src/input.ts:4-23`) support string, integer, enum,
pattern, id and boolean. Measured usage that has no home:

| Feature | cctl | kb | Scaffold |
| --- | --- | --- | --- |
| Derived `--<name>-file` twin (`fileSource: true`) | 16 flags (`help-types.ts:71`) | none | missing; the proposal names it |
| Repeatable list flags | 2 (`ask --option`, `memory --alias`) | none | missing |
| Default values | 20 (prose only) | 16 (`defaultValue`) | missing |
| Variadic positionals | 1 (`spec remove`) | 3 (`search`, `ask-context`, `claim`) | missing |
| URL value kind | none | used (`spec.ts:61`) | missing |
| Global flags such as `--token` | 1 secret global (`help-render.ts:31`) | none | no global-flag declaration |

Change. Add `fileSource?: true`, `repeatable?: true` (typed as `readonly V[]` in
`Inputs`), `default?: V` (which makes the flag non-optional in `Inputs`, so handlers
never re-apply a default), a `variadic` last argument, and `url`. Add
`CliOptions.globalFlags` so identity and credential flags are reserved across the
registry and reach `ApplicationProvider` typed, instead of being invisible to the
reserved-name check.

### 4. Exit-3 recovery is authored at every call site instead of derived

`ErrorCatalog.error` requires a `recovery: Invocation<"read", "doctor">` on each
connection-class error (`src/results.ts:36-41`), while `createCli` already requires the
doctor command whenever the catalog has that class (`src/runtime/index.ts:69-72`). Two
sources of truth for one fact; a call site can pass a doctor invocation with different
flags than the registered command.

Both consumers append the pointer centrally: cctl's `connectionFailure` adds
`DOCTOR_POINTER` and an allowlist test forbids any other constructor
(`shared.ts:521-531`, `connection-failure.contract.test.ts`). cctl also needs two shapes
the type forbids: a cross-instance token rejection points at `cctl dev doctor`
(`doctor.ts:153-155`), and `workflow wait` returns a cursor-carrying continuation on
disconnect. The path literal `"doctor"` on both `CliError` and `CliOptions.doctor` rules
those out.

Change. Drop `recovery` from `ErrorOptions`. The response owner appends the registered
doctor invocation to every connection-class failure; allow an optional override typed
`Invocation<"read">` for the continuation case; let any read command register as doctor.

### 5. Refusal rationale belongs on the code, not the call site

`why` is per call (`ErrorOptions.why`, `src/results.ts:20`). Both consumers key it by
code: kb's `RATIONALE: Partial<Record<IssueCode, string>>` (`issues.ts:33`) and cctl's
server pins it with `z.literal` per code (`lib/tickets/schemas.ts:819-826`). Designed
friction wants the same sentence every time the constraint is met. Change: allow
`why?` in `ErrorDefinitions` entries, with the call-site field as an override.

### 6. Mutations force prepare/commit on every write

`HandlerModule` routes every `write` or `job` to `MutationModule` (`src/commands.ts:70-72`),
so all writes need `prepare` and `commit`. The twin only exists for payload commands, and
the applied report demands `recovery` even for a trivial receipt (probe: an applied
`CommitReport` without `recovery` is rejected). Measured: cctl has roughly 98 write
leaves, 24 with `--file`; kb has 16 writes, 5 with `--file`, and no `validate` verb at
all (it uses `--dry-run` with a rolled-back transaction, `dryRun.ts:47`).

Change. Require `prepare`/`commit` exactly when the spec declares `payload` (that is
where the twin and the payload hash matter) and accept a plain `run` returning a
`CommitReport` otherwise. Make `recovery` required only for `unknown`, and type it as
compact facts (cctl's `RecoveryFacts = Record<string, string | number | boolean>`) rather
than `JsonValue`, so it can honour "compact recovery facts stay inline after a spill".

### 7. The payload schema should be declared, not requested

`ctx.payload(schema)` (`src/commands.ts:40`) lets a `prepare` that never calls it pass
the validate twin with no validation, which silently breaks the verb's promise. Change:
`mutation({ payload: schema, prepare, commit })`, with `prepare` receiving the decoded
value. The framework then validates before `prepare` in both the twin and the mutation,
and parity holds by construction. The schema still lives in the lazy module.

### 8. Authoring noise that the objective asks to remove

Each item is small; together they are the "minimal overhead" gap.

- `required: boolean` is mandatory on every flag and argument. Make flags optional by
  default (`required?: true`) and arguments required by default (`optional?: true`).
- Examples must spell out `args: {}` and `flags: {}` even when the inventory is empty
  (probe confirmed). Make each optional when the corresponding inventory has no required
  entries.
- `DisclosureLevel.selector` duplicates the map key; a key/selector mismatch compiles
  (probe confirmed). Use the key.
- `Host.files.writeAtomic` takes a `collision` parameter with one legal value
  (`src/runtime/index.ts:17`). Remove it and state the policy in the comment.
- `ApplicationProvider` requires `release` (`src/runtime/index.ts:30`); cctl has nothing
  to release. Make it optional.
- `output.maxBytes` and `artifacts` are required on `createCli`. Default the budget from
  the skill (32 KiB) and the directory from `name`; both consumers converged on a budget
  and differ only in the number.
- `defineCommand<App>()` returns a definer, so the proposal's `defineCommand` name now
  means a factory. Rename the factory (`commandsFor<App>()`) and keep `defineCommand` for
  the call that declares a command, or accept the mismatch knowingly.

### 9. Effect state has three shapes

`CommitReport` (`src/results.ts:84-87`), `ExecutionResult.operation`
(`src/internal/execution.ts:8-12`) and `OperationState` plus the `Envelope` arms
(`src/results.ts:89-101`) each encode applied / not applied / unknown with their own
recovery rule, and `Applied` is a fourth carrier. Adding a state means four edits. Export
one `OperationEffect` union and use it in all three layers.

### 10. Guidance has two arbitration seams

`evaluateGuidance` accepts the handler's guidance as an input
(`src/guidance/index.ts:117-121`, probe confirmed) and `deliver` also receives the
handler result and the evaluated guidance (`src/internal/response.ts:9-15`). The contract
promises one seam. For cctl the rules run on the server and the handler hint exists only
on the client, so arbitration must happen in the response owner; remove `handler` from
`GuidanceEvaluation`. That also lets the `eventSink` be wired once instead of in both
`RuleRegistration` and `CliOptions.guidance`.

### 11. Registry facts that live outside the registry

- Help-context opt-in. cctl opts entries in with `dynamicContext: true` (61 entries,
  `help-types.ts:172`); the scaffold has only global providers that receive a path
  (`src/runtime/index.ts:35-45`), so the opt-in list would live in the provider and drift.
  Add a per-entry declaration.
- Artifact directory. kb resolves it at runtime from an env var and a hash of the KB
  root, and must keep it outside the KB (`spill.ts:110-140`). `ArtifactPolicy.directory`
  is a static string (`src/disclosure.ts:37`). Accept a function of `{ env, app }`.
- `related` edges are path strings (`src/commands.ts:8,14`) while `Flow.steps` and
  `appliesTo` use tokens. Either use tokens (a thunk avoids initialisation-order errors
  between sibling declarations) or document why strings plus the registry sweep are the
  chosen rung.
- Consumer-specific help sections. kb renders `output`, `side effects`, `atomic`,
  `workspace access` and `input` sections (`spec.ts:452`). Add a typed extension slot on
  `Metadata` rather than enumerating kb's fields or forcing them into `context`.

### 12. `HandlerContext` should carry the command token and the catalog

Handlers must import their own declaration to build a next-page `reveal` and import the
catalog to fail. Neither is checked against the running CLI: a handler can return an
error from a catalog the CLI never registered (probe confirmed), so the `exit-codes`
route and the reference would not list it. Bind the catalog when the definer is created
(`commandsFor<App>({ errors })`) and expose `ctx.command` and `ctx.errors` typed to this
CLI. Complexity moves down; the handler file loses two imports.

### 13. Smaller type holes and vestiges

- A command with a required secret flag can never be suggested: `Suggestible`
  intersects the required key with `?: never` and the whole input collapses to `never`
  (probe confirmed). Omit secret keys and waive their requiredness instead.
- A widened argument name (`name: "id" as string`) escapes `ExactInputs` (probe
  confirmed). Add `string extends S["args"][number]["name"] ? never : unknown` to
  `ValidSpec`.
- `effects: "job"` has no contract of its own; `HandlerModule` treats it exactly as
  `write`. kb has no jobs; cctl's six job sites use `JobWaitSpec` (`job-wait.ts:44-74`),
  which the kit will define. Drop `job` until the kit exists, or give it a difference.
- Framework-authored error codes (guidance conflict, unwritable artifact, payload too
  large) have no type. Export the kernel's code union so `Envelope.error.code` is
  `KernelCode | keyof D`, and so the reference and `exit-codes` route can list them.
- `HelpNode.flags` is `Record<string, JsonValue>` and `examples` is `string[]`
  (`src/runtime/index.ts:100-110`). The skill wants `--help --json` to return the entry
  itself; type it as the structured entry, including effects, levels, payload and context.
- `Issue` lacks `details` (`src/results.ts:12-16`); kb's issues carry `details` and
  `ids` (`output.ts:12`).
- No `nodeHost()` is exported, so a consumer that calls `runCli` in-process cannot obtain
  the default host. Export it or default `RunRequest.host`.

### 14. Interface comments to add

`Metadata.context` (what it is, and how it differs from `HelpContext`);
`Instruction.ownerId` (what an owner is and how overlap is detected);
`HandlerContext.payload` (rejects with a usage failure carrying issues; do not catch);
`Host.files.read` behaviour past `limit`; `CommitReport.recovery` (what it is for and
where it must survive); `ArtifactPolicy.forbiddenRoots` (canonical, symlink-resolved).

## What to keep

The unique-symbol brand with a scope parameter; `Command<S, App>` contravariant in
`App`; `ValidSpec`'s reserved-flag and open-inventory checks; `ExactInputs`;
`Omission` with `reveal` only on the truncated arm; `validationInvocation` returning a
read-only route; `Prepared` scoped by path; `HandlerOnly` forbidding reminders, exit codes
and effects on results; the required event sink with any rule; `ArtifactManifest` and
`ArtifactPath` minted only by delivery; the four-subpath export map; the type-test
discipline of pinning each guardrail with a violating fixture.

## Decisions for Alex surfaced by this review

1. Whether `Id<Domain>` should enter consumer domain types (the example `App` uses it).
   It buys cross-domain mismatch errors at the cost of branding every ID that leaves
   storage. Keeping `kind: "id"` optional beside `kind: "string"` preserves the choice.
2. Whether kb keeps `--dry-run` alongside a generated `validate` twin for its five
   payload commands, or the twin replaces it. The skill favours the twin.
3. Whether the wire hint stays text while `reveal` and recovery are structured
   invocations, or all three share one shape in `--json`.

## Probes used

All probes were compiled with a temporary tsconfig that extended the project's and
included `src/**/*.ts`; expected diagnostics are shown as comments.

```ts
// Finding 1 (first comparison against the bare default in the program)
accepts<Result>({ ok: true, data: null });                          // TS2589
declare const cur: Result<Receipt>; export const w: Result = cur;   // TS2589 as first use
// Finding 13: required secret flag
invocation(login, { args: {}, flags: {} });                         // intersection reduced to never
invocation(login, { args: {}, flags: { token: "t" } });             // string not assignable to never
// Finding 13: widened argument name
args: [{ name: "id" as string, ... }]  →  invocation(loose, { args: { typo: "x" }, flags: {} }); // compiles
// Finding 8: empty inputs; level key vs selector
define(bareSpec, { examples: [{ why: "w" }], ... });                // missing args, flags
levels: { full: { selector: "body", output: "bounded" } } → invocation(cmd, { ..., level: "full" }); // compiles
// Finding 6: applied commit without recovery
const r: CommitReport<{ readonly notified: true }> = { status: "applied", result: okReceipt }; // recovery missing
// Finding 12: foreign catalog
const p: Result = { ok: false, error: foreignCatalog.error("ELSEWHERE", { message: "m" }) }; // compiles
// Finding 1 fix candidates
type AnySuccess = { readonly ok: true; readonly data: JsonValue };
const ok: AnySuccess = typedSuccessOfReceipt;                       // compiles (structural)
type JsonB<T> = [T] extends [JsonValue] ? T : ...;                  // Result<Receipt> → Result<JsonValue> fails (variance)
```

## Flexibility and command-kind coverage (added later the same day)

Question asked: how flexible is the design, and can it express the kinds of commands the
two reference projects contain while staying generic and decoupled from them?

Method: every leaf command in both CLIs was classified into one primary kind by a
read-only survey (cctl: 163 leaves from 195 registry entries, expanding two generator
loops; kb: 38 leaves), then each kind and each unusual behaviour was mapped onto the
scaffold's types. Kind assignment is a judgment; the totals and the file references are
measured.

### Where the flexibility comes from

Six seams carry everything consumer-specific, and nothing in `src/` names either project:

| Seam | Type | What it absorbs |
| --- | --- | --- |
| Application | `App` generic on `defineCommand`, `createCli`, handlers | kb's SQLite workspace; cctl's HTTP client, identity and token |
| Rule state | `State` generic on `defineReminderRule`, `defineSteering`, `evaluateGuidance` | kb's steering state bag; cctl's lane facts evaluated on the server |
| Errors | `defineErrors` catalog `D` | kb's issue codes with a caller-fault subset; cctl's status-mapped classes |
| Side effects | injected `Host` | files, clock, hashing, stdin |
| Enrichment | help-context providers, lazy guidance provider, event sink | cctl's server-rendered context blocks; kb's local rules |
| Output policy | `ArtifactPolicy`, `output.maxBytes` | cctl's `.cc/temp` at 60,000 bytes; kb's temp directory at 32 KiB |

### Coverage by kind

| Kind | cctl | kb | Status against the current types |
| --- | ---: | ---: | --- |
| Meta and offline (version, exit-codes, doctor, schema, logs, init, skill check) | 5 | 2 | Version, help and exit-codes are kernel routes. The rest cannot run: `HandlerInput.app` is mandatory and the provider runs before every handler (`src/commands.ts:42`, `src/runtime/index.ts:26`). cctl's doctor must diagnose a missing token, kb's `init` runs before a database exists, `spec schema` and the three `logs` verbs work with the server down (`logs.help.ts:110`). |
| List, search, query | 22 | 9 | Fits. `Omission` is a data type, so a response with four scoped pages and up to four continuations (kb `search`, `query.ts:304`) or two independent cursors (`relationship list`) is ordinary data with one `reveal` per page. Needs variadic positionals (kb has three). |
| Show one item with a detail ladder | 18 | 6 | Fits. `LevelInput` admits one selector per call, which is exactly cctl's rule for `spec show` and `workflow get` (`read.ts:1219`). kb's `node show --context --full` needs a level keyed by two flags; the proposal's sketch had `flags: [...]` and the scaffold reduced it to one `selector`. Different data shapes per level are already allowed. |
| Status, digest, delta | 9 | 3 | Fits. Mode switches driven by a value flag (`coverage --source`, `source impact --node`) are handler branches with a union data type. |
| Mutation from flags and positionals | 48 | 7 | Fits once `prepare`/`commit` is optional (finding 6). Cross-flag rules such as "both or neither" (`spec plan sign-off`) stay runtime checks raised through a usage-class catalog code. |
| File-payload mutation | 36 | 5 | Fits for JSON payloads: object-or-array batches with per-element tokens are a schema union inside the lazy module; `--if-revision` and `expectedRevision` are flags or payload fields; kb's `--expect-payload` compares against `Prepared.payloadHash`. Missing: derived `--<name>-file` twins (16 in cctl, `--text-from` in kb), stdin on any file flag (cctl reads `-` everywhere, `index.ts:71`), and a raw-document input for `ingest`, whose payload is a positional file with no JSON schema. |
| Preflight and check verbs | 5 | 4 | Gap. `CommandSpec` forbids `payload` on the read arm (`src/commands.ts:22`), yet cctl `workflow validate --file` and kb `answer-check` are read-only commands that take a payload file. Gate findings named by transition are data today and a kit later. |
| Job-shaped waits | 12 | 0 | Partial. Cancellation via `signal` fits, timeouts that name the reattach command fit as failures with a hint or recovery, but neither `ApplicationProvider` nor `HandlerContext` receives the host clock or sleep, so polling loops run on real timers and the testing host cannot advance them. `validate run` prints queue-position lines before its envelope (`validate.ts:544`), which the response contract has no channel for. |
| Export and binary output | 4 | 0 | Gap. `ArtifactManifest.format` is `"json" \| "text"` and only the pipeline writes artifacts, so `ticket export` (a gzip file) and `conversation image get` (image bytes under `.cc/temp`) cannot hand bytes to the writer. |
| Local-effect | 2 | 2 | Fits once context-free commands exist. kb's `render --check` computes its access mode from a flag (`ops.ts:483`); the scaffold's static `effects` forces `render` and `render check` to be two verbs, which is the shape the skill prefers. |
| Other | 2 | 0 | `ask` fits: it returns immediately with a load-bearing instruction. `memory index` writes an unterminated raw block to stdout with prose on stderr (`memory.ts:772`); no envelope or text renderer can express it without a declared raw-output mode. |

Sources: the two survey reports, with kind counts taken from `src/cli/commands/**/*.help.ts`
in Command Center and `defineCommand` literals under `src/cli/commands/*.ts` in
knowledge-base-ingest.

### Additional findings from the census

15. **Per-command context requirement.** Both consumers carry this axis today: cctl's
    `CLI_SESSION_ENV_INVENTORY` marks each command session-only or project-supported
    (`session-env-inventory.ts:36`), and kb's `workspaceAccess` has `read`, `inspect`
    and `write` plus workspace-free `bareAction` commands. Add a consumer-defined tag,
    for example `defineCommand<App, Requires extends string>()` with
    `spec.requires: Requires`, passed to `ApplicationProvider` so it can build the
    matching context, and a `"none"` value under which `app` is absent from the handler
    input. This unlocks doctor, init, schema and logs without weakening typed context
    failure for everything else.
16. **Payload on read commands.** Allow `payload` on the read arm without generating a
    validate twin; the command is its own validation.
17. **Binary artifacts.** Add `format: "binary"` to `ArtifactManifest` and a way for a
    handler to return bytes destined for the artifact writer, so the location policy and
    the manifest still come from the pipeline.
18. **Host reaches the application.** Pass `host` (at least clock, sleep and stdin) to
    `ApplicationProvider`, and expose a read-only clock on `HandlerContext`, so the
    twelve job-shaped cctl commands are deterministic under `createTestHost`.
19. **Input forms.** `fileSource` derived pairs, `-` for stdin on any file-valued flag,
    variadic positionals, and an opt-in passthrough of arguments after `--` (cctl allows
    it for exactly one command, `validate run`, `core.ts:214`).
20. **Multi-flag level selectors**, as in the proposal's sketch.
21. **Progress lines.** Decide whether blocking waits may emit progress. The proposal
    lists streaming as a non-goal; cctl has one always-blocking command that emits queue
    position live and one wait that follows an SSE stream. A `ctx.progress(line)` that
    writes to stderr in text mode and is dropped in JSON mode would keep stdout as one
    coherent response; the alternative is a declared exception.
22. **Declared JSON-volume exceptions.** cctl keeps two entries with deletion conditions
    (`json-volume-exceptions.ts`). The proposal names this list; the testing subpath
    should type it so the equivalent-disclosure contract test can consume it.
23. **Raw-output mode** for the single `memory index` case, or accept that it changes
    shape at cutover.

### Deliberate rigidity the consumers will meet

These are places where the framework is less flexible than one consumer today, on
purpose, because a skill fixes the answer:

- One flag name has one kind across the registry. cctl's `--config` is boolean on
  `workflow get` and value-taking on `workflow live get`; kb's `--check` is boolean on
  `render` and an enum on `verify`. Both rename one flag.
- Reserved and global names cannot be redeclared with another meaning. cctl's
  `ticket attach conversation` redeclares `--conversation` and `--session`.
- A bare group is a usage error with its children listed. cctl already does this; kb
  prints group help with exit 0 and changes at cutover.
- One disclosure selector per call. cctl already enforces it; kb's combinations become
  named levels.
- Effects are static per command. kb's `render --check` becomes a separate verb.
- Instruction suppresses hint, at most two reminders, rationale only on failure, no
  colour, no prompts, no streaming by default.

### Decoupling verdict

The kernel is generic in the right sense: every consumer difference is either a generic
parameter, an injected value, or a decision the skills make once. The only literals that
lean toward the consumers are the `"doctor"` path on `CliError` and `CliOptions`, the
artifact reason names, and the four-class exit taxonomy, and the last two are the
skill's. The additions above are also generic: none of them names a project, and each is
motivated by commands in both consumers or by a skill. The risk is not coupling but
omission: without findings 15 to 19 the framework cannot host roughly a dozen existing
commands by shape and touches dozens more through derived flags and context tags.
