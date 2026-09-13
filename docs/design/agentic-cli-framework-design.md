<!--
Provenance: copied verbatim on 2026-09-13 from the my-ai-resources repository
(memory-bank/collaboration/592fad92-4333-4174-8293-4aa04cf6185c/round-1/agent_one/final_answer/answer.md),
the final output of a two-agent design collaboration reviewed once by Alex.
Status: a design proposal for review and iteration, not an approved specification.
Its companion, agentic-cli-framework-design-audit.md, records how the proposal was negotiated.
See HANDOFF.md at the repository root for the objective and the surrounding context.
-->

# An agent-CLI framework: what it would be, what it is worth, and how to build it

Alex, the short version: build it, but as a small opinionated TypeScript kernel around one executable command registry and one response pipeline, seeded from Command Center's already-audited CLI modules, generalized against a written behavioral contract, and proved on two thin pilots before any command family migrates. Both of your CLIs have already written this framework once each, and the places where they disagree are exactly the decisions a framework should make once.

Everything below comes from reading the two codebases and the fourteen skills in `claude/agentic-engineering-principles-plugin/skills/`. Neither application nor a prototype was executed. Source line counts are measured; every "how much moves" figure is a source-reading estimate and is labelled as one.

## 1. Verdict and where the value is

Value, in order:

1. **Pitfalls made structurally unrepresentable.** The flag allowlist derived from the registry key, the omission type whose reveal command exists only on the truncated arm, the capped and event-logged reminder channel, the byte-measured delivery bound, the single tier arbiter. Each of these cost one of your projects an audit finding or an incident to earn. Section 4 lists nineteen with the incident behind each.
2. **One vocabulary across CLIs.** An agent that has learned `cctl` should already know how `kb` behaves. Today they differ on envelope fields, exit-code sets, hint authoring, budgets, and artifact policy.
3. **Far less setup for the next CLI.** Today a principled agent CLI is roughly 3,000 lines of plumbing plus a comparable contract-test suite plus a steering document before the first domain command. With the kernel, a new CLI is a `createCli` call, one `defineCommand` per verb, and an inherited contract suite. How much faster that is in practice is something the pilot measures rather than something this exploration can claim.
4. **Deleting existing plumbing.** Real, but the smallest win, because domain code dominates both projects and adapters replace some of what is removed.

The main risks: overfitting to two consumers with legitimately different shapes (a thin client of a long-running server versus a local SQLite library), and a kernel that fights either. The design keeps the kernel host-agnostic and pushes everything that differs into opt-in kits on a demand-driven roadmap.

## 2. What the two CLIs already do

Both are reference implementations of the principles. Their plumbing converged without a shared library:

| Concern | Command Center `cctl` | knowledge-base-ingest `kb` |
|---|---|---|
| Typed registry | `CommandHelpEntry` in colocated `*.help.ts` files; derives help, flag allowlists, the parser's boolean set, group dispatch, and the SKILL.md reference | `CommandDefinition` builds the Commander node and help from one declaration, with typed value kinds, payload examples that must parse, and side-effect metadata |
| Envelope and tiers | `ok`, `error`, `code`, `issues`, `details`, `rationale`, `hint`, `reminders`, `instruction`; one `arbitrate` seam; six enumerated guidance prefixes | `ok`, `data`, `issues` with severity and `why`, `instruction`, `reminders`, `hint`; `success()` throws on an error-severity issue or a `why` |
| Exit codes | Data table 0–4 with a recovery command per code | 0, 1, 2 via a caller-fault code set |
| Hints | `SuccessHintRow` on the help entry with a `sample()` renderer for the sweep | 975-line steering table keyed by command over a typed state bag; unregistered commands dropped |
| Reminders | Server-authored rules plus one enumerated client advisory with a required `evidence` field | Field exists and is unwritable by handlers (pinned with a `@ts-expect-error` test); empty until an incident earns one |
| Bounded reads and spill | `boundedItems` / `boundedRows`, `Omission` with reveal only when truncated, 60,000-byte budget, `.cc/temp` artifacts with sha256 manifests | `pageAfter` cursors, `boundedSummary` with `nextCommand`, 32 KiB spill to a content-addressed file that must be outside the KB (symlink-safe) |
| Parser | Hand-rolled, two-pass, command-scoped boolean classification | Commander v14 plus a 554-line pre-parse router that intercepts help, version, `--json`, and `--dry-run` before Commander can print or exit |
| Contract tests | Registry sweep, `--json` sweep over every leaf, hint-token resolution, prefix vocabulary, exit-3 names doctor | Registry-to-parser round trip, related edges resolve, every issue code emitted or reserved, golden envelopes, skill-doc drift |
| Size | 41,267 CLI lines (193 registry entries under 19 top-level commands); 4,667 lines in 17 plumbing files | 10,111 CLI lines (38 leaves, 9 groups); 4,463 lines in 16 plumbing files |

