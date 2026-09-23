import assert from 'node:assert/strict';
import test from 'node:test';
import { commandsFor, defineErrors, defineGroup, defineFlow, invocation, bytes } from 'cli-for-agents';
import { createCli, helpNode, commandReference, validateReferences, renderInvocation } from 'cli-for-agents/runtime';
import { createTestHost } from 'cli-for-agents/testing';
import { cliRegistry, registryState, resolve } from '../dist/internal/registry.js';

function fixture(extra = {}) {
  const family = commandsFor()({ errors: defineErrors({ AUTH: { exitClass: 'connection', description: 'Sign in first.' } }), globalFlags: { profile: { description: 'Profile', value: { kind: 'string' } } } });
  const spec = (path, more = {}) => ({ path, summary: path, description: `Description of ${path}`, requires: 'none', effects: 'read', args: [], flags: {}, ...more });
  const handler = async () => { throw Error('must remain offline'); };
  const doctor = family.defineCommand(spec('doctor'), { examples: [{ why: 'Diagnose' }], handler });
  const show = family.defineCommand(spec('items show', { dynamicHelp: true, args: [{ name: 'id', description: 'Item ID', value: { kind: 'string' } }], flags: { text: { description: 'Text', value: { kind: 'string' }, fileSource: { maxBytes: bytes(200) } } }, levels: { context: { output: 'bounded' }, full: { selectors: ['context', 'full'], output: 'artifact-eligible' } }, related: [{ path: 'doctor', description: 'Diagnose errors' }], skills: [{ path: 'guide.md', readWhen: 'Before use' }], sections: [{ kind: 'list', title: 'Safety', items: ['Inspect before changing.'] }] }), { examples: [{ args: { id: 'two words' }, level: 'full', why: 'Inspect all' }], handler });
  const write = family.defineCommand(spec('items write', { effects: 'write', payload: { maxBytes: bytes(500), validatePath: 'items validate' } }), { examples: [{ file: 'payload.json', why: 'Apply payload' }], handler });
  const options = { name: 'tool', version: '1.2.3', family, commands: [doctor, show, write], groups: [defineGroup({ path: 'items', summary: 'Items', description: 'Manage items', dynamicHelp: true })], flows: [defineFlow({ id: 'inspect', steps: [{ command: doctor, description: 'Check access' }, { command: show, description: 'Inspect item' }] })], contexts: {}, doctor: invocation(doctor, {}), documentation: { directory: '/docs' }, output: { artifacts: { resolve() { throw Error('offline policy'); } } }, guidance: { load() { throw Error('offline rules'); }, conflictSink() {} }, ...extra };
  return { cli: createCli(options), options, show };
}

test('offline hubs disclose direct children and leaves are self-contained structured help', () => {
  const { cli } = fixture();
  assert.deepEqual(helpNode(cli, '').children.map(x => x.path), ['doctor', 'items']);
  const group = helpNode(cli, 'items');
  assert.deepEqual(group.children.map(x => x.path), ['items show', 'items validate', 'items write']);
  assert.ok(group.flags.every(x => ['global', 'framework'].includes(x.source)));
  const leaf = helpNode(cli, 'items show');
  assert.equal(leaf.effects, 'read');
  assert.equal(leaf.arguments[0].required, true);
  assert.match(leaf.usage[0], /items show <id>/);
  assert.deepEqual(leaf.levels.full.selectors, ['context', 'full']);
  assert.equal(leaf.sections[0].title, 'Safety');
  assert.equal(leaf.skills[0].path, 'guide.md');
  assert.equal(leaf.flows[0].steps[0].path, 'doctor');
  assert.ok(leaf.related.some(x => x.path === 'doctor'));
  assert.match(renderInvocation(leaf.examples[0].invocation, 'tool'), /'two words'/);
  const registered = registryState(cliRegistry(cli)).nodes['items show'];
  assert.deepEqual(leaf.flags, Object.values(registered.model.flags).map(x => x.help));
  assert.equal(resolve(cliRegistry(cli), ['items', 'show', '--help']).kind, 'offline');
  assert.equal(helpNode(cli, 'items validate').effects, 'read');
  assert.equal(helpNode(cli, 'items validate').examples[0].invocation.path, 'items validate');
  assert.equal(helpNode(cli, 'items write').payload.maxBytes, 500);
  assert.ok(helpNode(cli, 'items write').related.some(x => x.path === 'items validate'));
});

