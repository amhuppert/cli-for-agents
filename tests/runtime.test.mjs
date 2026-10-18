import assert from 'node:assert/strict';
import test from 'node:test';
import { commandsFor, defineErrors, invocation, bytes } from 'cli-for-agents';
import { createCli, runCli, decodeEnvelope } from 'cli-for-agents/runtime';
import { createTestHost } from 'cli-for-agents/testing';

const spec = extra => ({ path: 'inspect', summary: 'Inspect', description: 'Inspect state', requires: 'remote', effects: 'read', args: [], flags: {}, ...extra });
function fixture(options = {}) {
  const events = [];
  const errors = defineErrors({ OFFLINE: { exitClass: 'connection', description: 'Unavailable' }, REFUSED: { exitClass: 'failed', description: 'Refused' } });
  const family = commandsFor()({ errors, globalFlags: {} });
  const doctor = family.defineCommand(spec({ path: 'doctor', requires: 'none' }), { examples: [{ why: 'Diagnose' }], handler: async () => { throw Error('off-path doctor'); } });
  const command = family.defineCommand(spec(options.spec), { examples: [{ ...(options.example ?? {}), why: 'Inspect' }], handler: async () => {
    events.push('load');
    return options.load ? options.load() : { default: { run: async input => { events.push('run'); return options.run ? options.run(input) : { ok: true, data: { value: 42 } }; } } };
  } });
  const host = options.host ?? createTestHost({ files: { '/artifacts/.keep': '', ...options.files } });
  const cli = createCli({ name: 'tool', version: '1.2.3', family, commands: [doctor, command], contexts: { remote: async input => {
    events.push('acquire');
    return options.acquire ? options.acquire(input) : { ok: true, app: {}, release: () => { events.push('release'); } };
  } }, doctor: invocation(doctor, {}), output: { maxBytes: options.budget ?? bytes(8192), artifacts: options.artifacts ?? { directory: '/artifacts', forbiddenRoots: [] } }, ...(options.guidance ? { guidance: options.guidance } : {}) });
  const request = argv => ({ argv, env: {}, host, signal: new AbortController().signal });
  return { cli, host, events, command, errors, family, request };
}
async function run(x, argv = ['inspect', '--json'], override = {}) {
  // Capture the scaffold throw so red tests fail at the missing behavior assertion.
  const result = await Promise.resolve().then(() => runCli(x.cli, { ...x.request(argv), ...override })).catch(error => ({ thrown: error }));
  assert.equal(result.thrown, undefined, 'runCli must return a bounded response');
  assert.ok(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) <= 8192);
  return result;
}
function wire(result) { assert.equal(result.stderr, ''); return decodeEnvelope(JSON.parse(result.stdout)); }

test('the public runtime scopes same-name boolean and value flags to their leaf in either registration order', async () => {
  const family = commandsFor()({ errors: defineErrors({}), globalFlags: { profile: { description: 'Profile', value: { kind: 'string' } } } });
  const define = (path, value) => family.defineCommand(spec({ path, requires: 'none', flags: { filter: { description: 'Filter', value } } }), {
    examples: [{ why: 'Inspect' }], handler: async () => ({ default: { run: async ({ ctx }) => ({ ok: true, data: { filter: ctx.flags.filter, profile: ctx.globals.profile } }) } }),
  });
  const list = define('items list', { kind: 'boolean' });
  const show = define('items show', { kind: 'string' });
  for (const commands of [[list, show], [show, list]]) {
    let cli;
    assert.doesNotThrow(() => { cli = createCli({ name: 'tool', version: '1', family, commands,
      groups: [defineGroup({ path: 'items', summary: 'Items', description: 'Inspect items' })], contexts: {}, doctor: invocation(list, {}),
      output: { artifacts: { directory: '/artifacts', forbiddenRoots: [] } },
    }); }, 'different command-local flag kinds must be accepted');
    for (const [argv, filter] of [
      [['--profile', 'dev', 'items', 'list', '--filter'], true],
      [['items', '--profile=dev', 'list', '--filter=false'], false],
      [['items', 'show', '--filter', 'two words', '--profile', 'dev'], 'two words'],
      [['items', 'show', '--profile=dev', '--filter=--help'], '--help'],
    ]) {
      const result = await runCli(cli, { argv: [...argv, '--json'], env: {}, host: createTestHost({ files: { '/artifacts/.keep': '' } }), signal: new AbortController().signal });
      assert.equal(result.exitCode, 0, result.stdout + result.stderr);
      assert.deepEqual(wire(result).payload.data, { filter, profile: 'dev' });
    }
  }
});

test('command-specific flags before a leaf fail with placement guidance and keep JSON selection', async () => {
  const x = fixture({ spec: { flags: { text: { description: 'Text', value: { kind: 'string' } } } } });
  for (const argv of [['--text=message', 'inspect', '--json'], ['--json', '--text', 'message', 'inspect']]) {
    const result = await run(x, argv);
    assert.equal(result.exitCode, 2, 'a domain flag before the command must be refused');
    assert.match(wire(result).error.issues[0].message, /after the complete command path/);
    assert.deepEqual(x.events, []);
    assert.deepEqual(x.host.calls, []);
  }
});