Where they diverge, the principles are silent: envelope field names, the exit-code set, hint authoring model, budget (60,000 versus 32,768 bytes), artifact location, parser strategy, and Zod major (Command Center is on 4, kb on 3). Each is a decision the framework makes once and each is a migration cost for the project that chose the other way.

Command Center's own 2026-08 audit diagnosed its ~25 CLI findings as "a policy the CLI already committed to is implemented at N call sites instead of owned by one module". The framework is that diagnosis applied across projects.

Two findings from the reading are worth acting on regardless of the framework. Command Center's `renderBounded` (`src/cli/disclosure.ts:532-555`) builds a fresh envelope when output spills to a file and drops the original `instruction` and `reminders`, so a stop instruction attached to a large receipt does not survive the spill. And kb emits `instruction` and `hint` together on success where cctl suppresses the hint; the principles say instruction suppresses hint.

## 3. How much moves

Measured inventories, comments and blanks included, tests excluded:

| Inventory | Command Center | kb | Total |
|---|---:|---:|---:|
| Narrow candidate set (registry, parser, dispatch, help, envelope, disclosure, exit data, job wait) | 4,057 | 3,190 | 7,247 |
| Wide set (adds process adapter, version, skill digest, dry-run helpers, steering, source-scan, inventories) | 4,667 | 4,463 | 9,130 |

Estimated relocatable lines: 3,600–5,400 of the narrow set, or 5,650–6,100 of the wide set counting optional facilities. These are judgments over different inventories, not two measurements of one quantity, so they are not averaged. Highlights:

- kb's entire 554-line router exists to defeat Commander and disappears when the framework owns a registry-driven parser.
- About 900 lines of Command Center's `shared.ts` (parser, allowlist, envelope, rendering, prose and JSON readers, generic identity resolution) move into the kernel; its HTTP response classifier (~450 lines) is generic for any thin-client CLI and becomes a roadmap kit.
- Contract and architecture tests (~4,000 candidate lines in Command Center, ~2,500 in kb) become sources of fixtures and assertions for the framework's suite, not code transplanted unchanged.
- Declarative registry entries stay with each application and are rewritten in place against the framework's types: 7,817 lines of `*.help.ts` in Command Center and roughly 2,000 lines of `CommandDefinition` blocks in kb.
- Domain handlers, domain text renderers, hint and reminder content, the HTTP client, the SQLite workspace, dry-run rollback, and kb's steering rows all stay.

Net repository-wide reduction is smaller than the relocatable count because the package, adapters, and integration tests exist somewhere. The practical value is fewer independently maintained policies, inherited regression coverage, and less setup for future CLIs.

## 4. Pitfalls the framework makes unrepresentable

Each row names the incident or audit finding that earned it. In the framework, each row becomes a type, a derivation, or a contract assertion with a deliberately violating fixture that must fail.

| Pitfall | Earned by | Mechanism |
|---|---|---|
| A command accepts flags its help does not show | Command Center audit, 2026-07-06 | Allowlist derived from the registry key; a hand-written list cannot be expressed |
| A capped list with no way to see the rest | Command Center steering rule "a cap without disclosure is a defect" | Omission is a discriminated union; the reveal invocation exists only on the truncated arm |
| Row caps that still blow the context budget | kb lessons, 2026-08-14 | Delivery bound measured in serialized UTF-8 bytes across both streams after rendering |
| Tier arbitration implemented twice and drifting | Command Center audit | One arbiter on the render path; handlers never reach the renderer |
| Job waiting hand-rolled four ways | Command Center audit | One waiter (roadmap kit) |
| Output truncated at process exit | Command Center 64 KB pipe truncation | Process adapter drains before exit, proved in a real child-process test |
| Suggested commands naming verbs that no longer exist | Command Center hint-token sweep; kb steering | Suggestions are invocation objects validated against the registry; a sweep still covers prose |
| Reminders nobody earned | `agent-feedback-tiers` admission rule | At most two per response; every firing emitted as an event; rule additions reviewed (an evidence note is optional documentation) |
| A rationale on a success | kb constructor throws; cctl renders `why` only from `failure` | `why` is a field of `error`; success has no slot |
| `--json` disclosing more than text | Command Center volume-exception list | Equivalent-disclosure test with a declare-or-fail exception list carrying deletion conditions |
| Verb lists hand-listed in group modules | Command Center audit | Dispatch derived from registry children, root included; a disagreeing handler map throws |
| Help that depends on the server | `progressive-disclosure-tooling`; cctl help-context | Providers run under one total deadline and fail open; static help renders byte-identically |
| ANSI escapes in agent-read output | kb lessons, 2026-09-01 | No colour path exists |
| A scratch payload swept into a commit, or an artifact written inside the dataset | Command Center advisory; kb spill guard | Artifact location policy with forbidden roots and a symlink-canonical check |
| Exit 3 without a recovery pointer | Command Center contract test | The connection-failure constructor appends the doctor pointer |
| Commander printing help or version mid-parse | kb router header lists seven interceptions | Private registry-driven parser; no Commander |
| Guidance lost when output spills | Command Center `renderBounded`, verified in this exploration | Required instruction, reminders, effect, and recovery ids stay inline after any spill or write failure |
| Every invocation initializes every command's schemas and transport | Command Center 2026-09-11: 0.7 s to print a version string, 546 ms of a 961 ms profile in Zod | Handlers are lazy imports, declarations are data only, the kernel bundles no runtime dependency, and an eager-module allowlist test fails on a new static import |
| A TypeScript launcher as the distribution | kb: `tsx` costs 0.39 s on an empty file against a 0.07 s Node floor | Single-file bundle is the default artifact; the launcher is not the product |

