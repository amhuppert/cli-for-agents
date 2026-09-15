# Add a command

Use the [local workspace pilot](../../examples/local-workspace/commands.ts) as a
working TypeScript example. Its handlers, schemas and store are exercised through
bundled executables in `tests/pilots/local.test.mjs`. The snippets below illustrate
those modules; retain their imports and declared types when adapting them.

## 1. Bind the family and declare inputs

Bind context keys, domain errors and globals once. A command chooses one literal
context key, or `none` for commands that need no acquired application.

```ts
import { commandsFor, defineErrors } from 'cli-for-agents';
import type { Workspace } from './app.js';

export const errors = defineErrors({
  NODE_MISSING: {
    exitClass: 'failed',
    description: 'The node does not exist in this workspace.',
  },
});
export const family = commandsFor<{ workspace: Workspace }>()({
  errors,
  globalFlags: {},
});
export const showSpec = {
  path: 'show', requires: 'workspace', effects: 'read',
  summary: 'Inspect a node.', description: 'Read a stable node handle.',
  args: [{ name: 'id', description: 'Node handle.', value: { kind: 'string' } }],
  flags: {},
} as const;
export const show = family.defineCommand(showSpec, {
  examples: [{ args: { id: 'n1' }, why: 'Inspect a saved node.' }],
  handler: async () => ({ default: (await import('./show.handler.js')).default }),
});
```

Export the inert spec so the handler can import its type without an inference
cycle. The explicit `default` snapshot also works with esbuild's generated module
namespaces. Every command needs a nonempty example inventory. Nested paths need
parent `defineGroup` declarations in `createCli.groups`.

Flags are optional unless `required: true`; positionals are required unless
`required: false` or defaulted. Defaults are present in handler inputs and may be
omitted by callers. Repeatable flags and a final variadic argument become arrays.
A string flag with `fileSource: { maxBytes: bytes(4096) }` gains an exclusive
`--name-file` alternative. A `kind: 'file'` input reads raw UTF-8. File inputs
accept `-` for stdin; only one selected source may consume stdin.

For remote globals, see [remote declarations](../../examples/remote-service/commands.mjs).
A secret flag needs an explicit `credential: { env: 'REMOTE_TOKEN' }` fallback to
allow runnable suggestions that omit it. Keep nonsecret server/workspace selection
in continuation references. Input names, help and parser acceptance all derive
from the spec; no second parser table is needed.

## 2. Implement the appropriate lazy module

| Command behavior | Declaration | Lazy module |
| --- | --- | --- |
| Plain read | `effects: 'read'` | `ReadHandler` with `run` and any declared level runners |
| Scalar write | `effects: 'write'`, no payload | `WriteHandler` with `run` returning a commit report |
| Structured read | Read plus `payload: { maxBytes }` | `payloadRead({ decode, run })`; no validation twin |
| Structured write | Write plus `payload: { maxBytes, validatePath }` | `mutation({ decode, prepare, commit })`; generated twin runs decode/prepare |

### Plain read

```ts
import type { ReadHandler } from 'cli-for-agents';
import type { Workspace } from './app.js';
import type { showSpec, errors } from './commands.js';

const handler: ReadHandler<typeof showSpec, Workspace, typeof errors.definitions> = {
  run: async ({ app, ctx }) => {
    const node = app.state.nodes.find(node => node.id === ctx.args.id);
    return node
      ? { ok: true, data: { id: node.id, title: node.title } }
      : { ok: false, error: ctx.errors.error('NODE_MISSING', { message: 'Node not found.' }) };
  },
};
export default handler;
```

Use `runner<Input, Data, Code>({ run, text })` for a custom pure primary text
renderer. `text` receives only the checked DTO, not app/process handles. Each
level can have a different DTO and renderer. The [show handler](../../examples/local-workspace/show.handler.ts)
provides the full typed example. Compare the actual text/JSON fields and values
in tests; accepting the same DTO does not prove equivalent disclosure.

### Scalar write

The [update handler](../../examples/local-workspace/update.handler.ts) checks the
node, persists the title, then reports the known effect:

```ts
return {
  effect: 'applied',
  recovery: recoveryFacts([{ kind: 'node', id: ctx.args.id }]),
  result: { ok: true, data: { id: ctx.args.id, title: ctx.flags.title } },
};
```

Import `recoveryFacts` from the root package. Return `not_applied` with a failure
when refusing before the write. Report only IDs the application actually knows.
Use `writeRunner` for a typed primary renderer. A thrown/unacknowledged mutation
gets bounded unknown-acknowledgment recovery; inspect state before retrying.

### Structured read