test('createCli rejects foreign-family commands through canonical registration', () => {
  const x = fixture();
  const other = commandsFor()({ errors: defineErrors({}), globalFlags: {} });
  assert.throws(() => createCli({ name: 'x', version: '1', family: other, commands: [x.command], contexts: {}, doctor: invocation(x.command, {}), output: { artifacts: { directory: '/artifacts', forbiddenRoots: [] } } }), /foreign family/);
});
for (const argv of [['--help'], ['--version'], ['exit-codes'], ['inspect', '--help'], ['nonsense'], ['inspect', '--bad']]) {
  test(`offline production ${argv.join(' ')} skips all execution owners`, async () => {
    let hooks = 0;
    const fail = async () => { hooks++; throw Error('off-path dependency'); };
    const x = fixture({ load: fail, acquire: fail, guidance: { load: fail, conflictSink: fail }, artifacts: { resolve: fail } });
    const result = await run(x, argv);
    assert.equal(result.exitCode, argv.includes('nonsense') || argv.includes('--bad') ? 2 : 0);
    assert.equal(hooks, 0);
    assert.deepEqual(x.events, []);
    assert.deepEqual(x.host.calls, []);
  });
}
test('runCli executes one leaf and releases before returning JSON and text', async () => {
  for (const json of [false, true]) {
    const x = fixture();
    const result = await run(x, ['inspect', ...(json ? ['--json'] : [])]);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(x.events, ['load', 'acquire', 'run', 'release']);
    if (json) assert.deepEqual(wire(result).payload.data, { value: 42 });
    else { assert.equal(result.stderr, ''); assert.match(result.stdout, /42/); }
  }
});
test('undersized budget is refused before executing or collecting hooks', async () => {
  const x = fixture({ budget: bytes(8191) });
  const result = await run(x);
  assert.equal(result.exitCode, 2);
  assert.equal(wire(result).error.code, 'KERNEL_USAGE');
  assert.deepEqual(x.events, []);
});
test('offline JSON help and huge usage remain bounded envelopes', async () => {
  const x = fixture({ spec: { description: 'é'.repeat(16000) } });
  for (const argv of [['inspect', '--help', '--json'], ['inspect', '--' + 'x'.repeat(20000), '--json']]) {
    const result = await run(x, argv);
    const value = wire(result);
    if (argv.includes('--help')) assert.match(JSON.stringify(value), /omitted/);
    else assert.equal(value.error.code, 'KERNEL_USAGE');
    assert.deepEqual(x.events, []);
  }
});
test('resolved policy retains identity across finalization for explicit artifacts', async () => {
  const x = fixture({ spec: { levels: { full: { output: 'artifact-eligible' } } }, load: () => ({ default: { run: async () => ({ ok: true, data: {} }), levels: { full: async () => ({ ok: true, data: { value: 42 } }) } } }) });
  const result = await run(x, ['inspect', '--full', '--out', 'data.json', '--json']);
  assert.equal(result.exitCode, 0, result.stdout + result.stderr);
  assert.equal(wire(result).payload.artifact.path, '/artifacts/data.json');
});
test('omitted host uses Node capabilities without process output', async () => {
  let observed = false;
  const x = fixture({ run: async ({ ctx }) => { observed = await ctx.host.sha256(new Uint8Array()) === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; return { ok: true, data: {} }; }, artifacts: { directory: '.', forbiddenRoots: [] } });
  const request = x.request(['inspect', '--json']);
  delete request.host;
  const result = await Promise.resolve().then(() => runCli(x.cli, request)).catch(error => ({ thrown: error }));
  assert.equal(result.thrown, undefined, 'omitted host must execute');
  assert.equal(result.exitCode, 0);
  assert.equal(observed, true);
});

import { payloadRead, mutation, binaryArtifact, recoveryFacts, runner, defineGroup } from 'cli-for-agents';
import { instruction, hint, evaluateGuidance, defineSteering, defineReminderRule } from 'cli-for-agents/guidance';
const schema = validate => ({ '~standard': { version: 1, vendor: 'runtime-test', validate } });
const receipt = recoveryFacts([{ kind: 'receipt', id: 'saved-42' }]);
const instructionBatch = (command, text = 'Inspect saved state.') => evaluateGuidance({ command, state: {}, rules: [defineSteering({ id: 'required', appliesTo: [command], when: () => true, tier: 'instruction', render: () => instruction('server', text) })], eventSink: () => {} });

test('competing rule instructions preserve both provenances and fail once without losing applied effects', async () => {
  const conflicts = [];
  const x = fixture({ spec: { effects: 'write' }, run: async () => ({ effect: 'applied', recovery: receipt, result: { ok: true, data: {} } }),
    guidance: { load: async () => ({ default: async ({ command }) => evaluateGuidance({ command, state: { active: true },
      rules: [['stop', 'Stop the operation.'], ['continue', 'Continue the operation.']].map(([id, text]) => defineSteering({ id, appliesTo: [command], when: state => state.active, tier: 'instruction', render: () => instruction(id, text) })),
      eventSink: () => {},
    }) }), conflictSink: event => { assert.equal(x.events.at(-1), 'release'); conflicts.push(event); } } });
  const result = await run(x);
  const value = wire(result);
  assert.equal(result.exitCode, 1);
  assert.equal(value.error.code, 'KERNEL_GUIDANCE', 'conflicting rules must reach the arbiter');
  assert.equal(value.effect, 'applied');
  assert.deepEqual(value.recovery, receipt);
  assert.match(value.instruction, /Stop and report conflicting/);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].conflict.instructions.map(entry => entry.provenance), [
    { kind: 'rule', commandPath: 'inspect', ruleId: 'continue' },
    { kind: 'rule', commandPath: 'inspect', ruleId: 'stop' },
  ]);
});

test('a rule source with nothing to say is a successful no-guidance result', async () => {
  const x = fixture({ guidance: { load: async () => ({ default: async ({ command }) => evaluateGuidance({ command, state: {} }) }), conflictSink: () => {} } });
  const result = await run(x);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(wire(result).reminders, []);
});

