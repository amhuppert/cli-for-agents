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
test('format contradictions and unresolvable invocations are rejected before running services', async () => {
  const x = fixture();
  await assert.rejects(runForTest(x.cli, { ...invocation(x.command, {}), path: 'absent' }, { host: x.host, format: 'json' }), /target/);
  assert.deepEqual(x.counts(), [0, 0]);
  await expectLazy(x.command);
});
for (const [argv, format] of [
  [['inspect', '--json'], 'text'], [['inspect', '--json=true'], 'text'], [['--json', 'inspect'], 'text'],
  [['inspect', '--json=false'], 'json'], [['inspect', '--bad', '--json'], 'text'], [['inspect', '--json=false', '--bad'], 'json'],
]) test(`explicit format conflict ${JSON.stringify(argv)} as ${format} throws before host or handler access`, async () => {
  const x = fixture();
  await assert.rejects(runForTest(x.cli, argv, { host: x.host, format }), error => error instanceof TypeError && error.message === 'Input conflicts with test format.');
  assert.deepEqual(x.counts(), [0, 0]);
  assert.deepEqual(x.host.calls, []);
});
for (const [argv, format] of [[['inspect', '--json'], 'json'], [['inspect', '--json=true'], 'json'], [['inspect', '--json=false'], 'text'], [['inspect'], 'json'], [['inspect'], 'text']]) {
  test(`matching or absent explicit format ${JSON.stringify(argv)} renders ${format}`, async () => {
    const x = fixture();
    const result = await runForTest(x.cli, argv, { host: x.host, format });
    assert.equal(result.exitCode, 0, result.stdout + result.stderr);
    assert.equal(result.format, format);
    if (format === 'json') assert.equal(result.envelope.payload.data.value, 42);
    else assert.equal(result.stdout, JSON.stringify({ value: 42 }, null, 2) + '\n');
  });
}
function formatFixture(extra) {
  const family = commandsFor()({ errors: defineErrors({}), globalFlags: {} });
  const command = family.defineCommand({ path: 'inspect', summary: 'Inspect', description: 'Inspect state', requires: 'none', effects: 'read', args: [], flags: {}, ...extra }, {
    examples: [{ why: 'Inspect' }], handler: async () => ({ default: { run: async ({ ctx }) => ({ ok: true, data: { args: ctx.args, passthrough: ctx.passthrough ?? null } }) } }),
  });
  return { command, cli: createCli({ name: 'tool', version: '1', family, commands: [command], doctor: invocation(command, {}), contexts: {}, output: { artifacts: { directory: '/artifacts', forbiddenRoots: [] } } }) };
}
for (const format of ['json', 'text']) {
  test(`format-like tokens after -- are data, not format flags (${format})`, async () => {
    const positional = formatFixture({ args: [{ name: 'term', description: 'Term', value: { kind: 'string' }, required: false }] });
    const passthrough = formatFixture({ passthrough: true });
    for (const [x, expected] of [[positional, { args: { term: '--json' }, passthrough: null }], [passthrough, { args: {}, passthrough: ['--json=false', '--json'] }]]) {
      const argv = x === positional ? ['inspect', '--', '--json'] : ['inspect', '--', '--json=false', '--json'];
      const result = await runForTest(x.cli, argv, { host: createTestHost({ files: { '/artifacts/.keep': '' } }), format });
      assert.equal(result.exitCode, 0, result.stdout + result.stderr);
      assert.deepEqual(format === 'json' ? result.envelope.payload.data : JSON.parse(result.stdout), expected);
    }
  });
  for (const [argv, cause] of [[['inspect', '--json=maybe'], /expected true or false/], [['inspect', '--json', '--json'], /^Duplicate flag\.$/], [['inspect', '--json=false', '--json=true'], /^Duplicate flag\.$/], [['inspect', '--bad'], /not accepted here/]]) {
    test(`malformed format or unrelated argv ${JSON.stringify(argv)} stays KERNEL_USAGE in ${format}`, async () => {
      const x = fixture();
      const result = await runForTest(x.cli, argv, { host: x.host, format });
      assert.equal(result.exitCode, 2);
      assert.equal(result.format, format);
      if (format === 'json') {
        assert.equal(result.envelope.error.code, 'KERNEL_USAGE');
        assert.match(result.envelope.error.issues[0].message, cause);
      } else {
        assert.equal(result.stdout, '');
        assert.match(result.stderr, /^error: KERNEL_USAGE: /);
        assert.match(result.stderr.split('\n').find(line => line.startsWith('issue: ')).replace(/^issue: invalid_value: /, ''), cause);
      }
      assert.deepEqual(x.counts(), [0, 0]);
    });
  }
  test(`declaration-backed invocations render as requested (${format})`, async () => {
    const x = fixture();
    const result = await runForTest(x.cli, invocation(x.command, {}), { host: x.host, format });
    assert.equal(result.exitCode, 0);
    assert.equal(result.format, format);
    assert.equal(format === 'json' ? result.envelope.payload.data.value : JSON.parse(result.stdout).value, 42);
  });
}

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