## 5. Design

### One executable declaration per command

`defineCommand` and `defineGroup` are the only places a command is described. A leaf declares its path, summary, description, typed args and flags using the framework's own lightweight kinds (integer with range, string with length, enum, pattern, id; no schema objects), structured examples that must parse, optional disclosure `levels`, `effects` (`read`, `write`, or `job`), related edges, skill references, and a lazily imported handler module. The declaration is data; everything that runs lives in the handler module, which is loaded only after the parser has resolved this leaf.

```ts
// node/show.command.ts — data only; imports nothing but framework types
defineCommand({
  path: ["node", "show"],
  summary: "Inspect a node and its synthesis readiness.",
  effects: "read",
  args: { id: arg.id("node", "node id") },
  examples: [{ args: { id: "n_9f3a" }, why: "inspect before synthesizing" }],
  related: [ref("node", "tree"), ref("synthesize")],
  levels: {
    default: {},
    body:    { flag: "body" },
    context: { flag: "context" },
    full:    { flags: ["context", "full"], spill: "eligible" },
  },
  handler: () => import("./show.handler"),   // exports one runner per level
});

// claim/apply.command.ts
defineCommand({
  path: ["claim", "apply"],
  summary: "Persist claims from a payload file.",
  effects: "write",
  flags: { file: flag.file({ description: "payload file, - for stdin", maxBytes: 2 * 1024 * 1024 }) },
  examples: [{ flags: { file: ".cache/kb/claims.json" }, why: "validate first; exit 2 lists issues one per line" }],
  handler: () => import("./apply.handler"),  // exports prepare and commit
});

// claim/apply.handler.ts — the only place the schema and application code are touched
export const prepare = async ({ ctx, app }) => app.claims.prepare(await ctx.payload(ClaimApplySchema)); // persists nothing
export const commit  = async ({ prepared, app }) => app.claims.commit(prepared);                          // the only path that writes
```

The framework derives from the declaration: the parser's command-scoped flag acceptance, group dispatch including the root, generated usage, text help and `--help --json`, selector flags for levels, `--out` for spill-eligible levels, a `claim validate` twin that runs `prepare` only (so parity with the gate holds by construction, because `commit` calls the same `prepare`), the generated command reference and exit-code table, and the contract fixtures. Build-time validation rejects duplicate paths, missing parents, dangling related edges, boolean-versus-value conflicts within a scope, missing leaf examples, overlapping unconditional instruction owners, `fileSource` on a flag already named `file`, and a declaration module that imports anything beyond the framework's types (a restricted-imports rule on `*.command.ts`, proved red by a fixture). A command with only an ordinary handler pays nothing for `levels`.

Standard Schema is the validation boundary for payloads, applied inside handler modules through `ctx.payload(schema)` and never referenced from a declaration. Command Center's Zod 4 and kb's Zod 3.24 both implement it, so no adapter code exists and structured issue paths survive. Effects metadata says nothing about rollback safety; dry-run remains application-owned.

### One pipeline

`runCli(argv, env, host)` is a pure function returning exit code, stdout, and stderr:

1. Parse against the routing table derived from the declarations; usage errors, including a group's "requires a subcommand" and unknown-verb refusals, exit 2 before any handler module is imported.
2. Route `--help`, `help …`, `--version`, and `exit-codes` offline from the routing table and the build stamp, always exit 0, touching no transport, logger, or application context.
3. Resolve the leaf, then import its handler module.
4. Acquire required context (kb's workspace, cctl's identity and token); failures are typed errors with their own exit class, and context is released in `finally`.
5. Run the handler, or `prepare` only for a validate twin.
6. Assemble guidance from the handler's result, declared next steps, and state rules under one arbiter.
7. Render text or JSON from one envelope.
8. Measure serialized bytes across both streams against the budget, with guidance space reserved; spill or fail delivery with meaning preserved.
9. Return. The `main()` adapter enables Node's compile cache when the runtime offers it, drains output before exit, and treats downstream pipe closure separately from write failures.

Handlers return structured results. They hold no stdout handle, never build an envelope, and never apply the size wrapper. An architecture tripwire catches direct process output from registered command modules, because TypeScript cannot prevent it.

### One envelope

```jsonc
// success, inline
{ "ok": true,
  "payload": { "kind": "inline", "data": { "runId": "run_123", "status": "started" } },
  "issues": [],
  "reminders": [], "hint": "watch it with cctl workflow status run_123" }

// success, spilled
{ "ok": true,
  "payload": { "kind": "artifact",
               "summary": { "nodeId": "n_9f3a", "bodyHash": "…", "approxTokens": 24000 },
               "artifact": { "path": "/abs/.cache/kb/out/node-show-3fa9.json", "format": "json",
                             "bytes": 81234, "sha256": "…", "reason": "stdout_budget_exceeded", "contains": "data" } },
  "hint": "read it in byte ranges: head -c 4000 /abs/.cache/kb/out/node-show-3fa9.json" }

// failure after a mutation that did apply
{ "ok": false, "effect": "applied",
  "payload": { "kind": "inline", "data": { "runId": "run_123" } },
  "error": { "code": "GUIDANCE_CONFLICT", "exitClass": "failed",
             "message": "the operation completed, but its required guidance conflicts" },
  "issues": [],
  "instruction": "Stop further work on this operation and report GUIDANCE_CONFLICT." }
```