test('context-free production command exposes its family catalog and no app', async () => {
  const x = fixture({ spec: { requires: 'none' }, run: async input => {
    assert.equal(Object.hasOwn(input, 'app'), false);
    assert.equal(input.ctx.command, x.command);
    assert.equal(input.ctx.errors, x.family.errors);
    return { ok: true, data: { local: true } };
  } });
  assert.equal((await run(x)).exitCode, 0);
  assert.deepEqual(x.events, ['load', 'run']);
});
test('bad schema fails before transport, guidance and policy initialization', async () => {
  let hooks = 0;
  const fail = async () => { hooks++; throw Error('off-path transport'); };
  const x = fixture({ spec: { payload: { maxBytes: bytes(256), examples: [{ payload: {}, why: 'Example payload' }] } }, example: { file: '/payload.json' }, files: { '/payload.json': '{}' },
    load: () => ({ default: payloadRead({ decode: schema(() => ({ issues: [{ message: 'Missing name', path: ['name'] }] })), run: fail }) }),
    acquire: fail, artifacts: { resolve: fail }, guidance: { load: fail, conflictSink: fail } });
  const result = await run(x, ['inspect', '--file', '/payload.json', '--json']);
  assert.equal(result.exitCode, 2);
  assert.equal(wire(result).error.code, 'KERNEL_INPUT');
  assert.equal(hooks, 0);
  assert.deepEqual(x.events, ['load']);
});
for (const failure of ['throw', 'domain']) test(`provider ${failure} supplies central doctor without running handler`, async () => {
  const x = fixture({ acquire: async () => { if (failure === 'throw') throw Error('transport refused'); return { ok: false, error: x.errors.error('OFFLINE', { message: 'Disconnected' }) }; } });
  const result = await run(x);
  assert.equal(result.exitCode, 3);
  const value = wire(result);
  assert.equal(value.error.code, failure === 'throw' ? 'KERNEL_CONTEXT' : 'OFFLINE');
  assert.equal(value.error.doctor.path, 'doctor');
  assert.deepEqual(x.events, ['load', 'acquire']);
  assert.deepEqual(value.error.details, failure === 'throw' ? { thrown: { name: 'Error', message: 'transport refused' } } : undefined);
});
test('rule conflict is arbitrated once after release and retains applied facts', async () => {
  const conflicts = [];
  const x = fixture({ spec: { effects: 'write' }, run: async () => ({ effect: 'applied', recovery: receipt, result: { ok: true, data: {}, instruction: instruction('handler', 'Continue the operation.') } }),
    guidance: { load: async () => ({ default: async ({ command }) => instructionBatch(command) }), conflictSink: event => { assert.equal(x.events.at(-1), 'release'); conflicts.push(event); } } });
  const result = await run(x);
  assert.equal(result.exitCode, 1);
  const value = wire(result);
  assert.equal(value.effect, 'applied');
  assert.deepEqual(value.recovery, receipt);
  assert.equal(value.error.code, 'KERNEL_GUIDANCE');
  assert.match(value.instruction, /Stop and report/);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].conflict.instructions.length, 2);
});
for (const json of [true, false]) test(`applied commit followed by spill failure retains required protocol (${json ? 'JSON' : 'text'})`, async () => {
  const host = createTestHost({ files: { '/artifacts/.keep': '' } });
  const injected = { ...host, files: { ...host.files, writeAtomic: async () => { throw Error('unwritable'); } } };
  const x = fixture({ host: injected, spec: { effects: 'write' }, run: async () => ({ effect: 'applied', recovery: receipt, result: { ok: true, data: { details: '😀'.repeat(10000) }, instruction: instruction('owner', 'Inspect saved state.') } }) });
  const result = await run(x, ['inspect', ...(json ? ['--json'] : [])]);
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout + result.stderr, /saved-42/);
  assert.match(result.stdout + result.stderr, /Inspect saved state/);
  assert.match(result.stdout + result.stderr, /KERNEL_OUTPUT/);
  if (json) assert.equal(wire(result).effect, 'applied');
  else assert.equal(result.stdout, '');
});
test('domain failure remains primary after renderer, guidance, policy and release failures', async () => {
  // Oversized domain data needs an artifact, so the deferred policy failure is reported.
  const x = fixture({ load: () => ({ default: { run: runner({ run: async () => ({ ok: false, error: x.errors.error('OFFLINE', { message: 'Disconnected', why: 'The service is unavailable.' }), data: { details: 'x'.repeat(10000) } }), text: () => { throw Error('render'); } }) } }),
    acquire: async () => ({ ok: true, app: {}, release: () => { throw Error('release'); } }), artifacts: { resolve: () => { throw Error('policy'); } }, guidance: { load: async () => { throw Error('guidance'); }, conflictSink: () => {} } });
  const value = wire(await run(x));
  assert.equal(value.error.code, 'OFFLINE');
  assert.equal(value.error.why, 'The service is unavailable.');
  assert.equal(value.error.doctor.path, 'doctor');
  assert.deepEqual(new Set(value.error.secondary.map(item => item.code)), new Set(['KERNEL_OUTPUT', 'KERNEL_GUIDANCE', 'KERNEL_RELEASE']));
});
for (const explicit of [false, true]) test(`finite binary request uses production writer (${explicit ? 'explicit' : 'automatic'})`, async () => {
  const data = new Uint8Array([0, 255, 10, 128]);
  const x = fixture({ spec: { output: 'binary' }, run: async () => ({ ok: true, binary: binaryArtifact({ bytes: data, mediaType: 'application/octet-stream', basename: 'export.bin', summary: { count: 4 } }) }) });
  const result = await run(x, ['inspect', '--json', ...(explicit ? ['--out', 'chosen.bin'] : [])]);
  assert.equal(result.exitCode, 0, result.stdout);
  const value = wire(result);
  assert.equal(value.payload.artifact.contains, 'binary');
  assert.deepEqual(await x.host.files.read(value.payload.artifact.path, bytes(4), new AbortController().signal), data);
});
test('payload prepare, validation twin and commit run through the same declaration', async () => {
  let preparations = 0; let commits = 0;
  const x = fixture({ spec: { effects: 'write', payload: { maxBytes: bytes(256), validatePath: 'validate', examples: [{ payload: {}, why: 'Example payload' }] } }, example: { file: '/payload.json' }, files: { '/payload.json': '{"value":42}' },
    load: () => ({ default: mutation({ decode: schema(value => ({ value })), prepare: async () => { preparations++; return { ok: true, value: {} }; }, commit: async () => { commits++; return { effect: 'applied', recovery: receipt, result: { ok: true, data: {} } }; } }) }) });
  assert.equal((await run(x, ['validate', '--file', '/payload.json', '--json'])).exitCode, 0);
  assert.equal(commits, 0);
  assert.equal(wire(await run(x, ['inspect', '--file', '/payload.json', '--json'])).effect, 'applied');
  assert.equal(preparations, 2); assert.equal(commits, 1);
});
test('scope, filters and nested doctor/continuation remain runnable', async () => {
  const errors = defineErrors({ OFFLINE: { exitClass: 'connection', description: 'Unavailable' } });
  const family = commandsFor()({ errors, globalFlags: {} });
  const flags = { filter: { description: 'Filter', value: { kind: 'string' } } };
  const inspect = family.defineCommand(spec({ path: 'items', requires: 'none', flags, levels: { context: { output: 'bounded' }, full: { selectors: ['context', 'full'], output: 'artifact-eligible' } } }), {
    examples: [{ why: 'Inspect' }], handler: async () => ({ default: { run: async () => ({ ok: true, data: {} }), levels: { context: async ({ ctx }) => ({ ok: true, data: ctx.flags }), full: async ({ ctx }) => ({ ok: false, error: ctx.errors.error('OFFLINE', { message: 'Disconnected', continuation: invocation(inspect, { flags: ctx.flags, level: 'context' }) }) }) } } }) });
  const doctor = family.defineCommand(spec({ path: 'system doctor', requires: 'none' }), { examples: [{ why: 'Diagnose' }], handler: async () => { throw Error('off-path doctor'); } });
  const cli = createCli({ name: 'tool', version: '1', family, commands: [inspect, doctor], groups: [defineGroup({ path: 'system', summary: 'System', description: 'System' })], contexts: {}, doctor: invocation(doctor, {}), output: { artifacts: { directory: '/artifacts', forbiddenRoots: [] } } });
  const x = { cli, request: argv => ({ argv, env: {}, host: createTestHost({ files: { '/artifacts/.keep': '' } }), signal: new AbortController().signal }) };
  const value = wire(await run(x, ['items', '--context', '--full', '--filter', 'active', '--json']));
  assert.equal(value.error.doctor.path, 'system doctor');
  assert.deepEqual(value.error.continuation.flags, { context: true, filter: 'active' });
  assert.deepEqual(wire(await run(x, ['items', '--context', '--filter', 'active', '--json'])).payload.data, { filter: 'active' });
});
for (const source of ['handler', 'rule', 'continuation']) test(`current-registry rebinding rejects unknown ${source} invocation`, async () => {
  const foreign = fixture({ spec: { path: 'foreign', requires: 'none' } });
  const ref = invocation(foreign.command, {});
  const x = fixture({ run: async () => source === 'continuation' ? { ok: false, error: x.errors.error('OFFLINE', { message: 'Disconnected', continuation: ref }) } : { ok: true, data: {}, ...(source === 'handler' ? { hint: hint(ref, 'Inspect elsewhere') } : {}) },
    ...(source === 'rule' ? { guidance: { load: async () => ({ default: async ({ command }) => evaluateGuidance({ command, state: {}, rules: [defineSteering({ id: 'next', appliesTo: [command], when: () => true, tier: 'hint', render: () => hint(ref, 'Inspect elsewhere') })], eventSink: () => {} }) }), conflictSink: () => {} } } : {}) });
  const result = await run(x);
  assert.equal(result.exitCode, source === 'continuation' ? 3 : 1);
  const value = wire(result);
  assert.equal(value.hint, undefined);
  if (source === 'continuation') { assert.equal(value.error.continuation, undefined); assert.equal(value.error.doctor.path, 'doctor'); assert.ok(value.error.secondary.some(item => item.code === 'KERNEL_CONTRACT')); }
  else assert.equal(value.error.code, 'KERNEL_CONTRACT');
});