test('unknown help paths remain usage errors with a valid parent recovery', () => {
  const { cli } = fixture();
  assert.throws(() => helpNode(cli, 'items absent'), /tool items --help/);
  assert.equal(resolve(cliRegistry(cli), ['items', 'absent', '--help']).kind, 'invalid');
});

test('reference text includes derived leaf details, examples, flows and catalog', () => {
  const { cli } = fixture();
  const reference = commandReference(cli);
  for (const text of ['--text-file', '--profile', '--context', '--full', '--file', 'Safety', 'Inspect all', 'Check access', 'guide.md', 'AUTH', 'KERNEL_USAGE']) assert.ok(reference.includes(text), text);
  assert.equal(commandReference(cli), reference);
  assert.deepEqual(JSON.parse(JSON.stringify(helpNode(cli, 'items show'))).examples[0].invocation.args, ['two words']);
});

test('reference seam checks existing files and reports missing files without acquiring lazy application code', async () => {
  const { cli } = fixture();
  const signal = new AbortController().signal;
  const host = createTestHost({ files: { '/docs/guide.md': 'Guide' } });
  assert.deepEqual(await validateReferences(cli, { host, signal }), { ok: true, checked: 1, issues: [] });
  const missing = await validateReferences(cli, { host: createTestHost({ files: { '/docs/other.md': '' } }), signal });
  assert.equal(missing.ok, false);
  assert.equal(missing.issues[0].code, 'missing_reference');
  assert.equal(missing.issues[0].commandPath, 'items show');
});

test('help for a valid secret-bearing command redacts examples and labels them as templates', () => {
  const { options } = fixture();
  const auth = options.family.defineCommand({ path: 'auth', summary: 'Authenticate', description: 'Authenticate with a credential.', requires: 'none', effects: 'read', args: [], flags: { token: { description: 'Credential', value: { kind: 'string' }, required: true, secret: true } } }, { examples: [{ flags: { token: 'never-print-this' }, why: 'Sign in' }], handler: async () => { throw Error('offline'); } });
  const cli = createCli({ ...options, commands: [...options.commands, auth] });
  const node = helpNode(cli, 'auth');
  assert.equal(node.examples[0].invocation, undefined);
  assert.equal(node.examples[0].template.flags.token, '<token>');
  assert.ok(!JSON.stringify(node).includes('never-print-this'));
  const reference = commandReference(cli);
  assert.ok(!reference.includes('never-print-this'));
  assert.match(reference, /Template/);
});

// The offline owner is consumed directly until runtime-composition owns runCli.
const { renderOffline } = await import('../dist/internal/help.js');
const offline = (cli, path = 'items show', extra = {}) => renderOffline(cli, { kind: 'offline', route: 'help', path, json: false, ...extra.route }, { env: {}, signal: new AbortController().signal, ...extra });
const turns = async () => { for (let n = 0; n < 30; n++) await Promise.resolve(); };

test('only opted-in help calls enrichment; unrelated offline routes and explicit live commands do not', async () => {
  let loads = 0;
  const { cli } = fixture({ helpContext: { maxBytes: bytes(200), load: async () => { loads++; return [async () => [{ text: 'Live context' }]]; } } });
  const enriched = await offline(cli);
  assert.match(enriched.stdout, /Live context/);
  assert.equal(enriched.stderr, '');
  assert.equal(loads, 1);
  await offline(cli, 'items');
  assert.equal(loads, 2);
  for (const path of ['', 'doctor', 'items write']) await offline(cli, path);
  for (const route of ['version', 'exit-codes']) await offline(cli, '', { route: { route } });
  assert.equal(resolve(cliRegistry(cli), ['doctor']).kind, 'leaf');
  assert.equal(loads, 2);
});