// Parity failures name every command and field difference in a stable order.
function parityCli() {
  const family = commandsFor()({ errors: defineErrors({}), globalFlags: {} });
  const commands = ['alpha', 'beta', 'gamma'].map(path => family.defineCommand({ path, summary: path, description: path, requires: 'none', effects: 'read', args: [], flags: {} }, { examples: [{ why: 'Use' }], handler: async () => ({ default: { run: async () => ({ ok: true, data: {} }) } }) }));
  return createCli({ name: 'tool', version: '1', family, commands, contexts: {}, doctor: invocation(commands[0], {}), output: { artifacts: { directory: '/artifacts', forbiddenRoots: [] } } });
}
const observe = (command, textFields, jsonFields) => ({ command, textFields, jsonFields, text: { stdout: 'x', stderr: '', exitCode: 0 }, json: { stdout: '{}', stderr: '', exitCode: 0 } });
const listed = (command, extraFields, extra = {}) => ({ command, extraFields, rationale: 'Consumers still read it.', deleteWhen: `${command} consumers migrate.`, ...extra });
test('disclosure parity reports every mismatched command with actionable field diffs in path order', () => {
  const cli = parityCli();
  assert.throws(() => expectDisclosureParity(cli, [listed('gamma', ['receipt', 'legacy'])], [
    observe('gamma', ['id'], ['id', 'receipt']),
    observe('beta', ['id'], ['id']),
    observe('alpha', ['id', 'summary', 'note'], ['id', 'receipt']),
  ]), error => error.message === 'disclosure: parity differs for 2 commands:\n"alpha": text-only ["note","summary"]; unlisted JSON-only ["receipt"]\n"gamma": stale exception fields ["legacy"]');
  expectDisclosureParity(cli, [listed('gamma', ['receipt'])], [observe('gamma', ['id'], ['id', 'receipt']), observe('alpha', ['id'], ['id'])]);
});
for (const [label, exceptions, observations, options, message] of [
  ['duplicate text fields', [], [observe('alpha', ['id', 'id'], ['id'])], {}, /Duplicate disclosure text fields for "alpha": \["id"\]/],
  ['duplicate JSON fields', [], [observe('alpha', ['id'], ['id', 'id'])], {}, /Duplicate disclosure JSON fields for "alpha": \["id"\]/],
  ['duplicate exception fields', [listed('alpha', ['receipt', 'receipt'])], [observe('alpha', ['id'], ['id', 'receipt'])], {}, /Duplicate disclosure exception fields for "alpha": \["receipt"\]/],
  ['a stale target', [listed('removed', ['receipt'])], [], {}, /Stale disclosure exception target "removed"/],
  ['an empty exception', [listed('alpha', [])], [], {}, /Disclosure exception for "alpha" lists no extra fields/],
  ['a duplicate exception', [listed('alpha', ['receipt']), listed('alpha', ['receipt'])], [], {}, /Duplicate disclosure exception for "alpha"/],
  ['a satisfied deletion condition', [listed('alpha', ['receipt'])], [observe('alpha', ['id'], ['id', 'receipt'])], { satisfiedDeletionConditions: ['alpha consumers migrate.'] }, /Stale disclosure exception for "alpha": deletion condition "alpha consumers migrate\." is satisfied/],
  ['an unobserved exception', [listed('beta', ['receipt']), listed('gamma', ['receipt'])], [observe('alpha', ['id'], ['id'])], {}, /Disclosure exceptions have no current parity evidence: \["beta","gamma"\]/],
  ['an unknown observation', [], [observe('nope', ['id'], ['id'])], {}, /Unknown disclosure observation command "nope"/],
  ['a duplicate observation', [], [observe('alpha', ['id'], ['id']), observe('alpha', ['id'], ['id'])], {}, /Duplicate disclosure observation for "alpha"/],
]) test(`disclosure parity names the command for ${label}`, () => {
  assert.throws(() => expectDisclosureParity(parityCli(), exceptions, observations, options), error => error.message.startsWith('disclosure: ') && message.test(error.message));
});
test('disclosure parity names the command whose output exceeds the byte bound', () => {
  const observation = observe('beta', ['id'], ['id']);
  observation.json = { stdout: '😀'.repeat(8193), stderr: '', exitCode: 0 };
  assert.throws(() => expectDisclosureParity(parityCli(), [], [observation]), /"beta" JSON output exceeds byte bound/);
});