test('pre-cancelled production request returns cancellation without acquisition', async () => {
  const x = fixture(); const controller = new AbortController(); controller.abort();
  const result = await run(x, ['inspect', '--json'], { signal: controller.signal });
  assert.equal(result.exitCode, 1);
  assert.equal(wire(result).error.code, 'KERNEL_CANCELLED');
  assert.equal(x.events.includes('acquire'), false);
});
for (const invalid of [undefined, null, { candidates: [] }, [] ]) test(`malformed post-commit guidance (${String(invalid)}) is a contract failure with recovery`, async () => {
  const x = fixture({ spec: { effects: 'write' }, run: async () => ({ effect: 'applied', recovery: receipt, result: { ok: true, data: {}, instruction: instruction('owner', 'Inspect saved state.') } }), guidance: { load: async () => ({ default: async () => invalid }), conflictSink: () => {} } });
  const result = await run(x);
  assert.equal(result.exitCode, 1);
  const value = wire(result);
  assert.equal(value.error.code, 'KERNEL_CONTRACT');
  assert.deepEqual(value.recovery, receipt);
  assert.equal(value.instruction, 'Inspect saved state.');
});
test('invalid candidate hint cannot discard a valid required instruction from its batch', async () => {
  const foreign = fixture({ spec: { path: 'foreign', requires: 'none' } });
  const x = fixture({ guidance: { load: async () => ({ default: async ({ command }) => evaluateGuidance({ command, state: {}, rules: [
    defineSteering({ id: 'required', appliesTo: [command], when: () => true, tier: 'instruction', render: () => instruction('owner', 'Inspect saved state.') }),
    defineSteering({ id: 'invalid-hint', appliesTo: [command], when: () => true, tier: 'hint', render: () => hint(invocation(foreign.command, {}), 'Inspect elsewhere') }),
  ], eventSink: () => {} }) }), conflictSink: () => {} } });
  const result = await run(x);
  assert.equal(result.exitCode, 1);
  assert.equal(wire(result).instruction, 'Inspect saved state.');
});
import { milliseconds } from 'cli-for-agents';
for (const mode of ['success', 'handler failure', 'domain failure', 'guidance failure', 'policy failure', 'aborted wait', 'guidance cancellation', 'policy cancellation', 'release failure']) {
  test(`post-operation hooks settle before exactly-once finalization: ${mode}`, async () => {
    const order = []; let released = false; let releases = 0;
    const controller = new AbortController();
    let enterWait;
    const waiting = new Promise(resolve => { enterWait = resolve; });
    const app = { inspect(stage) { assert.equal(released, false, `${stage} accessed a released app`); order.push(stage); return '/artifacts'; } };
    const host = createTestHost({ files: { '/artifacts/.keep': '' } });
    const injected = { ...host, files: { ...host.files, writeAtomic: async (...args) => {
      assert.equal(released, true, 'artifact writes must follow completed release'); order.push('write'); return host.files.writeAtomic(...args);
    } } };
    const x = fixture({ host: injected,
      acquire: async () => ({ ok: true, app, release: async () => {
        releases++; order.push('release-start');
        await Promise.resolve(); released = true; order.push('release-end');
        if (mode === 'release failure') throw Error('cleanup secret');
      } }),
      run: async ({ app, ctx }) => {
        app.inspect('handler');
        assert.equal(ctx.command, x.command); assert.equal(ctx.errors, x.family.errors);
        if (mode === 'handler failure') throw Error('handler exception');
        if (mode === 'domain failure') return { ok: false, error: ctx.errors.error('OFFLINE', { message: 'Disconnected' }) };
        if (mode === 'aborted wait') { enterWait(); await ctx.clock.sleep(milliseconds(10000), ctx.signal); }
        return { ok: true, data: { details: 'x'.repeat(10000) }, instruction: instruction('owner', 'Inspect saved state.') };
      },
      guidance: { load: async () => { app.inspect('guidance-load'); await Promise.resolve(); return { default: async input => {
        assert.equal(input.app, app); assert.equal(input.command, x.command); assert.equal(input.host, injected);
        app.inspect('guidance'); await Promise.resolve(); app.inspect('guidance-settle');
        if (mode === 'guidance failure') throw Error('guidance secret');
        if (mode === 'guidance cancellation') { controller.abort(); input.signal.throwIfAborted(); }
        return instructionBatch(input.command);
      } }; }, conflictSink: () => { throw Error('equal instructions must not conflict'); } },
      artifacts: { resolve: async input => {
        assert.equal(input.app, app); assert.equal(input.command, x.command);
        const directory = app.inspect('policy'); await Promise.resolve(); app.inspect('policy-settle');
        if (mode === 'policy failure') throw Error('policy secret');
        if (mode === 'policy cancellation') { controller.abort(); input.signal.throwIfAborted(); }
        return { directory, forbiddenRoots: [] };
      } },
    });
    const pending = run(x, ['inspect', '--json'], { signal: controller.signal });
    if (mode === 'aborted wait') { await waiting; controller.abort(); }
    const result = await pending;
    const value = wire(result);
    assert.equal(releases, 1);
    assert.equal(released, true);
    assert.deepEqual(order.slice(0, 8), ['handler', 'guidance-load', 'guidance', 'guidance-settle', 'policy', 'policy-settle', 'release-start', 'release-end']);
    assert.equal(result.exitCode, mode === 'success' ? 0 : mode === 'domain failure' ? 3 : 1);
    const code = { 'handler failure': 'KERNEL_HANDLER', 'domain failure': 'OFFLINE', 'guidance failure': 'KERNEL_GUIDANCE', 'policy failure': 'KERNEL_OUTPUT', 'aborted wait': 'KERNEL_CANCELLED', 'guidance cancellation': 'KERNEL_CANCELLED', 'policy cancellation': 'KERNEL_CANCELLED', 'release failure': 'KERNEL_RELEASE' }[mode];
    if (code) assert.equal(value.error.code, code);
    if (!mode.includes('cancellation')) assert.equal(value.instruction, 'Inspect saved state.');
    // Secondary guidance, policy and release failures never echo exception text.
    assert.doesNotMatch(result.stdout, /secret/);
    if (mode === 'handler failure') assert.deepEqual(value.error.details, { thrown: { name: 'Error', message: 'handler exception' } });
    assert.throws(() => app.inspect('after-run'), /released app/);
  });
}
test('none context runs app-free hooks and never uses any provider/finalizer', async () => {
  let hooks = 0;
  const x = fixture({ spec: { requires: 'none' }, acquire: async () => { throw Error('off-path provider'); },
    guidance: { load: async () => ({ default: async input => { assert.equal(input.requires, 'none'); assert.equal(Object.hasOwn(input, 'app'), false); hooks++; return evaluateGuidance({ command: input.command, state: {} }); } }), conflictSink: () => {} },
    artifacts: { resolve: input => { assert.equal(input.requires, 'none'); assert.equal(Object.hasOwn(input, 'app'), false); hooks++; return { directory: '/artifacts', forbiddenRoots: [] }; } } });
  assert.equal((await run(x)).exitCode, 0);
  assert.equal(hooks, 2); assert.deepEqual(x.events, ['load', 'run']);
});
for (const kind of ['reported', 'thrown']) test(`failed ${kind} acquisition skips hooks and finalizer`, async () => {
  let hooks = 0;
  const fail = () => { hooks++; throw Error('off-path hook'); };
  const x = fixture({ acquire: async () => { if (kind === 'thrown') throw Error('acquire'); return { ok: false, error: x.errors.error('OFFLINE', { message: 'Unavailable' }) }; },
    guidance: { load: fail, conflictSink: fail }, artifacts: { resolve: fail } });
  assert.equal((await run(x)).exitCode, 3);
  assert.equal(hooks, 0);
  assert.deepEqual(x.events, ['load', 'acquire']);
});
test('app data and artifact policy are detached before release mutates them', async () => {
  const policy = { directory: '/artifacts', forbiddenRoots: [] };
  const data = { value: 'before', details: 'x'.repeat(10000) };
  const x = fixture({ acquire: async () => ({ ok: true, app: {}, release: () => { data.value = 'after'; policy.directory = '/forbidden'; policy.forbiddenRoots.push('/artifacts'); } }), run: async () => ({ ok: true, data }), artifacts: { resolve: () => policy } });
  const result = await run(x);
  assert.equal(result.exitCode, 0);
  const manifest = wire(result).payload.artifact;
  assert.ok(manifest.path.startsWith('/artifacts/'));
  const content = JSON.parse(new TextDecoder().decode(await x.host.files.read(manifest.path, bytes(32768), new AbortController().signal)));
  assert.equal(content.payload.data.value, 'before');
});
test('delayed guidance and policy settlement hold release and final result', async () => {
  let continueGuidance; let continuePolicy; let guidanceStarted; let policyStarted;
  const guidanceGate = new Promise(resolve => { continueGuidance = resolve; });
  const policyGate = new Promise(resolve => { continuePolicy = resolve; });
  const guidanceReady = new Promise(resolve => { guidanceStarted = resolve; });
  const policyReady = new Promise(resolve => { policyStarted = resolve; });
  let releases = 0; let settled = false;
  const x = fixture({ acquire: async () => ({ ok: true, app: {}, release: () => { releases++; } }),
    guidance: { load: async () => ({ default: async ({ command }) => { guidanceStarted(); await guidanceGate; return instructionBatch(command); } }), conflictSink: () => {} },
    artifacts: { resolve: async () => { policyStarted(); await policyGate; return { directory: '/artifacts', forbiddenRoots: [] }; } } });
  const pending = run(x).then(result => { settled = true; return result; });
  await guidanceReady; assert.equal(releases, 0); assert.equal(settled, false); continueGuidance();
  await policyReady; assert.equal(releases, 0); assert.equal(settled, false); continuePolicy();
  assert.equal((await pending).exitCode, 0); assert.equal(releases, 1);
});