for (const [label, load] of [
  ['provider failure', async () => [async () => { throw Error('provider failed'); }]],
  ['auth failure', async () => [async () => { throw Error('authentication refused'); }]],
  ['loader failure', async () => { throw Error('load failed'); }],
  ['malformed providers', async () => [null]],
  ['malformed blocks', async () => [async () => [{ html: 'bad' }]]],
  ['extra block fields', async () => [async () => [{ text: 'data', extra: true }]]],
  ['too many blocks', async () => [async () => Array.from({ length: 4 }, () => ({ text: 'data' }))]],
  ['unicode byte overflow', async () => [async () => [{ text: '🦄'.repeat(60) }]]],
]) test(`${label} returns byte-identical static text and JSON with no stderr`, async () => {
  const baseline = fixture().cli;
  const { cli } = fixture({ helpContext: { maxBytes: bytes(200), load } });
  for (const json of [false, true]) assert.deepEqual(await offline(cli, 'items show', { route: { json } }), await offline(baseline, 'items show', { route: { json } }));
});

test('one total 500ms deadline includes loading and providers, aborts late work and cancels its timer', async () => {
  const host = createTestHost();
  let resolveLoad;
  let providerSignal;
  const { cli } = fixture({ helpContext: { maxBytes: bytes(200), load: () => new Promise(resolve => { resolveLoad = resolve; }) } });
  const pending = offline(cli, 'items show', { host });
  await turns();
  host.advance(400);
  resolveLoad([({ signal }) => { providerSignal = signal; return new Promise(() => {}); }]);
  await turns();
  assert.ok(providerSignal);
  assert.equal(providerSignal.aborted, false);
  host.advance(100);
  const result = await pending;
  assert.deepEqual(result, await offline(fixture().cli));
  assert.equal(providerSignal.aborted, true);
  assert.deepEqual(host.calls.filter(x => x.kind === 'sleep').map(x => x.duration), [500]);
});

test('successful blocks are bounded in aggregate and preserve structured JSON help', async () => {
  const host = createTestHost();
  const { cli } = fixture({ helpContext: { deadline: 25, maxBytes: bytes(200), maxBlocks: 3, load: async () => [async () => [{ text: 'One' }, { text: 'Two' }], async () => [{ text: 'Three' }]] } });
  const result = await offline(cli, 'items show', { host, route: { json: true } });
  const data = JSON.parse(result.stdout);
  assert.deepEqual(data.context, [{ text: 'One' }, { text: 'Two' }, { text: 'Three' }]);
  assert.equal(data.path, 'items show');
  host.advance(25);
  assert.equal(result.stderr, '');
});

test('parent cancellation returns static help and does not invoke a provider after late resolution', async () => {
  let resolveLoad;
  let calls = 0;
  const controller = new AbortController();
  const { cli } = fixture({ helpContext: { maxBytes: bytes(200), load: () => new Promise(resolve => { resolveLoad = resolve; }) } });
  const pending = offline(cli, 'items show', { signal: controller.signal });
  await turns();
  controller.abort();
  assert.deepEqual(await pending, await offline(fixture().cli));
  resolveLoad([async () => { calls++; return [{ text: 'Too late' }]; }]);
  await turns();
  assert.equal(calls, 0);
});