- `payload` is a discriminated union and may be present on failure: a failed verification still returns its report, and a receipt undeliverable after a commit still names the committed object.
- `effect` (`not_applied`, `applied`, `unknown`) is top-level and present only for commands declaring `write` or `job` effects. It describes the application operation, not artifact writing. A false `ok` means the CLI request did not complete; `effect` says whether the mutation happened.
- `error` carries `code`, `exitClass`, `message`, optional `why` (a designed refusal's one-sentence rationale), `issues`, and `details`. `why` has no success slot.
- Guidance fields ride outside the union: one `instruction`, up to two `reminders`, one `hint`. Instruction suppresses hint.
- Text success goes to stdout in the order primary output, issue lines, `instruction:`, `reminder:` lines, `hint:`. Text failure is one coherent stderr response in the order message, issue lines, `why:`, `instruction:`, `reminder:`, `hint:`. JSON mode is one envelope on stdout. Nothing depends on how a harness merges the two streams.
- Exit classes are the taxonomy in `cli-tools-for-agents`: 0 success, 1 failed operation, 2 usage or payload validation, 3 connection or authentication, 4 version mismatch. A local CLI uses the subset that applies. Each application's issue-code registry declares the exit class per code; the framework requires the declaration without dictating the value, so kb decides for itself whether a locked database is 1 or 3. Command Center's stricter build-skew refusal is preserved through an explicit integration.

### Type safety by brand

Brands are the tool wherever two values share a runtime representation but must never be confused. Each brand below is pinned by a `@ts-expect-error` fixture, the way kb pins "handlers cannot author reminders", so a widened signature fails a test instead of silently reopening the hole. Brands are compile-time only; runtime validation at the boundaries (payloads, env, wire) stays.

| Brand | Minted only by | What becomes a compile error |
|---|---|---|
| `Prepared<T>` | `prepare` | Committing raw or re-validated input; the validate twin reaching `commit`. Carries the payload hash, so guarded replay is typed |
| `Applied<Receipt>` | `commit` | Setting `effect: "applied"` without a real commit |
| `CommandPath`, `Invocation<P>` | `createCli`, from the declarations | A hint, edge, or reveal naming an unregistered path, or an option its target does not declare |
| `Id<"node">` | `arg.id("node")` | Passing a source id where a node id is expected; outline handles and drill-down args share one type |
| `Hint`, `Instruction`, `Reminder` | `hint()`, `instruction()`, the rule engine | A bare string in any tier; protocol landing in the ignorable tier by typo |
| `ConnectionError` | the factory that appends the doctor pointer | An exit-3 result without its recovery pointer |
| `Bytes`, `Count \| "unknown"` | `bytes()`, the page helper | A row cap handed to a byte budget; an unknown total rendered as zero |
| `ArtifactPath` | the artifact writer, after the location check | A manifest pointing outside policy |
| `ShellSafe` | the invocation renderer | An unquoted runtime value printed as a command line |
| `Envelope` versus `RenderedText` | the pipeline | A handler returning pre-rendered text as data |

### Guidance: instruction, reminders, hint

The three tiers keep the obligations the `agent-feedback-tiers` skill defines, and the framework enforces them structurally:

- **Hints** come from a command-local next-step declaration or from a state rule. Both produce invocation objects (registered path, args, options, scope) that the framework validates and renders shell-safe; runtime values cannot corrupt a suggestion or forge a guidance line, output-format flags are not propagated, filters and target selectors are preserved, secrets never appear. Terminal actions get no hint. Overflow past one optional candidate points at a read-only status or list verb; the framework never suggests re-running a mutation to reveal more.
- **Instructions** come from the application's protocol owner or from a rule that explicitly declares the instruction tier. There is no generic promotion from "this was a mutation" or "this failed"; kb's `guidanceRequiresAction` is a predicate over specific commands and stays kb's. Overlapping unconditional owners fail at registry build. If distinct required instructions still collide at runtime, the result is a structured `GUIDANCE_CONFLICT` failure that preserves outcome, effect, and receipt, renders one framework-authored stop-and-report instruction, carries the competing texts as diagnostics, and fails every contract fixture that reaches it. Neither a crash nor a silent winner.
- **Reminders** come only from rules with a stable id, scope, a state predicate, priority, text, and an optional evidence note, evaluated where authoritative state lives (Command Center's server for workflow state, kb's application layer for its database). At most two per response, including any client-local rule. Handlers cannot author them; kb already pins this with a `@ts-expect-error`. Evidence is documentation, not a requirement (Alex's decision, 2026-09-13): the cap, the event emitted on every firing, and review of rule additions are what keep the channel scarce.

The framework's guidance wrapper emits `guidance.rule_fired` and `guidance.conflict` events itself. An event sink is required whenever any rule source is registered, steering rules included, because conflicts arise between a handler and a steering rule as readily as from reminders. A handler-only CLI needs no sink. The contract suite proves emission; the consumer's integration test proves the sink writes durably; a conflict response stays visible if the sink fails.

Guidance is computed per invocation, after the handler returns and before rendering, from three sources that all see runtime state. The handler computes a hint or instruction from the result it just produced ("12 of 143 shown, continue with …"). Steering rules, `defineSteering({ after, when, tier, render })`, evaluate against the post-operation state the handler reports through `ctx.report(...)` (kb's `SteeringState` shape) plus the receipt; they run only for the commands they name, so they cost nothing at startup, and a rule module can be lazy per command family. Reminder rules, `defineReminderRule({ id, appliesTo, when, text, priority, evidence? })`, evaluate where the authoritative state lives: locally for kb, whose rules can read `app`, and on the server for cctl, whose responses carry already-evaluated reminders that the CLI merges with its own client-local rules about the caller's filesystem. The arbiter then applies the caps and the suppression rule and turns distinct instructions into `GUIDANCE_CONFLICT`.

### Contextual responses

Two different things, kept separate. Required execution context is acquired before the handler, typed on failure, and released afterwards. Optional help enrichment runs read-only providers for entries that opt in, under one total deadline that includes context resolution, with block and byte caps; any failure renders static help byte-identically with no new stderr output. An unknown command path stays a usage error even though help never fails. A command that explicitly asks for live state fails visibly under the normal error contract.

State-dependent hints and reminders receive the handler's reported post-operation state and the receipt, never a snapshot cached before the mutation. Contextual "what next" or status commands need no special kit: they are ordinary commands whose data is a bounded digest and whose rules compute the next step.

### Related commands and workflows

Help carries `related:` edges, contract-tested to resolve. Command output does not get a generic related-commands block; that would be always-on noise in the ignorable tier. Related commands reach output through four typed edges instead: success hints chain to the next verb, usage errors under a matched group list its children, omission lines carry the exact reveal invocation, and exit 3 names `doctor`. `--help --json` returns the related edges structurally.

Multi-step workflows ("after X, run Y") are typed `next` edges on declarations, which is what cctl's success-hint rows already are:

```ts
next: [{ to: ["spec", "create"], when: (r) => r.ok, render: (r) => invocation(["spec", "create"], { file: r.file }) }]
```

After success the arbiter picks the first matching edge as the hint, with tokens filled from the receipt. Edges are authored beside the command, resolve against the registry at compile time, and each carries a sample rendering for the contract sweep. `defineFlow({ id: "spec-launch", steps: [...] })` is sugar that generates those edges, adds a `context:` line to each step's help ("step 2 of 4 in spec-launch"), and emits a generated flows section in the skill document so an agent can read the whole chain before starting it. Conditional branches (a dry-run steering to its guarded replay, a failure steering to recovery) and state-driven next steps (kb's readiness report) are steering rules with predicates, not edges. When a server owns the workflow, it sends facts and the client selects the registered next step. The framework renders the graph as guidance and never tracks progress: an invocation is stateless, and per `agent-offloading` the orchestrator or the application owns workflow state.

### Large output

Two layers. Designed disclosure comes first: levels, a page helper that accepts already-paged database or server results and builds a continuation from the selected view, filters, target, and actual cursor (unknown totals stay unknown), bounded outlines with stable handles, and omission lines that name the reveal invocation.

Then every final response passes one delivery bound. Bytes are measured after serialization across both streams, including escaping, diagnostics, guidance, and manifest overhead. Past the budget (32 KiB initially, configured per application and calibrated in the pilot) the complete pre-spill document goes to a unique or content-addressed file written atomically, and stdout carries a receipt: absolute path, format, bytes, hash, reason, and whether the file holds a response or data. Required instruction, selected reminders, original failure classification, known effect, and compact recovery ids stay inline. An explicit `--out` follows a documented collision policy (reject unrelated existing files, reuse identical content) and the application's location rules. A write failure returns a bounded delivery error that preserves the operation's outcome and effect and never dumps the body. Reads of a spilled JSON file are suggested as byte ranges, because a minified envelope is one line and a line-ranged read reproduces the flood. Retention is explicit and off by default.

A spill at the default level is a signal that a command lacks a disclosure ladder; the contract suite counts those and ratchets the count down. Explicit `--full` or `--out` exports are expected to spill and are not counted.

### Gates and preflight

The lint pattern in `cli-tools-for-agents` (a read-only verb that reports what would refuse a transition, callable at any time, with parity to the gate) ships as a gates kit designed so parity holds by construction rather than by discipline.

- `defineGate({ transition: "propose", rules })`, where each rule is `{ id, severity: "blocks_propose" | "advisory", why?, check: (state) => Finding[] }`. Severity is typed from the transition name, so a finding cannot name a transition that does not exist, and rule ids are stable, greppable strings.
- A mutating command declares `gate: proposeGate`. The framework generates the preflight verb (`spec lint`, `source readiness`) that runs the same rule objects against current state and renders findings grouped by the transition they block, with an explicit clean verdict naming what is now unblocked. The mutating verb runs the identical rule objects before `commit` and refuses with the same findings plus each rule's `why`.
- Mutations that change gated state report `{ blockingBefore, blockingAfter }` in the envelope and as one text line; the framework computes both by running the gate around `commit` when the command declares it.
- Gate results carry both sides of the ledger (`satisfied` and `outstanding`, each with a reason), and the renderer prints both, so "6 pending" never reads as "6 lost".
- The rule catalogue is generated from the gate definitions into the skill document's marker block and an offline `<noun> rules` command, which is what kb's rule-catalogue generator and cctl's `lint-rules.ts` inventory do by hand today.

The other lint family in the skills, mechanical guardrails over the codebase (restricted imports, ratchets, declare-or-fail inventories), ships in the testing helpers rather than in the runtime.

### Startup overhead

Agents invoke a CLI dozens of times per session, so boot time multiplies. Command Center measured `cctl` at 0.7 s per invocation before its 2026-09-11 work, a seventh of a single-file test iteration. That work (commit `63bc81e3a`) found the failure modes a registry-derived design invites: every command module was imported eagerly, so the Zod schemas of all 193 commands were constructed to print a version string (546 ms of a 961 ms CPU profile); the logger imported the configuration loader to find its directory; and a help entry imported lint implementations just to publish a rule list. Dynamic imports per command and data-only rule inventories cut paired startup by 69 percent.

Idle measurements of the installed binary after that work (Node 24.16, sequential runs, three samples each):

| Command | Seconds |
|---|---|
| `node -e 0` (floor) | 0.07 |
| `cctl version`, `--help`, `spec --help`, `exit-codes` | 0.25 |
| `cctl workflow` (usage refusal) | 0.49 |
| `cctl spec` (usage refusal) | 0.60 |
| `cctl version` with Node's compile cache | 0.22 |

The remaining 0.18 s on the cheapest commands goes to compiling a 3.1 MB single-file bundle (`undici` 702 KB, Zod 477 KB, help entries 348 KB), Node internals pulled in by `undici` imported statically at the entry point, Zod initialization from five still-eager importers (`help-context.ts`, `memory.help.ts`, `checkpoint.help.ts`, `spec.help.ts`, and `shared.ts` via `conversation-target`), and top-level bundle evaluation. A group usage refusal costs 0.25 to 0.35 s more because the group module is imported before the refusal renders. kb's overhead is its launcher: `tsx` costs 0.39 s on an empty file, and kb's code adds little on top. These numbers double when taken alongside other work, which is why wall-clock never gates CI below.

Rules the framework builds in, each with a failing fixture:

1. **Handlers are lazy by construction.** `handler: () => import(...)` is the only way to attach behaviour; a contract test loads the registry, runs `--help`, and asserts no handler module evaluated.
2. **Leaf resolution and group refusals come from the routing table** before any import.
3. **Declarations are data only.** A restricted-imports rule on declaration modules enforces it; flags use the framework's own kinds; payload schemas live in handler modules.
4. **The kernel has no runtime dependencies and no heavy top-level builtins.** No Zod, no `undici`, no `node:crypto` or `node:http` at module top; hashing runs only on spill; the transport loads inside the host's `fetch` on first call. Help, version, and exit-codes run in the contract suite against a host whose fetch, logger, and context loader throw on touch.
5. **Loggers and context are lazy.** No filesystem or configuration resolution until the first write; guidance events emit only when a rule fires.
6. **Startup is guarded mechanically.** A checked-in per-package bundle-size ceiling that only goes down; an eager-module allowlist test that fails on a new static import in the `version` path; and a paired idle benchmark script whose medians go in the project's lessons file. Wall-clock is never a CI gate.
7. **A single-file bundle is the default distribution.** A `tsx` launcher is a 0.3 s floor before any code runs.
8. **The process adapter enables Node's compile cache** where the runtime offers it (Node 22.1 or later): about 30 ms here, an accelerator rather than a substitute for the rules above.

Help bodies are not the first target. Object-literal evaluation is cheap next to schema construction and transport initialization; measure before splitting help bodies into per-node lazy chunks.

Follow-ups in Command Center that need no framework: lazy-import `undici` inside the fetch host instead of at the entry point; replace the small Zod schema in `help-context.ts` with a hand-written check; move the four help entries and `shared.ts` off their schema imports through data-only inventories, as the perf commit already did for lint rules; answer group refusals from the registry before importing the group; enable the compile cache. Together those should put `version` and `--help` near the Node floor, to be confirmed by a paired idle measurement recorded in `PERFORMANCE.md`.

### First deliverable, roadmap, non-goals

The first deliverable: the executable registry with lazy handler wiring and typed `next` edges; strict parsing and dispatch from the routing table; generated usage and help; structured payload loading with Standard Schema validation inside handlers; the response and guidance pipeline; bounded query helpers and artifacts; optional help enrichment; the process adapter with drain-before-exit and opt-in compile cache; exit meanings as data with the offline `exit-codes` command; marker-based reference generation with `--check`; the startup guardrails (per-package bundle-size ratchet, eager-module allowlist, idle benchmark script); runner-neutral contract cases with deliberately invalid fixtures; the testing helpers; a concise add-a-command guide.

Roadmap kits, demand-driven, in this order: `doctor` (the exit-3 pointer names it and both applications have one), the HTTP response classifier for thin-client CLIs, job waiting, the gates kit described above, document-digest pinning (kb's skill-contract check), an issue-code inventory. A Claude or Codex plugin wrapper is a distribution step after the pilot.

Non-goals: prompts, TTY detection, colour, runtime plugin loading, shell completion, streaming export in the first release, orchestration, a logging backend, and document synchronization beyond marker blocks.

### Package and tests

One versioned package with subpath exports for runtime, pure guidance usable on a server, and testing. ESM plus TypeScript declarations, Node 20 or later, verified under both the Node-launched path kb uses and the Bun-bundled path Command Center uses. The kernel carries no runtime dependency, and a consuming CLI ships as one bundled file by default. The parser stays private to the package. Whether the code lives in this repository or its own is decided after the pilot.

Consumers test without running real commands through three seams: `runCli(argv, env, host)` is pure with every side effect behind the injected host; handler modules export plain functions taking `{ ctx, app }`; and declarations are data, so registry tests execute nothing. The `testing` subpath provides:

- `createTestHost({ files, fetch, now, env })`: in-memory filesystem, a fake clock with controllable `sleep`, captured stdout and stderr, an in-memory artifact directory, and a `fetch` supplied as a path-to-response map or as real in-process route handlers (cctl's `core.contract.test.ts` pattern). The host records every call, so tests assert side effects declaratively.
- `runForTest(cli, argvOrInvocation, { host, app })` returning `{ exitCode, stdout, stderr, envelope, artifacts, events }`, with the envelope parsed and typed under `--json`, and accepting a typed invocation object so tests use the same references as hints.
- `withApp(fakeApp)` to inject the application context directly. Tests that want a real app (kb's temporary SQLite knowledge base) keep it real and fake only the host; the helpers must not push consumers toward over-mocking the domain.
- `runHandler(handlerModule, { ctx: testContext({ args, flags, payload }), app })` for one handler in isolation, returning its result before rendering, and `renderForTest(result, { json })` when a test does care about text.
- `evaluateGuidance({ command, state, rules })` running steering and reminder rules as pure functions and returning texts plus rule ids.
- `contractTests(cli)` as `{ name, run }[]` plus the invalid fixtures that must fail, and `expectRegistryError(() => createCli(bad))` for declaration mistakes.
- Golden and parity helpers: `snapshotEnvelope(name, envelope, { volatile })`, `expectBounded(result, { bytes })`, `receiptProjection(data, allowlist)`.
- Architecture helpers: `sourceScan(dir)`, `ratchet(name, ceiling)`, `declareOrFail(inventory)`, so restricted-import, eager-module, and inventory tests need no re-invention of cctl's `testing/source-scan.ts`.

The contract suite covers offline help; both applications' parser edge-case matrices; schema issues surviving both renderers; instruction suppressing hint; conflict handling; reminder caps; equivalent disclosure between text and JSON with a declare-or-fail exception list; bounded artifact output with Unicode around the threshold; write failures retaining operation state; guidance surviving a spill; drain-before-exit in a real child process; help and version against a host whose fetch, logger, and context loader throw on touch; the eager-module allowlist for the `version` path; and the nineteen mechanisms above, each proved red. Consumers keep their tests for query results, gate parity, scope, and durable effects.

## 6. How to get there

1. **Write the behavioral contract.** Record the decisions above (arbitration, streams, parser semantics, artifact discrimination, exit-class declaration) so today's inconsistencies become decisions rather than frozen defaults.
2. **Extract from Command Center.** Its `help-types`, `help-registry`, `help-render`, `dispatch`, `exit-taxonomy`, `guidance-prefixes`, `disclosure`, and the parser and envelope halves of `shared.ts` were rebuilt in 2026-08 for one owner per policy and come with the contract suite. Generalize them against the contract, take kb's stronger declarations (typed value kinds, payload examples that parse, workflow groups, `--dry-run` scoping) into the kernel, keep the lazy handler imports that `core.ts` gained in the startup work as the kernel's only handler wiring, and run both parser regression matrices against the extracted parser. Nothing is grandfathered.
3. **Pilot in both applications.** One kb bounded query with a full-detail level plus one file-based mutation with a validate twin; one Command Center command carrying a stop instruction plus one query with dynamic help or spill. Prove that server-authored protocol survives the pipeline and that static help works without the server. Bundle kb to a single file for the pilot so its numbers are not the `tsx` launcher's; note that kb's current checkout does not run at all (`commander` is missing from `node_modules`) and needs a reinstall first. Take the paired idle startup measurement for both pilots and record it.
4. **Measure.** Can a command be added in one module without touching a parser, switch, renderer, or hand-maintained reference? How much consumer infrastructure was removed and how much adapter code replaced it? Do representative text and JSON invocations stay bounded and preserve status, instructions, omissions, and recovery facts? Do unknown flags, invalid payloads, disconnected help, and unwritable artifacts recover in one invocation? Across comparable real tasks, do agents make fewer malformed calls and read less unnecessary output? Quality first, then cost and speed.
5. **Migrate a family at a time.** Inventory each application's `--json` and `--help --json` consumers first (kb's doc generator and Command Center's scripts are known ones). Adopt kernel internals through adapters, then take each application's wire cutover as one reviewed change guarded by a shrink-only unmigrated-command list. No dual wire shapes at any point, and generated references update in the same change.

## 7. Decisions that are yours

1. **Replacing Commander in kb** is a rewrite of its router and program assembly. The design assumes a private registry-driven parser; it needs your approval before implementation.
2. **Each application's wire-format cutover** (envelope fields, exit classes) is a separately approved change after its consumers are inventoried.
3. **Package placement** (this repository or its own) is decided after the pilot proves consumption from both applications.

Two smaller ones the design preserves as your existing policy: Command Center's reads hard-fail on build skew while the skill's default is warn-only, and kb's decision to ship no reminder rules until an incident earns one stands as a valid default.
