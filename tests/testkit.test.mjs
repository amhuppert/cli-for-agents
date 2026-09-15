import assert from 'node:assert/strict';
import test from 'node:test';
import { commandsFor, defineErrors, invocation, bytes } from 'cli-for-agents';
import { createCli } from 'cli-for-agents/runtime';
import { createTestHost, runForTest, expectBounded, expectLazy, contractTests } from 'cli-for-agents/testing';

function fixture({ large = false, flags = {} } = {}) {
  let loads = 0, acquisitions = 0;
  const family = commandsFor()({ errors: defineErrors({}), globalFlags: {} });
  const command = family.defineCommand({ path: 'inspect', summary: 'Inspect', description: 'Inspect state', requires: 'store', effects: 'read', args: [], flags }, {
    examples: [{ why: 'Inspect' }], handler: async () => { loads++; return { default: { run: async ({ app }) => ({ ok: true, data: { value: app.read(), ...(large ? { text: '😀'.repeat(4000) } : {}) } }) } }; },
  });
  const host = createTestHost({ files: { '/artifacts/.keep': '' } });
  const cli = createCli({ name: 'tool', version: '1', family, commands: [command], doctor: invocation(command, {}), contexts: { store: async () => { acquisitions++; return { ok: true, app: { read: () => 42 } }; } }, output: { maxBytes: bytes(8192), artifacts: { directory: '/artifacts', forbiddenRoots: [] } } });
  return { cli, command, host, counts: () => [loads, acquisitions] };
}
async function captured(work, message) {
  let value, error;
  try { value = await work(); } catch (caught) { error = caught; }
  assert.equal(error, undefined, message);
  return value;
}
test('runForTest uses real providers or concrete services and returns decoded evidence', async () => {
  const x = fixture();
  const result = await captured(() => runForTest(x.cli, invocation(x.command, {}), { host: x.host, format: 'json', contexts: { store: { read: () => 7 } } }), 'runForTest must execute the public runtime');
  assert.equal(result.envelope.payload.data.value, 7);
  assert.deepEqual(x.counts(), [1, 0]);
  const real = await runForTest(x.cli, ['inspect'], { host: x.host, format: 'json' });
  assert.equal(real.envelope.payload.data.value, 42);
  assert.deepEqual(x.counts(), [2, 1]);
  assert.ok(real.events.some(event => event.type === 'handler.load'));
});
for (const format of ['json', 'text']) test(`captures only this run's artifacts and host calls (${format})`, async () => {
  const x = fixture({ large: true });
  await x.host.sha256(new Uint8Array());
  const result = await captured(() => runForTest(x.cli, ['inspect'], { host: x.host, format }), 'capture must work for both output formats');
  assert.equal(result.format, format);
  assert.equal('envelope' in result, format === 'json');
  assert.equal(result.artifacts.length, 1);
  const manifest = result.artifacts[0];
  const data = x.host.filesSnapshot()[manifest.path];
  assert.equal(data.length, manifest.bytes);
  assert.equal(await x.host.sha256(data), manifest.sha256);
  assert.notEqual(result.calls[0]?.kind, 'sha256');
  const offline = await runForTest(x.cli, ['--version'], { host: x.host, format });
  assert.deepEqual(offline.artifacts, []);
  assert.deepEqual(offline.calls, []);
});
test('expectBounded measures UTF-8 across both streams including the exact boundary', async () => {
  await captured(() => expectBounded({ stdout: '😀', stderr: 'é', exitCode: 0 }, bytes(6)), 'exact byte boundary must pass');
  assert.throws(() => expectBounded({ stdout: '😀', stderr: 'é', exitCode: 0 }, bytes(5)), /byte bound/);
});
test('lazy and runner-neutral checks exercise registered offline routes', async () => {
  const x = fixture();
  await captured(() => expectLazy(x.command, x.cli), 'lazy command assertion must run');
  const cases = contractTests(x.cli);
  assert.ok(cases.length > 0);
  for (const check of cases) await check.run();
  assert.deepEqual(x.counts(), [0, 0]);
});
test('concurrent runs sharing a host have separate evidence', async () => {
  const x = fixture({ large: true });
  const results = await Promise.all([1, 2].map(() => runForTest(x.cli, ['inspect'], { host: x.host, format: 'json' })));
  for (const result of results) {
    assert.equal(result.calls.filter(call => call.kind === 'write').length, 1, 'capture must include only its invocation writes');
    assert.equal(result.events.filter(event => event.type === 'handler.load').length, 1);
  }
});
test('format contradictions and foreign invocations are rejected before running services', async () => {
  const x = fixture(), foreign = fixture();
  assert.equal((await runForTest(x.cli, ['inspect', '--json=false'], { host: x.host, format: 'json' })).exitCode, 2);
  await assert.rejects(runForTest(x.cli, invocation(foreign.command, {}), { host: x.host, format: 'json' }), /member/);
  assert.deepEqual(x.counts(), [0, 0]);
  await expectLazy(x.command);
});