for (const stage of ['load', 'provider']) test(`native deadline silently falls back during slow ${stage}`, async () => {
  let finish;
  const slow = new Promise(resolve => { finish = resolve; });
  const { cli } = fixture({ helpContext: { deadline: 1, maxBytes: bytes(200), load: stage === 'load' ? () => slow : async () => [() => slow] } });
  const result = await offline(cli);
  assert.deepEqual(result, await offline(fixture().cli));
  finish(stage === 'load' ? [async () => [{ text: 'Late' }]] : [{ text: 'Late' }]);
  await turns();
});

test('lower block cap and aggregate byte cap reject whole enrichment', async () => {
  for (const helpContext of [
    { maxBytes: bytes(200), maxBlocks: 1, load: async () => [async () => [{ text: 'One' }], async () => [{ text: 'Two' }]] },
    { maxBytes: bytes(100), load: async () => [async () => [{ text: 'a'.repeat(45) }, { text: 'b'.repeat(45) }]] },
  ]) assert.deepEqual(await offline(fixture({ helpContext }).cli), await offline(fixture().cli));
});

test('elapsed deadline is enforced even when provider work blocks timer callbacks', async () => {
  let now = 0;
  const host = { ...createTestHost(), now: () => now, sleep: async () => new Promise(() => {}) };
  const { cli } = fixture({ helpContext: { deadline: 10, maxBytes: bytes(200), load: async () => [async () => { now = 11; return [{ text: 'Too late' }]; }] } });
  assert.deepEqual(await offline(cli, 'items show', { host }), await offline(fixture().cli));
});