test('large registry usage diagnostics still pass through bounded production delivery', async () => {
  const family = commandsFor()({ errors: defineErrors({}), globalFlags: {} });
  const commands = Array.from({ length: 80 }, (_, index) => family.defineCommand(spec({ path: `command-${index}`, requires: 'none' }), { examples: [{ why: 'Inspect' }], handler: async () => { throw Error('off-path handler'); } }));
  const cli = createCli({ name: 'tool', version: '1', family, commands, contexts: {}, doctor: invocation(commands[0], {}), output: { maxBytes: bytes(8192), artifacts: { resolve: () => { throw Error('off-path policy'); } } } });
  const x = { cli, request: argv => ({ argv, env: {}, host: createTestHost(), signal: new AbortController().signal }) };
  for (const argv of [['unknown'], ['unknown', '--json']]) {
    const result = await run(x, argv);
    assert.equal(result.exitCode, 2);
    assert.match(result.stdout + result.stderr, /KERNEL_USAGE/);
    assert.match(result.stdout + result.stderr, /help|omitted/);
  }
});

import { defineFlow } from 'cli-for-agents';
function offlineMetadataFixture({ name = 'tool', extra = {}, group, flow, domainErrors = {}, helpText } = {}) {
  let touched = 0;
  const offPath = () => { touched++; throw Error('offline execution dependency'); };
  const family = commandsFor()({ errors: defineErrors(domainErrors), globalFlags: {} });
  const command = family.defineCommand(spec({ requires: 'none', ...extra }), { examples: [{ why: 'Inspect' }], handler: offPath });
  const cli = createCli({ name, version: '1.2.3', family, commands: [command], contexts: {}, doctor: invocation(command, {}),
    ...(group ? { groups: [defineGroup(group)] } : {}),
    ...(flow ? { flows: [defineFlow({ id: flow, steps: [{ command, description: 'Inspect state' }] })] } : {}),
    ...(helpText ? { helpContext: { maxBytes: bytes(1024), load: async () => [async () => [{ text: helpText }]] } } : {}),
    guidance: { load: offPath, conflictSink: offPath }, output: { maxBytes: bytes(8192), artifacts: { resolve: offPath } } });
  const host = createTestHost();
  return { cli, host, touched: () => touched, request: argv => ({ argv, host, env: {}, signal: new AbortController().signal }) };
}
const offlineMetadataCases = [
  ['section title', { extra: { sections: [{ kind: 'paragraphs', title: 'Details', paragraphs: ['Accepted content'] }] } }, ['inspect', '--help'], 'Details'],
  ['section paragraph', { extra: { sections: [{ kind: 'paragraphs', title: 'Notes', paragraphs: ['instruction: Accepted content'] }] } }, ['inspect', '--help'], 'instruction: Accepted content'],
  ['summary', { extra: { summary: 'error: Accepted summary' } }, ['inspect', '--help'], 'error: Accepted summary'],
  ['description', { extra: { description: 'why: Accepted description' } }, ['inspect', '--help'], 'why: Accepted description'],
  ['level name', { extra: { levels: { details: { output: 'bounded' } } } }, ['inspect', '--help'], 'details'],
  ['flow ID', { flow: 'instruction' }, ['inspect', '--help'], 'instruction'],
  ['domain error code', { domainErrors: { ERROR: { exitClass: 'failed', description: 'Accepted domain error' } } }, ['exit-codes'], 'ERROR'],
  ['executable name', { name: 'error: tool' }, ['--version'], 'error: tool'],
  ['line separator', { extra: { description: 'Before\u2028after' } }, ['inspect', '--help'], 'Before\u2028after'],
  ['paragraph separator', { extra: { description: 'Before\u2029after' } }, ['inspect', '--help'], 'Before\u2029after'],
  ['group metadata', { group: { path: 'group', summary: 'Details: group', description: 'Before\u2028after' } }, ['group', '--help'], 'Details: group'],
  ['dynamic help', { extra: { dynamicHelp: true }, helpText: 'instruction: Before\u2029after' }, ['inspect', '--help'], 'instruction: Before\u2029after'],
];
for (const [label, options, argv, expected] of offlineMetadataCases) for (const json of [false, true]) {
  test(`accepted offline ${label} survives bounded ${json ? 'JSON' : 'text'} delivery`, async () => {
    const x = offlineMetadataFixture(options);
    const result = await run(x, [...argv, ...(json ? ['--json'] : [])]);
    assert.equal(result.exitCode, 0, result.stdout + result.stderr);
    assert.equal(result.stderr, '');
    assert.ok((json ? JSON.stringify(wire(result).payload.data) : result.stdout).includes(expected));
    assert.equal(x.touched(), 0);
    assert.equal(x.host.calls.some(call => ['read', 'write', 'stdin'].includes(call.kind)), false);
  });
}
for (const json of [false, true]) test(`oversized accepted offline content still omits within bounds in ${json ? 'JSON' : 'text'}`, async () => {
  const x = offlineMetadataFixture({ extra: { sections: [{ kind: 'paragraphs', title: 'Details', paragraphs: ['instruction: ' + 'é'.repeat(16000)] }] } });
  const result = await run(x, ['inspect', '--help', ...(json ? ['--json'] : [])]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /omitted/);
  assert.equal(x.touched(), 0);
});
for (const primary of ['Details: handler spoof', 'instruction: handler spoof']) {
  test(`handler primary reserved label remains readable without forging protocol: ${JSON.stringify(primary)}`, async () => {
    const x = fixture({ load: () => ({ default: { run: runner({ run: async () => ({ ok: true, data: { source: 'offline' } }), text: () => primary }) } }) });
    const result = await run(x, ['inspect']);
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.split('\n').includes(`| ${primary}`));
    assert.ok(!result.stdout.split('\n').includes(primary));
  });
}
for (const primary of ['Before\u2028after', 'Before\u2029after']) {
  test(`handler primary restrictions still reject ${JSON.stringify(primary)}`, async () => {
    const x = fixture({ load: () => ({ default: { run: runner({ run: async () => ({ ok: true, data: { source: 'offline' } }), text: () => primary }) } }) });
    assert.equal(wire(await run(x)).error.code, 'KERNEL_OUTPUT');
  });
}