import { createContractFixtures, expectDisclosureParity } from 'cli-for-agents/testing';
import { invalidContractFixtures } from './fixtures/testkit-invalid.mjs';
const caseNames = ['offline-paths', 'schema-issue-survival', 'single-guidance-arbitration', 'unknown-totals', 'shell-safe-references', 'unicode-spill', 'operation-recovery'];
test('publishes seven executable runner-neutral cases with runtime-backed controls', async () => {
  const x = fixture();
  const cases = await captured(() => contractTests(x.cli), 'contract cases must be executable');
  assert.deepEqual(cases.map(item => item.name), caseNames);
  for (const item of cases) await item.run();
});
const violationReasons = {
  'offline-paths': /Offline path evaluated/,
  'schema-issue-survival': /Schema issue\/path lost/,
  'single-guidance-arbitration': /arbitrated more or less than once/,
  'unknown-totals': /Unknown total was reported as known/,
  'shell-safe-references': /shell syntax outside quotes/,
  'unicode-spill': /Output exceeds byte bound/,
  'operation-recovery': /Known operation effect\/recovery was dropped/,
};
for (const name of caseNames) test(`inherited check rejects deliberately invalid ${name}`, async () => {
  const x = fixture();
  const invalid = invalidContractFixtures(createContractFixtures(x.cli));
  const cases = await captured(() => contractTests(x.cli, invalid), 'contract case inventory must construct without running handlers');
  await assert.rejects(cases.find(item => item.name === name).run(), error => error.message.startsWith(`${name}:`) && violationReasons[name].test(error.message), `must reject ${name} at its intended assertion`);
});
function parity(extra = ['receipt']) {
  return { command: 'inspect', textFields: ['value'], jsonFields: ['value', ...extra], text: { stdout: '42', stderr: '', exitCode: 0 }, json: { stdout: JSON.stringify({ value: 42, ...Object.fromEntries(extra.map(field => [field, "saved-42"])) }), stderr: '', exitCode: 0 } };
}
const exception = { command: 'inspect', extraFields: ['receipt'], rationale: 'Compatibility disclosure until consumer update.', deleteWhen: 'Consumer reads receipts from artifacts.' };
test('disclosure inventory permits documented JSON extras while checking both stream bounds', async () => {
  const x = fixture();
  await captured(() => expectDisclosureParity(x.cli, [exception], [parity()]), 'valid exception must pass');
  expectDisclosureParity(x.cli, [], [parity([])]);
  const observation = parity();
  observation.json = { stdout: '😀'.repeat(2048), stderr: 'x', exitCode: 0 };
  assert.throws(() => expectDisclosureParity(x.cli, [exception], [observation]), /byte bound/);
});
for (const [label, inventory, observations, options] of [
  ['missing rationale', [{ ...exception, rationale: '' }], null],
  ['missing deletion condition', [{ ...exception, deleteWhen: '' }], null],
  ['empty extra fields', [{ ...exception, extraFields: [] }], null],
  ['deleted command', [{ ...exception, command: 'removed' }], null],
  ['unused exception', [exception], []],
  ['stale field', [exception], 'equal'],
  ['satisfied deletion condition', [exception], null, { satisfiedDeletionConditions: [exception.deleteWhen] }],
  ['unlisted extra field', [], null],
  ['duplicate exception', [exception, exception], null],
  ['byte-bound escape hatch', [{ ...exception, disableByteBound: true }], null],
]) test(`disclosure inventory rejects ${label}`, () => {
  const x = fixture();
  assert.throws(() => expectDisclosureParity(x.cli, inventory, observations === 'equal' ? [parity([])] : observations ?? [parity()], options), /disclosure|byte bound/);
});
test('explicit JSON argv stays accepted through runForTest', async () => {
  const x = fixture();
  const result = await runForTest(x.cli, ['inspect', '--json'], { host: x.host, format: 'json' });
  assert.equal(result.exitCode, 0, 'format selection must not manufacture a duplicate flag');
  assert.equal(result.envelope.payload.data.value, 42);
});
test('fixture construction failures cannot masquerade as a contract rejection', async () => {
  const x = fixture();
  const fixtures = { ...createContractFixtures(x.cli), 'unknown-totals': async () => { throw new Error('broken setup'); } };
  await assert.rejects(contractTests(x.cli, fixtures).find(item => item.name === 'unknown-totals').run(), error => error.message === 'broken setup');
});

