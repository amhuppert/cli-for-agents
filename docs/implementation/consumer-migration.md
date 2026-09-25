# Consumer migration guide: after cli-for-agents#3

This guide is for projects that consume cli-for-agents through a private yalc
snapshot. It covers the snapshot that follows `7fd35c1` (the book-ingest
retrospective, ticket cli-for-agents#3). Each section states what breaks, what
you must change, and what the change lets you delete. Source signatures in `src/`
are canonical; the [public contract](../design/public-contract.md) describes them.

**Status: consumer rollouts are separate work.** Nothing in this repository
updates an external consumer. Each consumer migrates in its own change, refreshes
its snapshot, and runs its own registered gates.

## Refresh the snapshot

In this repository, publish a freshly built package. The `prepack` hook deletes
`dist` and rebuilds it from source, so a stale build can no longer ship; a failed
build publishes nothing.

```sh
npm ci
npm exec -- yalc publish --private --scripts
```

In the consumer:

```sh
yalc update cli-for-agents   # or: yalc add cli-for-agents, the first time
npm install
```

Keep `--scripts` on publication and do not use bare `yalc push`; it defaults
scripts off and would copy whatever `dist` happens to exist. yalc 1.0.0-pre.53 is
the tested version.

## Breaking changes

Run the consumer's typecheck first. Items 1 and 2 are compile errors; the rest
change runtime output or test behavior and show up in the consumer's tests.

### 1. Structural `Host` implementations need `files.ensureDirectory`

Any object typed as `Host` that is not `nodeHost()` or `createTestHost()` must add:

```ts
readonly ensureDirectory: (path: string, signal: AbortSignal) => Promise<void>;
```

Semantics: create the directory and missing ancestors; succeed for an existing
directory; refuse an existing file or file ancestor without changing it; check
cancellation before and after. A wrapper host delegates to the wrapped host's
method. `HostCall` gained the kind `"ensureDirectory"`, so exhaustive switches over
recorded calls need a case.

### 2. Automatic spill is delivery metadata, not an issue

The artifact payload gained an optional `spill` field, required exactly when the
manifest reason is `stdout_budget_exceeded`:

```ts
payload: { kind: "artifact", summary, artifact, spill?: { format: "text" | "json"; inlineBytes: Bytes; maxBytes: Bytes } }
```

A successful spill no longer carries the issue
`KERNEL_OUTPUT: Optional response detail omitted inline; inspect artifact.`; text
prints one kernel line instead:

```text
notice: response 40213 bytes exceeds the 32768-byte budget; full response in artifact.
artifact: {"path": ...}
```

Change these in the consumer:

- Any duplicated envelope validator or type must accept `spill` on artifact
  payloads and require it for `stdout_budget_exceeded` manifests. `decodeEnvelope`
  already enforces this; prefer it to a copy.
- Assertions that a spilled success has a `KERNEL_OUTPUT` issue must assert
  `payload.spill` instead. `expectDisclosureParity` and the inherited
  `unicode-spill` case already do.
- Instruction text that tells agents a spill "is an error" or to look for
  `KERNEL_OUTPUT` after a large response should describe the `notice:` line.
- Handler text starting with `notice:` is neutralized to `| notice:` like the
  other reserved labels.

### 3. The artifact directory is created on demand

The kernel now creates the configured artifact directory (and missing ancestors)
the first time a response spills, uses `--out`, or exports binary data. A response
that fits inline does no artifact filesystem work and succeeds even when the policy
is missing, forbidden or unavailable. Consumer tests that expected a small command
to fail because the directory did not exist will now see it succeed.

Failures that still occur are explained. A spill with a forbidden directory,
a file where the directory should be, or a resolver that throws yields
`KERNEL_OUTPUT: Artifact delivery failed.` with a fixed-cause `why`, for example
`Artifact directory "/x" is inside a forbidden root.` or
`Artifact policy could not be collected.` Resolver exception text is never printed.

A caller-selected nested `--out` parent must still exist; only the configured root
is created.

### 4. `runForTest` throws on a contradictory explicit format flag

`runForTest(cli, ['doctor', '--json'], { format: 'text' })` used to return a
`KERNEL_USAGE` run with `Duplicate flag.`; it now throws
`TypeError("Input conflicts with test format.")` before any host or handler work.
Argv is never rewritten. Absent, malformed or duplicate `--json` flags are not a
conflict and run as written, so a test can inspect the resulting usage failure in
either format. Tests that relied on the old duplicate-flag failure need updating.

### 5. Text errors omit a repeated `why:` line

When `error.why` equals `error.message`, text output prints only the `error:`
line. JSON still carries `error.why`. Text snapshots of usage errors lose one line.

### 6. Root help no longer repeats the CLI name

Root text help and the generated reference print the name once and then the
optional `CliOptions.description`. Regenerate checked-in references; a drift check
will otherwise fail.

### 7. `expectDisclosureParity` error text changed

The helper throws one error listing every mismatched command with its
`text-only`, `unlisted JSON-only` and `stale exception fields`, in command-path
order, and every other message names the command, exception or field involved.
Tests that matched the old fixed sentences (for example
`Unlisted or stale disclosure extra fields.`) need new patterns.

## Simplifications you can now make

### Delete Standard Schema adapters

`StandardSchema` matches the official v1 types, including optional members that
admit explicit `undefined`. Under `exactOptionalPropertyTypes`, Zod 4 and other
conforming libraries assign directly:

```ts
// before
export default mutation({ decode: asStandard(z.object({ unit: z.string() })), ... });
// after
export default mutation({ decode: z.object({ unit: z.string() }), ... });
```

Remove adapters such as book-ingest's `src/config/standard-schema.ts`.

### Delete artifact-directory setup

Remove `mkdir` calls whose only purpose was the artifact directory, in
application bootstrap and in tests. Domain storage setup stays yours.

```ts
// before
await mkdir(`${root}/artifacts`, { recursive: true });
output: { artifacts: { directory: `${root}/artifacts`, forbiddenRoots: [`${root}/data`] } }
// after: return the paths only
output: { artifacts: { directory: `${root}/artifacts`, forbiddenRoots: [`${root}/data`] } }
```

Command tests no longer need `nodeHost()` with a temporary `TMPDIR` to make the
directory visible: `createTestHost()` works without a seeded artifact directory.
Use `createTestHost({ directories: ['/artifacts'] })` only to seed a specific
empty-directory state, and seed a file at that path only to test the refusal.

A resolver still runs once after the operation while the app is alive; the kernel
keeps a detached snapshot, so forbidden roots derived from app state survive
release. Resolver cleanup ordering is unchanged.

### Delete hand-declared preview commands and validate-then-write steering

A successful `prepare` may return a JSON-safe `preview` beside its opaque value:

```ts
prepare: async ({ payload, app }) => ({
  ok: true,
  value: plan,                                   // opaque, reaches only commit
  preview: { records: payload.items.length, planned: plan.operations.length },
})
```

The generated validation twin then returns
`{ valid: true, payloadHash, preview }`, and, when the invocation replays
faithfully, the hint `Apply the validated payload: <tool> <write> --file=<path> ...`.
The hint keeps arguments, globals, repeated flags and `--name-file` paths; it is
omitted, without failing the check, for stdin payloads, supplied secret flags,
nonempty passthrough or an oversized reference. Environment credential fallbacks
stay implicit and are never rendered.

So you can:

- Remove a hand-declared `payloadRead` such as book-ingest's `preview` when its
  only job was to show counts before the write; keep it if it is
  destination-independent while the write is destination-sensitive.
- Remove guidance rules that only said "after `X-check`, run `X`". Do this after
  a consumer test proves the generated hint includes the file and global flags you
  rely on. Keep rules with other content, such as retry guidance after a rolled-back
  write.
- Give `prepare` its own `hint` or `instruction` when the check needs domain
  advice; it appears on the check only and wins over the generated hint. A refusal's
  guidance still applies to check and write alike.

Type the preview with the trailing generic when you want it checked:
`mutation<Spec, App, Value, Errors, Globals, Payload, Preview>`. Omit `preview`
when there is nothing to show; `preview: undefined` fails with `KERNEL_CONTRACT`.

### Delete reference-only CLIs and manual size checks

`commandReference(cli, { commands: [...] })` and the same `commands` option on
`validateReferences`/`writeCommandReference` document selected command or
validation leaves, a selected write's twin, their ancestors and the root, with
child navigation filtered to the documented nodes. Roots, groups and unknown paths
throw. `writeCommandReference` returns `sizes`:

```ts
const result = await writeCommandReference(cli, { path, marker, mode: 'check', commands: ['read', 'search'], maxBytes: bytes(16384), signal });
if (result.ok) console.log(result.sizes);   // { generatedBytes, documentBytes, maxBytes }
```

A document over `maxBytes` throws a `RangeError` naming the exact byte counts;
content is never trimmed. So you can generate per-guide references from the one
real CLI instead of building a reference-only CLI per guide, and test each
document against your own budget with the reported sizes.

### Use `CliOptions.description`

```ts
createCli({ name: 'book', description: 'Ingest a book and answer questions about it.', ... })
```

The text appears once under the name in root help and the reference.

### Delete per-command parity diffs

`expectDisclosureParity` now reports every mismatched command and field itself, so
a consumer-side diff computed only to make failures readable can go. Keep in mind
what it checks: the field inventories you supply and the byte bounds, not the
meaning of prose. A text inventory derived by searching the text for JSON leaf
values cannot find a text-only fact; assert prose-only facts directly.

## Checklist by consumer

| Consumer | Required migration |
| --- | --- |
| book-ingest `src/config/standard-schema.ts` and handlers | Remove `asStandard`; use Zod directly. Add counts to start/submit preparation previews where useful; keep destination-independent `preview`. |
| book-ingest `src/cli/cli.ts` | Remove artifact-only Node mkdir and return paths/forbidden roots from the resolver; add root description. Keep SQLite integration services real. |
| book-ingest `src/cli/guidance.ts` | Remove validate-clean-submit only after generated hint tests prove file/global selection survives; retain rolled-back-write retry guidance. |
| book-ingest `src/instructions/references.ts` and surface matrix | Generate selected references from the real CLI; use size reports and actionable parity errors; test final instructions output against its own 16384-byte budget. |
| Command Center CLI integration | Update any structural Host implementations and duplicated envelope validators/types for spill metadata; remove artifact-only directory setup, verify resolver cleanup ordering, and retain cctl's application-specific approval/preflight rules and guidance. |

After migrating, run the consumer's registered typecheck and test gates. Do not
infer a consumer's migration from this repository's tests.