const { writeCommandReference } = await import('cli-for-agents/runtime');
const fs = await import('node:fs/promises');
const { resolve: resolvePath, join } = await import('node:path');
const { spawnSync } = await import('node:child_process');
const { createReferenceCli } = await import('../scripts/fixtures/reference-cli.mjs');
const markerDocument = (body = '') => `Handwritten prefix\n<!-- BEGIN GENERATED COMMAND REFERENCE -->\n${body}<!-- END GENERATED COMMAND REFERENCE -->\nHandwritten suffix\n`;
async function referenceFixture(t, options = {}) {
  await fs.mkdir('.cc/temp', { recursive: true });
  const directory = await fs.mkdtemp(resolvePath('.cc/temp/help-reference-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const docs = join(directory, 'docs');
  await fs.mkdir(docs);
  await fs.writeFile(join(docs, 'guide.md'), 'Guide');
  const target = join(directory, 'reference.md');
  await fs.writeFile(target, markerDocument());
  const module = join(directory, 'fixture.mjs');
  const writeFixture = async (changes = {}) => fs.writeFile(module, `import { createReferenceCli } from ${JSON.stringify(new URL('../scripts/fixtures/reference-cli.mjs', import.meta.url).href)};\nexport default createReferenceCli(${JSON.stringify({ documentationDirectory: docs, ...options, ...changes })});\n`);
  await writeFixture();
  const run = (...args) => spawnSync(process.execPath, ['scripts/generate-reference.mjs', '--fixture', module, '--file', target, ...args], { encoding: 'utf8', timeout: 10000 });
  return { directory, docs, target, module, run, writeFixture };
}

test('actual reference executable writes only named markers; check detects declaration/rule drift and regeneration clears it', async t => {
  const f = await referenceFixture(t);
  assert.equal(f.run().status, 0, 'write must generate the actual commandReference block');
  const generated = await fs.readFile(f.target, 'utf8');
  const cli = createReferenceCli({ documentationDirectory: f.docs });
  assert.equal(generated, markerDocument(commandReference(cli)));
  const before = await fs.stat(f.target);
  assert.equal(f.run('--check').status, 0);
  assert.equal((await fs.stat(f.target)).mtimeMs, before.mtimeMs);
  await f.writeFixture({ extraFlag: true, ruleText: 'Review the record first.' });
  assert.equal(f.run('--check').status, 1, 'changed declarations must report drift');
  assert.equal(await fs.readFile(f.target, 'utf8'), generated, 'check never writes');
  assert.equal(f.run().status, 0);
  assert.equal(f.run('--check').status, 0);
  const updated = await fs.readFile(f.target, 'utf8');
  assert.match(updated, /--label/);
  assert.match(updated, /Review the record first/);
  assert.match(updated, /RECORD_MISSING/);
});

for (const mode of ['write', 'check']) for (const failure of ['missing', 'outside', 'directory', 'missing-root']) test(`actual ${mode} refuses ${failure} documentation references before touching its target`, async t => {
  const f = await referenceFixture(t);
  if (failure === 'missing') await fs.rm(join(f.docs, 'guide.md'));
  if (failure === 'outside') {
    await fs.writeFile(join(f.directory, 'outside.md'), 'Outside');
    await fs.rm(join(f.docs, 'guide.md'));
    await fs.symlink(join(f.directory, 'outside.md'), join(f.docs, 'guide.md'));
  }
  if (failure === 'directory') { await fs.rm(join(f.docs, 'guide.md')); await fs.mkdir(join(f.docs, 'guide.md')); }
  if (failure === 'missing-root') await fs.rm(f.docs, { recursive: true });
  const before = await fs.readFile(f.target, 'utf8');
  const result = f.run(...(mode === 'check' ? ['--check'] : []));
  assert.equal(result.status, 1);
  assert.match(result.stderr, failure === 'outside' ? /outside_documentation_root/ : failure === 'missing-root' ? /missing_documentation_root/ : /missing_reference/);
  assert.equal(await fs.readFile(f.target, 'utf8'), before);
});

test('library reference writer uses the injected host and check never requests replacement', async () => {
  let target = markerDocument();
  let writes = 0;
  let loads = 0;
  const base = createTestHost({ files: { '/docs/guide.md': 'Guide' } });
  const host = { files: { ...base.files, read: async (_path, limit) => { const data = new TextEncoder().encode(target); assert.ok(data.length <= limit); return data; }, replace: async (_path, data) => { target = new TextDecoder().decode(data); writes++; } } };
  const options = { path: '/reference.md', marker: 'COMMAND REFERENCE', mode: 'check', host: async () => { loads++; return host; }, signal: new AbortController().signal };
  const { cli } = fixture();
  assert.deepEqual(await writeCommandReference(cli, options), { ok: true, checked: 1, issues: [], changed: true });
  assert.equal(writes, 0);
  assert.equal(loads, 1);
  assert.equal((await writeCommandReference(cli, { ...options, mode: 'write' })).changed, true);
  assert.equal(target, markerDocument(commandReference(cli)));
  assert.equal(writes, 1);
  assert.equal((await writeCommandReference(cli, { ...options, mode: 'write' })).changed, false);
  assert.equal(writes, 1);
});

for (const content of ['No markers\n', markerDocument() + markerDocument(), '<!-- END GENERATED COMMAND REFERENCE -->\n<!-- BEGIN GENERATED COMMAND REFERENCE -->\n', markerDocument('<!-- BEGIN GENERATED OTHER -->\n')]) test('actual tool refuses stale, duplicate, reversed or nested markers', async t => {
  const f = await referenceFixture(t);
  await fs.writeFile(f.target, content);
  for (const args of [[], ['--check']]) {
    const result = f.run(...args);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /marker/i);
    assert.equal(await fs.readFile(f.target, 'utf8'), content);
  }
});

test('reference tool handles CRLF, bounded reads and canonical in-root symlinks', async t => {
  const f = await referenceFixture(t);
  await fs.rename(join(f.docs, 'guide.md'), join(f.docs, 'real.md'));
  await fs.symlink('real.md', join(f.docs, 'guide.md'));
  await fs.writeFile(f.target, markerDocument().replaceAll('\n', '\r\n'));
  assert.equal(f.run().status, 0);
  const generated = await fs.readFile(f.target, 'utf8');
  assert.ok(!/(?<!\r)\n/u.test(generated));
  assert.equal(f.run('--check').status, 0);
  const result = f.run('--check', '--max-bytes', '10');
  assert.equal(result.status, 2);
  assert.equal(await fs.readFile(f.target, 'utf8'), generated);
});

test('exit-code text, JSON and references share numeric exits and catalog entries', async () => {
  const { cli } = fixture();
  const result = await offline(cli, '', { route: { route: 'exit-codes', json: true } });
  const value = JSON.parse(result.stdout);
  assert.deepEqual(value.exits.map(entry => entry.code), [0, 1, 2, 3, 4]);
  assert.equal(value.errors.AUTH.exitCode, 3);
  const text = (await offline(cli, '', { route: { route: 'exit-codes' } })).stdout;
  assert.match(text, /3: connection/);
  assert.ok(commandReference(cli).includes(text));
});

test('validation twin help preserves source flow context', () => {
  const cli = createReferenceCli();
  assert.equal(helpNode(cli, 'records validate').flows[0]?.id, 'record-update');
});

test('self-contained input help explains required alternatives, credential fallbacks and file bounds', () => {
  const { options } = fixture();
  const command = options.family.defineCommand({ path: 'ingest', summary: 'Ingest', description: 'Ingest text', requires: 'none', effects: 'read', args: [{ name: 'source', description: 'Raw document', value: { kind: 'file', maxBytes: bytes(100) } }], flags: { body: { description: 'Body', value: { kind: 'string' }, required: true, fileSource: { maxBytes: bytes(30) } }, token: { description: 'Token', value: { kind: 'string' }, required: true, secret: true, credential: { env: 'TOKEN' } } } }, { examples: [{ args: { source: '-' }, flags: { 'body-file': 'body.txt' }, why: 'Ingest bounded text' }], handler: async () => { throw Error('offline'); } });
  const cli = createCli({ ...options, commands: [...options.commands, command] });
  const node = helpNode(cli, 'ingest');
  assert.equal(node.arguments[0].value.maxBytes, 100);
  assert.equal(node.flags.find(flag => flag.name === 'body').fileAlternative.name, 'body-file');
  assert.match(node.usage[0], /--body <string> \| --body-file <path>/);
  assert.match(node.usage[0], /env TOKEN/);
  assert.match(commandReference(cli), /100 bytes/);
  assert.match(commandReference(cli), /30 bytes/);
});

test('named marker cannot be nested inside a different generated block', async t => {
  const f = await referenceFixture(t);
  const source = `<!-- BEGIN GENERATED OUTER -->\n${markerDocument()}<!-- END GENERATED OUTER -->\n`;
  await fs.writeFile(f.target, source);
  const result = f.run();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /marker/i);
  assert.equal(await fs.readFile(f.target, 'utf8'), source);
});