The [answer-check handler](../../examples/local-workspace/answer.handler.ts) shares
a lazy `StandardSchema<Claim>` decoder with the mutation:

```ts
export default payloadRead<typeof answerSpec, Workspace, Claim, typeof errors.definitions>({
  decode: claimSchema,
  run: async ({ payload, app }) => ({
    ok: true,
    data: { nodeId: payload.nodeId, matches: app.state.receipts.some(
      receipt => receipt.nodeId === payload.nodeId && receipt.text === payload.text,
    ) },
  }),
});
```

`payloadRead` comes from the root package; `claimSchema`, spec, errors and domain
types come from the linked example modules. The runtime reads the generated
`--file`, parses JSON and calls the decoder before context acquisition. Schema
implementations may be application dependencies; keep them in the lazy module.
Raw text ingestion uses a file-valued flag instead of a JSON payload declaration.

### Structured write

The [claim mutation](../../examples/local-workspace/apply.handler.ts) uses
`mutation<typeof applySpec, Workspace, Claim, typeof errors.definitions, {}, Claim>`.
Its decoder is `claimSchema`; `prepare` checks the node and returns
`{ ok: true, value: payload }` or a catalog failure. Its commit uses the framework's
invocation-scoped `prepared.value`, saves one receipt, and returns:

```ts
return {
  effect: 'applied',
  recovery: recoveryFacts([{ kind: 'receipt', id: receipt.id }]),
  result: {
    ok: true, data: { receipt },
    instruction: instruction('claim-saved', 'Inspect saved state before another mutation.'),
  },
};
```

The declaration names `claim validate`; that twin shares decoding and preparation
and cannot call commit. Execution rejects cross-command, cross-run, altered-hash
and consumed preparation tokens. Preparation purity still needs a domain test:
compare durable state before/after the twin, then observe the receipt with a fresh
reader after apply. The library cannot prove that application services are pure.

## 3. Wire context, doctor and output policy

[createWorkspaceCli](../../examples/local-workspace/cli.ts) supplies the family,
command list, parent groups and `doctor: invocation(doctor, {})`. The doctor's
spec uses `requires: 'none'`. Every CLI registers a runnable read doctor because
context acquisition can produce exit 3 even without domain connection codes.

A provider receives typed `globals`, `env`, `host` and `signal`, and returns
`{ ok: true, app, release? }` or `{ ok: false, error }`. Load application services
inside the provider. Optional release runs once after guidance collection and
artifact-policy resolution, including cancellation/failure paths.

```ts
output: {
  maxBytes: bytes(8192),
  artifacts: {
    resolve: input => ({
      directory: input.requires === 'workspace'
        ? `${input.app.root}/artifacts` : input.env['TMPDIR'] ?? '/tmp',
      forbiddenRoots: input.requires === 'workspace' ? [`${input.app.root}/data`] : [],
    }),
  },
},
```

The selected directory must already exist. Delivery retains an immutable host-only
policy after app release. `--out` obeys the same canonical containment and collision
rules. `binaryArtifact({ bytes, mediaType, basename, summary })` always writes an
artifact; declare `output: 'binary'`. See the [export handler](../../examples/local-workspace/export.handler.ts).
Use `page` on already-paged data with a read-only `invocation` reveal when cut.

## 4. Add guidance only where it applies

Handlers may return a `hint(invocation(command, input), action)` or
`instruction(ownerId, text)`. Instructions suppress hints. Reminder/steering rules
live in a lazy guidance module, run synchronously over explicit state and emit
candidates through `evaluateGuidance`. Rule sources require a firing sink at the
state authority; CLI guidance configuration requires a conflict sink.

The [remote guidance provider](../../examples/remote-service/guidance.mjs) decodes
server candidates with `decodeEvaluatedGuidance`. The runtime checks the current
command and references; response assembly arbitrates once with handler guidance.
Different required instructions yield a stop-and-report conflict. Transport
handles authentication, and the application owns durable event logging.

## 5. Verify and launch

Add a behavior test through the public runtime and run it red/green with its exact
registered `.test.mjs` path. Reuse [consumer contract cases](consumer-testkit.md)
with all seven domain-specific callbacks. Test required guidance and recovery
through artifact failure, plus actual projection parity where custom text exists.
Then run the full typecheck/build/test commands in [README](../../README.md).

Executables call `await main(cli)`; embedded callers use
`runCli(cli, { argv, env, signal, host? })` and receive bounded streams/exit code.
`main` owns process output, signals and draining. Build application bundles through
the registered pilot/distribution tests; keep the library unpublished and leave
consumer migration to a separate task.
