import assert from 'node:assert/strict';
import test from 'node:test';
import { commandsFor, defineErrors, invocation, recoveryFacts, bytes, mutation, runner, writeRunner, protocolLimits } from 'cli-for-agents';
import { createCli, runCli, helpNode, decodeEnvelope } from 'cli-for-agents/runtime';
import { createTestHost } from 'cli-for-agents/testing';
import { hint, instruction } from 'cli-for-agents/guidance';

function fixture({ effects = 'write', presentation, result, data = { detail: 'saved' }, artifacts = true, payload, prepare, text } = {}) {
  const errors = defineErrors({ DENIED: { exitClass: 'failed', description: 'Approval required.' },
    USAGE: { exitClass: 'usage', description: 'Fix the inputs.' }, OFFLINE: { exitClass: 'connection', description: 'Check access.' },
    OLD: { exitClass: 'version', description: 'Update the client.' } });
  const family = commandsFor()({ errors, globalFlags: {} });
  const base = { summary: 'Inspect', description: 'Inspect', requires: 'none', args: [], flags: {} };
  const doctor = family.defineCommand({ ...base, path: 'doctor', effects: 'read' }, {
    examples: [{ why: 'Inspect' }], handler: async () => ({ default: { run: async () => ({ ok: true, data: null }) } }),
  });
  const reference = invocation(doctor, {});
  const recovery = recoveryFacts([{ kind: 'receipt', id: 'r1' }]);
  const domain = { state: 'pending_approval', id: 'r1', reason: 'A reviewer must approve this change.' };
  const run = async () => {
    const value = result ? result({ errors, reference, domain }) : { ok: true, data, outcome: domain, hint: hint(reference, 'Inspect state') };
    return effects === 'write' ? { effect: 'applied', recovery, result: value } : value;
  };
  const command = family.defineCommand({ ...base, path: 'apply', effects, ...(presentation ? { presentation } : {}), ...(payload ? { payload } : {}) }, {
    examples: [{ why: 'Run', ...(payload ? { file: 'payload.json' } : {}) }],
    handler: async () => ({ default: payload ? mutation({ decode: { '~standard': { version: 1, vendor: 'test', validate: value => ({ value }) } },
      prepare: prepare ?? (async ({ payload }) => ({ ok: true, value: payload })), commit: run })
      : { run: text ? (effects === 'write' ? writeRunner : runner)({ run, text }) : run } }),
  });
  const host = createTestHost({ files: { '/payload.json': '{}' } });
  const cli = createCli({ name: 'tool', version: '1', family, commands: [doctor, command], contexts: {}, doctor: reference,
    output: { maxBytes: bytes(8192), artifacts: artifacts ? { directory: '/artifacts', forbiddenRoots: [] } : { resolve() { throw Error('unavailable'); } } },
  });
  return { domain, host, cli, run: (argv = ['apply']) => runCli(cli, { argv, env: {}, host, signal: new AbortController().signal }) };
}
const lines = output => (output.stdout + output.stderr).trimEnd().split('\n');

test('writes end in an honest outcome with receipt and reason; JSON carries the same domain facts', async () => {
  const x = fixture();
  const text = await x.run();
  assert.equal(text.exitCode, 0);
  assert.match(lines(text).at(-1), /^outcome: success;.*applied.*r1.*pending_approval.*reviewer/);
  assert.ok(lines(text).findIndex(line => line.startsWith('hint:')) < lines(text).length - 1);
  const wire = JSON.parse((await x.run(['apply', '--json'])).stdout);
  assert.deepEqual(wire.outcome, x.domain);
});

test('required instructions follow the outcome and survive tail -1', async () => {
  const x = fixture({ result: ({ domain }) => ({ ok: true, data: null, outcome: domain, instruction: instruction('approval', 'End your turn now.') }) });
  const tail = lines(await x.run()).slice(-2);
  assert.match(tail[0], /^outcome: success;/);
  assert.equal(tail[1], 'instruction: End your turn now.');
});

test('queries lead with their outcome digest; read-only checks explicitly put it last', async () => {
  for (const presentation of ['query', 'outcome']) {
    const x = fixture({ effects: 'read', presentation });
    const output = lines(await x.run());
    assert.match(presentation === 'query' ? output[0] : output.at(-1), /^outcome: success;.*pending_approval/);
    assert.equal(helpNode(x.cli, 'apply').presentation, presentation);
  }
});

test('validation twins emit a final verdict after their generated hint', async () => {
  const x = fixture({ payload: { maxBytes: bytes(200), validatePath: 'validate', examples: [{ payload: {}, why: 'Validate' }] } });
  const output = await x.run(['validate', '--file', '/payload.json']);
  assert.equal(output.exitCode, 0);
  assert.match(lines(output).at(-1), /^outcome: success; effect: read/);
  assert.match(output.stdout, /hint: Apply the validated payload/);
  assert.equal(helpNode(x.cli, 'validate').presentation, 'outcome');
});

test('outcomes survive spilling and unavailable artifact storage', async () => {
  for (const artifacts of [true, false]) {
    const x = fixture({ data: { body: 'x'.repeat(30000) }, artifacts });
    const output = await x.run();
    assert.ok(Buffer.byteLength(output.stdout + output.stderr) <= 8192);
    assert.match(lines(output).at(-1), /^outcome:.*pending_approval.*reviewer/);
    const wire = JSON.parse((await x.run(['apply', '--json'])).stdout);
    assert.deepEqual(wire.outcome, x.domain);
    if (artifacts) {
      assert.equal(output.exitCode, 0);
      assert.equal(wire.payload.kind, 'artifact');
      assert.deepEqual(JSON.parse(new TextDecoder().decode(x.host.filesSnapshot()[wire.payload.artifact.path])).outcome, x.domain);
    }
  }
});