test('reference replacement preserves document permissions and cleans up staging', async t => {
  const f = await referenceFixture(t);
  await fs.chmod(f.target, 0o644);
  assert.equal(f.run().status, 0);
  assert.equal((await fs.stat(f.target)).mode & 0o777, 0o644);
  assert.ok(!(await fs.readdir(f.directory)).some(name => name.startsWith('.reference-')));
});

test('reference replacement refuses cancellation and symlinked targets without leaving staging', async t => {
  const f = await referenceFixture(t);
  const { createReferenceHost } = await import('../dist/internal/reference-host.js');
  const host = await createReferenceHost();
  const data = new TextEncoder().encode(markerDocument());
  await assert.rejects(() => host.files.replace(f.target, data, AbortSignal.abort()), /abort/i);
  await fs.rename(f.target, join(f.directory, 'real.md'));
  await fs.symlink('real.md', f.target);
  await assert.rejects(() => host.files.replace(f.target, data, new AbortController().signal), /symlink|regular file/i);
  assert.ok(!(await fs.readdir(f.directory)).some(name => name.startsWith('.reference-')));
});

test('text hubs stay terse and leaf shared flags use one root pointer', async () => {
  const { cli } = fixture();
  const root = (await offline(cli, '')).stdout;
  assert.match(root, /--profile <string>/);
  assert.ok(!root.includes('Inspect item'));
  for (const path of ['items', 'items show']) {
    const text = (await offline(cli, path)).stdout;
    assert.match(text, /Global flags: tool --help/);
    assert.ok(!text.includes('--profile <string>'));
  }
  assert.ok(helpNode(cli, 'items show').flags.some(flag => flag.name === 'profile'), 'structured help retains complete acceptance inventory');
  const invalid = resolve(cliRegistry(cli), ['items', 'absent', '--help']);
  assert.equal(invalid.kind, 'invalid');
  assert.match(invalid.issues[0].message, /tool items --help/);
  assert.match(invalid.issues[0].message, /items show/);
});