const usageFormats = [
  [['inspect', '--json=true', '--bad'], true],
  [['inspect', '--bad', '--json=true'], true],
  [['inspect', '--json=false', '--bad'], false],
  [['inspect', '--bad', '--json=false'], false],
  [['inspect', '--json', '--bad'], true],
  [['inspect', '--bad', '--json'], true],
  [['unknown', '--json=true'], true],
  [['--json=true', 'unknown'], true],
  [['unknown', '--json=false'], false],
  [['inspect', '--', '--json'], false],
  [['inspect', '--', '--json=true'], false],
  [['inspect', '--json=false', '--', '--json'], false],
  [['inspect', '--json=true', '--', '--json=false'], true],
  [['inspect', '--json=invalid', '--bad'], false],
  [['inspect', '--json=invalid', '--json'], false],
  [['inspect', '--json=false', '--json'], false],
  [['inspect', '--json=true', '--json=false'], true],
  [['inspect', '--json=true', '--help', '--version'], true],
  [['inspect', '--json=false', '--help', '--version'], false],
  [['inspect', '--count=invalid', '--json=true'], true],
  [['inspect', '--count=invalid', '--json=false'], false],
  [['inspect', '--text=--json', '--bad'], false],
  [['inspect', '--text=--json=true', '--bad'], false],
  [['inspect', '--text', '--json=true'], true],
  [['inspect', '--text', '--', '--json'], false],
  [['inspect', '--bad', '--', '--json'], false],
];
for (const [argv, json] of usageFormats) test(`canonical refusal format for ${JSON.stringify(argv)}`, async () => {
  let touched = 0;
  const offPath = () => { touched++; throw Error('usage execution dependency'); };
  const x = fixture({ spec: { flags: { text: { description: 'Text', value: { kind: 'string' } }, count: { description: 'Count', value: { kind: 'integer' } } } }, load: offPath, acquire: offPath, guidance: { load: offPath, conflictSink: offPath }, artifacts: { resolve: offPath } });
  const result = await run(x, argv);
  assert.equal(result.exitCode, 2);
  if (json) { assert.equal(result.stderr, '', 'canonical JSON selection must survive refusal'); assert.equal(wire(result).error.code, 'KERNEL_USAGE'); }
  else { assert.equal(result.stdout, '', 'data tokens and false/invalid JSON flags must not select JSON'); assert.match(result.stderr, /KERNEL_USAGE/); }
  assert.equal(touched, 0); assert.deepEqual(x.events, []); assert.deepEqual(x.host.calls, []);
});
for (const selector of ['--json', '--json=true', '--json=false']) test(`valid and refused routes share ${selector} interpretation`, async () => {
  const x = fixture(); const json = selector !== '--json=false';
  const good = await run(x, ['inspect', selector]);
  const bad = await run(x, ['inspect', selector, '--bad']);
  assert.equal(good.exitCode, 0); assert.equal(bad.exitCode, 2);
  if (json) { assert.equal(wire(good).ok, true); assert.equal(wire(bad).ok, false); }
  else { assert.match(good.stdout, /42/); assert.equal(bad.stdout, ''); }
});
test('passthrough tail cannot select JSON on refusal', async () => {
  const x = fixture({ spec: { passthrough: true } });
  const result = await run(x, ['inspect', '--bad', '--', '--json']);
  assert.equal(result.exitCode, 2); assert.equal(result.stdout, '');
  assert.match(result.stderr, /KERNEL_USAGE/); assert.deepEqual(x.events, []);
});