import { renderInvocation } from 'cli-for-agents/runtime';
for (const executable of ['if', 'TOOL=contract']) test(`shell assertion rejects an unquoted executable ${executable}`, async () => {
  const x = fixture();
  const fixtures = createContractFixtures(x.cli);
  const violating = { ...fixtures, 'shell-safe-references': async () => {
    const evidence = await fixtures['shell-safe-references']();
    const rendered = renderInvocation(evidence.reference, executable).replace(`'${executable}'`, executable);
    const envelope = { ...evidence.json.envelope, hint: evidence.json.envelope.hint.replace(evidence.rendered, rendered) };
    return { ...evidence, executable, rendered, json: { ...evidence.json, envelope, stdout: JSON.stringify(envelope) + '\n' } };
  } };
  await assert.rejects(contractTests(x.cli, violating).find(item => item.name === 'shell-safe-references').run(), /executable requires shell quoting/);
});
test('lazy refusal probe cannot collide with a consumer-declared flag', async () => {
  const x = fixture({ flags: { 'testkit-unknown-flag': { description: 'Valid domain option', value: { kind: 'boolean' } } } });
  await captured(() => expectLazy(x.command, x.cli), 'lazy checks must choose an impossible declared flag');
  assert.deepEqual(x.counts(), [0, 0]);
});

// Quotes in an assignment's value do not turn its unquoted NAME= prefix into
// an executable. Keep the delivered hint and stream coherent in each fixture.
for (const [spelling, accepted] of [
  ["TOOL='contract'", false],
  ["TOOL=contract''", false],
  ["TOOL='con'tract", false],
  ["TOOL=''contract", false],
  ["TOOL=con''tract", false],
  ["'TOOL=contract'", true],
  ["'TOOL='contract", true],
  ["'TOOL'=contract", true],
  ["TO'OL'=contract", true],
  ["TOOL'='contract", true],
]) test(`shell assignment prefix ${accepted ? 'accepts' : 'rejects'} ${spelling}`, async () => {
  const x = fixture();
  const fixtures = createContractFixtures(x.cli);
  const executable = 'TOOL=contract';
  const adapted = { ...fixtures, 'shell-safe-references': async () => {
    const evidence = await fixtures['shell-safe-references']();
    const rendered = renderInvocation(evidence.reference, executable).replace(`'${executable}'`, spelling);
    const envelope = { ...evidence.json.envelope, hint: evidence.json.envelope.hint.replace(evidence.rendered, rendered) };
    return { ...evidence, executable, rendered, json: { ...evidence.json, envelope, stdout: JSON.stringify(envelope) + '\n' } };
  } };
  const check = contractTests(x.cli, adapted).find(item => item.name === 'shell-safe-references');
  if (accepted) await check.run();
  else await assert.rejects(check.run(), /shell-safe-references: Invocation executable requires shell quoting/);
});