test('global file alternatives are derived and accepted at offline hubs as well as leaves', () => {
  const { options } = fixture();
  const family = commandsFor()({ errors: defineErrors({}), globalFlags: { message: { description: 'Global message', value: { kind: 'string' }, fileSource: { maxBytes: bytes(100) } } } });
  const doctor = family.defineCommand({ path: 'doctor', summary: 'Doctor', description: 'Diagnose', requires: 'none', effects: 'read', args: [], flags: {} }, { examples: [{ why: 'Diagnose' }], handler: async () => { throw Error('offline'); } });
  const cli = createCli({ ...options, family, commands: [doctor], groups: [], flows: [], doctor: invocation(doctor, {}) });
  assert.ok(helpNode(cli, '').flags.some(flag => flag.name === 'message-file'));
  assert.equal(resolve(cliRegistry(cli), ['--message-file', 'message.txt', '--help']).kind, 'offline');
});

test('the shipped default fixture reference has no drift through the actual executable', () => {
  const result = spawnSync(process.execPath, ['scripts/generate-reference.mjs', '--check'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
});

test('unresolvable filesystem references produce contextual validation issues through write and check', async t => {
  const f = await referenceFixture(t);
  await fs.rm(join(f.docs, 'guide.md'));
  await fs.symlink('guide.md', join(f.docs, 'guide.md'));
  for (const args of [[], ['--check']]) {
    const result = f.run(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid_reference: records show: guide.md/);
    assert.equal(await fs.readFile(f.target, 'utf8'), markerDocument());
  }
});

for (const shape of ['scalar', 'optional', 'variadic']) test(`${shape} positional enum choices appear in text, JSON and validation-twin references`, async () => {
  const { options } = fixture();
  const values = ['draft', 'ready'];
  const command = options.family.defineCommand({ path: 'choose', summary: 'Choose', description: 'Choose states', requires: 'none', effects: 'write',
    args: [{ name: 'state', description: 'State', value: { kind: 'enum', values }, ...(shape === 'optional' ? { required: false } : {}), ...(shape === 'variadic' ? { variadic: true } : {}) }], flags: {}, payload: { maxBytes: bytes(100), validatePath: 'check-choice' } },
  { examples: [{ args: { state: shape === 'variadic' ? ['draft'] : 'draft' }, file: 'payload.json', why: 'Choose a state' }], handler: async () => { throw Error('offline'); } });
  const cli = createCli({ ...options, commands: [...options.commands, command] });
  for (const path of ['choose', 'check-choice']) {
    const json = JSON.parse((await offline(cli, path, { route: { json: true } })).stdout);
    assert.deepEqual(json.arguments[0].value.values, values);
    const text = (await offline(cli, path)).stdout;
    assert.match(text, /choices: draft, ready/);
    assert.ok(commandReference(cli).includes(text));
  }
});

for (const output of ['artifact-eligible', 'binary']) test(`${output} output help describes a destination in the shared input model`, async () => {
  const { options } = fixture();
  const command = options.family.defineCommand({ path: 'export', summary: 'Export', description: 'Export data', requires: 'none', effects: 'read', args: [], flags: {},
    ...(output === 'binary' ? { output: 'binary' } : { levels: { full: { output } } }) }, { examples: [{ why: 'Supply the declared inputs' }], handler: async () => { throw Error('offline'); } });
  const cli = createCli({ ...options, commands: [...options.commands, command] });
  const node = JSON.parse((await offline(cli, 'export', { route: { json: true } })).stdout);
  const out = node.flags.find(flag => flag.name === 'out');
  assert.deepEqual(out.value, { kind: 'output-path' });
  assert.equal(out.valuePlaceholder, '<path>');
  const text = (await offline(cli, 'export')).stdout;
  const line = text.split('\n').find(line => line.startsWith('--out '));
  assert.match(line, /output destination/);
  assert.doesNotMatch(line, /stdin|max 0 bytes/);
  assert.ok(commandReference(cli).includes(text));
  const parsed = resolve(cliRegistry(cli), ['export', ...(output === 'binary' ? [] : ['--full']), '--out', 'export.dat']);
  assert.equal(parsed.kind, 'leaf');
  assert.equal(parsed.invocation.input.out, 'export.dat');
  assert.deepEqual(parsed.invocation.input.sources, []);
});
test('static artifact policy appears in generated --out help with all destination rules', async () => {
  const { options } = fixture();
  const cli = createCli({ ...options, output: { artifacts: { directory: '/var/tool-artifacts', forbiddenRoots: [] } } });
  const description = helpNode(cli, 'items show').flags.find(flag => flag.name === 'out').description;
  for (const expected of [/\/var\/tool-artifacts/, /relative/i, /inside/i, /parent.*exist/i, /identical|overwrite/i]) {
    assert.match(description, expected);
  }
  assert.match((await offline(cli, 'items show')).stdout, /\/var\/tool-artifacts/);
});

for (const mode of ['write', 'check']) test(`actual ${mode} rejects a POSIX backslash-named sibling symlink target`, { skip: process.platform === 'win32' }, async t => {
  const f = await referenceFixture(t);
  const outside = `${f.docs}\\outside`;
  await fs.mkdir(outside);
  await fs.writeFile(join(outside, 'guide.md'), 'Outside the documentation root');
  await fs.rm(join(f.docs, 'guide.md'));
  await fs.symlink(join(outside, 'guide.md'), join(f.docs, 'guide.md'));
  const result = f.run(...(mode === 'check' ? ['--check'] : []));
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /outside_documentation_root/);
  assert.equal(await fs.readFile(f.target, 'utf8'), markerDocument());
});

for (const mode of ['write', 'check']) test(`actual ${mode} preserves a literal trailing backslash in a POSIX documentation root`, { skip: process.platform === 'win32' }, async t => {
  const f = await referenceFixture(t);
  const docs = `${f.docs}\\`;
  await fs.rename(f.docs, docs);
  await f.writeFixture({ documentationDirectory: docs });
  const generated = markerDocument(commandReference(createReferenceCli({ documentationDirectory: docs })));
  if (mode === 'check') await fs.writeFile(f.target, generated);
  const result = f.run(...(mode === 'check' ? ['--check'] : []));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await fs.readFile(f.target, 'utf8'), generated);
});

for (const mode of ['write', 'check']) test(`actual ${mode} never substitutes a neighboring root for a backslash-named directory`, { skip: process.platform === 'win32' }, async t => {
  const f = await referenceFixture(t);
  const docs = `${f.docs}\\`;
  await fs.mkdir(docs);
  await f.writeFixture({ documentationDirectory: docs });
  const result = f.run(...(mode === 'check' ? ['--check'] : []));
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /missing_reference/);
  assert.equal(await fs.readFile(f.target, 'utf8'), markerDocument());
});