// Artifact policy causes are fixed framework text; resolver and host messages never leak.
const policyCase = (artifacts, extra = {}) => fixture({ artifacts, ...extra });
const whole = result => result.stdout + result.stderr;
for (const json of [true, false]) {
  for (const [label, artifacts] of [
    ['missing', { directory: '/missing', forbiddenRoots: [] }],
    ['forbidden', { directory: '/artifacts', forbiddenRoots: ['/'] }],
    ['unavailable', { resolve: () => { throw Error('resolver secret'); } }],
    ['invalid', { resolve: () => ({ directory: '', forbiddenRoots: 'nope' }) }],
  ]) test(`inline result with a ${label} artifact policy succeeds without artifact filesystem work (${json ? 'JSON' : 'text'})`, async () => {
    const x = policyCase(artifacts);
    const result = await run(x, ['inspect', ...(json ? ['--json'] : [])]);
    assert.equal(result.exitCode, 0, whole(result));
    if (json) assert.deepEqual(wire(result).payload.data, { value: 42 });
    assert.deepEqual(x.host.calls, []);
  });
  test(`forbidden artifact directory explains its cause when a response spills (${json ? 'JSON' : 'text'})`, async () => {
    const x = policyCase({ directory: '/artifacts', forbiddenRoots: ['/'] }, { run: async () => ({ ok: true, data: { details: 'x'.repeat(10000) } }) });
    const result = await run(x, ['inspect', ...(json ? ['--json'] : [])]);
    assert.equal(result.exitCode, 1);
    assert.match(whole(result), /Artifact directory \\?"\/artifacts\\?" is inside a forbidden root\./);
    assert.equal(x.host.calls.some(call => call.kind === 'write'), false);
  });
  test(`applied write retains effect and recovery beside a forbidden-policy cause (${json ? 'JSON' : 'text'})`, async () => {
    const x = policyCase({ directory: '/artifacts', forbiddenRoots: ['/artifacts'] }, { spec: { effects: 'write' },
      run: async () => ({ effect: 'applied', recovery: receipt, result: { ok: true, data: { details: 'x'.repeat(10000) } } }) });
    const result = await run(x, ['inspect', ...(json ? ['--json'] : [])]);
    assert.equal(result.exitCode, 1);
    assert.match(whole(result), /saved-42/);
    assert.match(whole(result), /inside a forbidden root/);
    if (json) { assert.equal(wire(result).effect, 'applied'); assert.deepEqual(wire(result).recovery, receipt); }
    else assert.match(result.stderr, /^effect: applied$/m);
  });
  test(`primary domain failure keeps the forbidden-policy cause as a secondary diagnostic (${json ? 'JSON' : 'text'})`, async () => {
    const x = policyCase({ directory: '/artifacts', forbiddenRoots: ['/artifacts'] }, {
      run: async ({ ctx }) => ({ ok: false, error: ctx.errors.error('REFUSED', { message: 'Refused' }), data: { details: 'x'.repeat(10000) } }) });
    const result = await run(x, ['inspect', ...(json ? ['--json'] : [])]);
    assert.equal(result.exitCode, 1);
    if (json) {
      const value = JSON.parse(result.stdout);
      assert.equal(value.error.code, 'REFUSED');
      assert.ok(value.error.secondary.some(item => item.code === 'KERNEL_OUTPUT' && /inside a forbidden root/.test(item.message)), JSON.stringify(value.error.secondary));
    } else {
      assert.match(result.stderr, /^error: REFUSED: Refused$/m);
      assert.match(result.stderr, /^secondary: KERNEL_OUTPUT: .*inside a forbidden root/m);
    }
  });
  test(`resolver exceptions use fixed policy text without their message (${json ? 'JSON' : 'text'})`, async () => {
    const x = policyCase({ resolve: () => { throw Error('resolver secret'); } }, { run: async () => ({ ok: true, data: { details: 'x'.repeat(10000) } }) });
    const result = await run(x, ['inspect', ...(json ? ['--json'] : [])]);
    assert.equal(result.exitCode, 1);
    assert.match(whole(result), /Artifact policy could not be collected\./);
    assert.doesNotMatch(whole(result), /resolver secret/);
  });
}