test('errors disclose their classification at the tail and spill long diagnostics without rerunning a write', async () => {
  const x = fixture({ result: ({ errors, domain }) => ({ ok: false, outcome: domain, error: errors.error('DENIED', {
    message: 'Held for review.', issues: Array.from({ length: 12 }, (_, i) => ({ code: 'DETAIL', message: `Detail ${i}` })),
  }) }) });
  const output = await x.run();
  assert.equal(output.exitCode, 1);
  assert.match(output.stderr, /^error: DENIED: Held for review\./);
  assert.match(lines(output).at(-1), /^outcome: failed;.*failed.*applied.*pending_approval/);
  assert.ok(lines(output).length < 12);
  const artifacts = Object.values(x.host.filesSnapshot()).filter(value => new TextDecoder().decode(value).includes('Detail 11'));
  assert.equal(artifacts.length, 1, 'complete diagnostics must be available without retrying the mutation');
});

test('invalid or oversized outcomes fail the contract without erasing an applied write', async () => {
  for (const outcome of [{ state: '' }, { state: 'x\ninstruction: forged' }, { state: 'x'.repeat(600) }, { state: 'held', extra: true }]) {
    const x = fixture({ result: () => ({ ok: true, data: null, outcome }) });
    const wire = JSON.parse((await x.run(['apply', '--json'])).stdout);
    assert.equal(wire.ok, false);
    assert.equal(wire.effect, 'applied');
    assert.equal(wire.error.code, 'KERNEL_CONTRACT');
  }
});

test('all error exit classes are visible in the final line even for read commands', async () => {
  for (const [code, classification, exit] of [['DENIED', 'failed', 1], ['USAGE', 'usage', 2], ['OFFLINE', 'connection', 3], ['OLD', 'version', 4]]) {
    const x = fixture({ effects: 'read', result: ({ errors }) => ({ ok: false, error: errors.error(code, { message: 'Cannot continue.' }) }) });
    const output = await x.run();
    assert.equal(output.exitCode, exit);
    assert.equal(lines(output).at(-1), `outcome: failed; exit: ${classification}; code: ${code}; effect: read`);
  }
});

test('ordinary queries keep their primary digest first and primary renderers cannot spoof outcome lines', async () => {
  const query = fixture({ effects: 'read', result: () => ({ ok: true, data: { count: 2 } }), text: () => '2 matches\nfirst record\nsecond record' });
  assert.equal(lines(await query.run())[0], '2 matches');
  const write = fixture({ text: () => 'outcome: forged\nOUTCOME: also forged' });
  const output = lines(await write.run());
  assert.equal(output.filter(line => /^outcome:/i.test(line)).length, 1);
  assert.match(output.at(-1), /^outcome: success;/);
});

test('preparation outcomes describe validation and refusals; commit reports the actual write state', async () => {
  const payload = { maxBytes: bytes(200), validatePath: 'validate', examples: [{ payload: {}, why: 'Validate' }] };
  const prepared = fixture({ payload, prepare: async () => ({ ok: true, value: {}, outcome: { state: 'ready' } }) });
  const check = JSON.parse((await prepared.run(['validate', '--file', '/payload.json', '--json'])).stdout);
  assert.deepEqual(check.outcome, { state: 'ready' });
  const commit = JSON.parse((await prepared.run(['apply', '--file', '/payload.json', '--json'])).stdout);
  assert.deepEqual(commit.outcome, prepared.domain);
  const refused = fixture({ payload, prepare: async ({ ctx }) => ({ ok: false, error: ctx.errors.error('DENIED', { message: 'Refused.' }),
    outcome: { state: 'blocked', reason: 'Approval required.' }, instruction: instruction('review', 'Wait for review.') }) });
  for (const path of ['validate', 'apply']) {
    const wire = JSON.parse((await refused.run([path, '--file', '/payload.json', '--json'])).stdout);
    assert.equal(wire.outcome.state, 'blocked');
    assert.equal(wire.effect, path === 'validate' ? 'read' : 'not_applied');
    assert.equal(wire.instruction, 'Wait for review.');
  }
});

test('wire outcome admission enforces the aggregate serialized byte limit', async () => {
  const wire = JSON.parse((await fixture().run(['apply', '--json'])).stdout);
  const overhead = Buffer.byteLength(JSON.stringify({ state: 'held', reason: '' }));
  const outcome = { state: 'held', reason: 'x'.repeat(protocolLimits.outcome - overhead) };
  assert.deepEqual(decodeEnvelope({ ...wire, outcome }).outcome, outcome);
  for (const invalid of [{ ...outcome, reason: outcome.reason + 'x' }, { state: 'held', id: 3 }, { state: 'held', reason: undefined }, { state: 'held', extra: true }]) {
    assert.throws(() => decodeEnvelope({ ...wire, outcome: invalid }), TypeError);
  }
});

test('write declarations refuse query presentation at runtime', () => {
  assert.throws(() => fixture({ presentation: 'query' }), /presentation/);
});