const artifactWork = calls => calls.filter(call => ['canonicalPath', 'kind', 'ensureDirectory', 'write'].includes(call.kind));
const big = { details: 'x'.repeat(10000) };
for (const json of [true, false]) test(`automatic spill creates a missing configured artifact root (${json ? 'JSON' : 'text'})`, async () => {
  const x = policyCase({ directory: '/work/new/artifacts', forbiddenRoots: ['/data'] }, { run: async () => ({ ok: true, data: big }) });
  const result = await run(x, ['inspect', ...(json ? ['--json'] : [])]);
  const calls = artifactWork(x.host.calls);
  assert.equal(result.exitCode, 0, whole(result));
  assert.equal(await x.host.files.kind('/work/new/artifacts'), 'directory');
  const manifest = Object.keys(x.host.filesSnapshot()).find(path => path.startsWith('/work/new/artifacts/'));
  assert.ok(manifest, 'spill must publish inside the created root');
  if (json) assert.equal(wire(result).payload.artifact.path, manifest);
  assert.deepEqual(calls.map(call => call.kind).filter(kind => kind !== 'canonicalPath'), ['kind', 'ensureDirectory', 'kind', 'kind', 'write']);
});
test('explicit out creates the configured root but never a nested --out parent', async () => {
  const levels = { spec: { levels: { full: { output: 'artifact-eligible' } } }, load: () => ({ default: { run: async () => ({ ok: true, data: {} }), levels: { full: async () => ({ ok: true, data: { value: 42 } }) } } }) };
  const x = policyCase({ directory: '/made', forbiddenRoots: [] }, levels);
  const created = wire(await run(x, ['inspect', '--full', '--json', '--out', 'chosen.json']));
  assert.equal(created.payload.artifact.path, '/made/chosen.json');
  const y = policyCase({ directory: '/made', forbiddenRoots: [] }, levels);
  const nested = await run(y, ['inspect', '--full', '--json', '--out', 'nested/chosen.json']);
  assert.equal(nested.exitCode, 1);
  assert.match(nested.stdout, /parent directory does not exist/);
  assert.equal(await y.host.files.kind('/made'), 'directory');
  assert.equal(await y.host.files.kind('/made/nested'), 'missing');
});
test('binary output creates the configured artifact root', async () => {
  const data = new Uint8Array([1, 2, 3]);
  const x = policyCase({ directory: '/exports', forbiddenRoots: [] }, { spec: { output: 'binary' }, run: async () => ({ ok: true, binary: binaryArtifact({ bytes: data, mediaType: 'application/octet-stream', basename: 'export.bin', summary: { count: 3 } }) }) });
  const value = wire(await run(x));
  assert.ok(value.payload.artifact.path.startsWith('/exports/'));
  assert.deepEqual(x.host.filesSnapshot()[value.payload.artifact.path], data);
});
test('a forbidden configured root is refused before any directory creation', async () => {
  const x = policyCase({ directory: '/blocked/artifacts', forbiddenRoots: ['/blocked'] }, { run: async () => ({ ok: true, data: big }) });
  const result = await run(x);
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /Artifact directory \\"\/blocked\/artifacts\\" is inside a forbidden root\./);
  assert.equal(x.host.calls.some(call => call.kind === 'ensureDirectory' || call.kind === 'write'), false);
  assert.equal(await x.host.files.kind('/blocked'), 'missing');
});
for (const [code, cause] of [['EACCES', /the OS denied permission/], ['ENOSPC', /the filesystem has no space/], ['ENOTDIR', /ancestor that is not a directory/], [undefined, /could not be created or inspected; check permissions and available space/]]) {
  test(`artifact root creation failure explains ${code ?? 'a generic'} cause without host text`, async () => {
    const host = createTestHost();
    const injected = { ...host, files: { ...host.files, ensureDirectory: async () => { throw Object.assign(Error('host secret'), code ? { code } : {}); } } };
    const x = policyCase({ directory: '/artifacts', forbiddenRoots: [] }, { host: injected, run: async () => ({ ok: true, data: big }) });
    for (const format of [['--json'], []]) {
      const result = await run(x, ['inspect', ...format]);
      assert.equal(result.exitCode, 1);
      assert.match(whole(result), cause);
      assert.match(whole(result), /\/artifacts/);
      assert.doesNotMatch(whole(result), /host secret/);
    }
  });
}
test('a file at the configured root is refused without replacement', async () => {
  const x = policyCase({ directory: '/artifacts', forbiddenRoots: [] }, { host: createTestHost({ files: { '/artifacts': 'keep' } }), run: async () => ({ ok: true, data: big }) });
  const result = await run(x);
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /is a file, not a directory/);
  assert.equal(new TextDecoder().decode(x.host.filesSnapshot()['/artifacts']), 'keep');
});
test('release precedes directory preparation and app-derived forbidden roots survive release', async () => {
  const order = [];
  const host = createTestHost();
  const injected = { ...host, files: { ...host.files, canonicalPath: async path => { order.push('canonical'); return host.files.canonicalPath(path); }, ensureDirectory: async (...args) => { order.push('ensure'); return host.files.ensureDirectory(...args); } } };
  const app = { forbidden: ['/app/data'] };
  const x = policyCase({ resolve: ({ app }) => ({ directory: '/app/data/artifacts', forbiddenRoots: app.forbidden }) }, { host: injected,
    acquire: async () => ({ ok: true, app, release: () => { order.push('release'); app.forbidden.length = 0; } }), run: async () => ({ ok: true, data: big }) });
  const result = await run(x);
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /inside a forbidden root/);
  assert.equal(order[0], 'release');
  assert.equal(order.includes('ensure'), false);
});
test('earlier guidance survives a deferred policy failure', async () => {
  const x = policyCase({ resolve: () => { throw Error('policy secret'); } }, { run: async () => ({ ok: true, data: big }),
    guidance: { load: async () => ({ default: async ({ command }) => instructionBatch(command) }), conflictSink: () => {} } });
  const value = wire(await run(x));
  assert.equal(value.error.code, 'KERNEL_OUTPUT');
  assert.match(JSON.stringify(value.error), /Artifact policy could not be collected/);
  assert.equal(value.instruction, 'Inspect saved state.');
});
test('unknown write recovery survives a deferred policy failure', async () => {
  const unknown = recoveryFacts([{ kind: 'attempt', id: 'attempt-7' }]);
  const x = policyCase({ directory: '/artifacts', forbiddenRoots: ['/artifacts'] }, { spec: { effects: 'write' },
    run: async ({ ctx }) => ({ effect: 'unknown', recovery: unknown, result: { ok: false, error: ctx.errors.error('REFUSED', { message: 'Unconfirmed' }), data: big } }) });
  const value = wire(await run(x));
  assert.equal(value.error.code, 'REFUSED');
  assert.equal(value.effect, 'unknown');
  assert.deepEqual(value.recovery, unknown);
  assert.ok(value.error.secondary.some(item => /inside a forbidden root/.test(item.message)));
});
test('static policy spills oversized offline help without loading handlers or contexts', async () => {
  const x = fixture({ spec: { description: 'é'.repeat(16000) }, load: () => { throw Error('off-path handler'); }, acquire: () => { throw Error('off-path provider'); }, artifacts: { directory: '/offline', forbiddenRoots: [] } });
  const value = wire(await run(x, ['inspect', '--help', '--json']));
  assert.equal(value.ok, true);
  assert.equal(value.payload.artifact.reason, 'stdout_budget_exceeded');
  assert.ok(value.payload.artifact.path.startsWith('/offline/'));
  assert.deepEqual(x.events, []);
});
test('dynamic policy is never resolved for offline help', async () => {
  let resolved = 0;
  const x = fixture({ spec: { description: 'é'.repeat(16000) }, artifacts: { resolve: () => { resolved++; return { directory: '/offline', forbiddenRoots: [] }; } } });
  const value = wire(await run(x, ['inspect', '--help', '--json']));
  assert.equal(value.ok, true);
  assert.deepEqual(value.payload.data, { omitted: true });
  assert.equal(resolved, 0);
  assert.deepEqual(artifactWork(x.host.calls), []);
});
