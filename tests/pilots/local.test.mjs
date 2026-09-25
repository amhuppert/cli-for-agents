import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { mkdtemp, rm, readFile, writeFile, mkdir, symlink, realpath, copyFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { bundleLocal } from '../../examples/local-workspace/bundle.mjs';

let scratch, executable;
before(async () => { scratch = await mkdtemp(join(tmpdir(), 'local-pilot-')); executable = await bundleLocal('.cc/temp/local-pilot/bundle'); });
after(async () => { if (scratch) await rm(scratch, { recursive: true, force: true }); });
function run(root, argv, options = {}) {
  const result = spawnSync(process.execPath, [options.executable ?? executable, ...argv], {
    env: { ...process.env, WORKSPACE_HOME: root, ...options.env }, encoding: 'utf8',
    input: options.input, timeout: 15000, maxBuffer: 128 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.ok(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) <= 8192, 'Every live response must respect its UTF-8 budget');
  if (argv.includes('--json')) assert.equal(result.stderr, '');
  return { ...result, envelope: argv.includes('--json') ? JSON.parse(result.stdout) : undefined };
}
function data(result) { assert.equal(result.status, 0, result.stdout + result.stderr); assert.equal(result.envelope.payload.kind, 'inline'); return result.envelope.payload.data; }

test('init without an app creates a real store that a fresh query reads', () => {
  const root = join(scratch, 'smoke');
  data(run(root, ['init', '--json']));
  const result = data(run(root, ['query', '--json']));
  assert.deepEqual(result.items.map(item => item.id), ['n1', 'n2']);
  assert.equal(result.omission.truncated, true);
});

test('local command surface supports structured reads, pure twins, durable writes, detail and binary export', () => {
  const root = join(scratch, 'surface');
  data(run(root, ['doctor', '--json']));
  data(run(root, ['init', '--json']));
  const payload = JSON.stringify({ nodeId: 'n1', text: 'Verified claim' });
  assert.equal(run(root, ['claim', 'validate', '--file', '-', '--json'], { input: payload }).status, 0);
  assert.equal(data(run(root, ['show', 'n1', '--context', '--full', '--json'])).claims.length, 0);
  const applied = data(run(root, ['claim', 'apply', '--file', '-', '--json'], { input: payload }));
  assert.equal(applied.receipt.id, 'r1');
  assert.equal(data(run(root, ['show', 'n1', '--context', '--full', '--json'])).claims[0].text, 'Verified claim');
  assert.equal(data(run(root, ['answer-check', '--file', '-', '--json'], { input: payload })).matches, true);
  data(run(root, ['update', 'n1', '--title', 'New title', '--json']));
  assert.equal(data(run(root, ['show', 'n1', '--json'])).title, 'New title');
  data(run(root, ['ingest', 'n1', '--source', '-', '--json'], { input: 'Raw 😀 document' }));
  assert.equal(data(run(root, ['show', 'n1', '--context', '--full', '--json'])).body, 'Raw 😀 document');
  const exported = run(root, ['export', 'n1', '--json']);
  assert.equal(exported.status, 0, exported.stdout + exported.stderr);
  assert.equal(exported.envelope.payload.kind, 'artifact');
});


test('default, repeat, variadic, derived files and stdin retain the intended filters', async () => {
  const root = join(scratch, 'inputs');
  data(run(root, ['init', '--json']));
  const query = (...args) => data(run(root, ['query', ...args, '--json']));
  assert.deepEqual(query('--tag', 'work', '--tag', 'shared').items.map(row => row.id), ['n1', 'n2']);
  assert.deepEqual(query('Al', 'pha').items.map(row => row.id), ['n1']);
  const file = join(scratch, 'filter.txt');
  await writeFile(file, 'Alpha');
  assert.deepEqual(query('--text-file', file).items, query('--text', 'Alpha').items);
  assert.deepEqual(data(run(root, ['query', '--text-file', '-', '--json'], { input: 'Alpha' })).items, query('--text', 'Alpha').items);
  assert.deepEqual(query('--cursor', '2').items.map(row => row.id), ['n3', 'n4']);
  assert.equal(query('--cursor', '2').omission.truncated, false);
  assert.equal(run(root, ['query', '--text', 'Alpha', '--text-file', file, '--json']).status, 2);
  assert.equal(run(root, ['show', 'n1', '--full', '--json']).status, 2);
  assert.deepEqual(Object.keys(data(run(root, ['show', 'n1', '--context', '--json']))).sort(), ['id', 'tags', 'title']);
});

test('payload twin is byte-pure and schema failures precede workspace acquisition', async () => {
  const root = join(scratch, 'purity');
  data(run(root, ['init', '--json']));
  const statePath = join(root, 'data/state.json');
  const before = await readFile(statePath);
  const payload = join(scratch, 'claim.json');
  await writeFile(payload, JSON.stringify({ nodeId: 'n2', text: 'Saved claim' }));
  const twin = run(root, ['claim', 'validate', '--file', payload, '--json']);
  assert.equal(twin.status, 0, twin.stdout);
  assert.equal(twin.envelope.effect, 'read');
  assert.deepEqual(data(twin), { valid: true, payloadHash: createHash('sha256').update(await readFile(payload)).digest('hex'),
    preview: { nodeId: 'n2', nodeTitle: 'Beta', characters: 11, existingClaims: 0 } });
  assert.ok(twin.envelope.hint.startsWith('Apply the validated payload: workspace claim apply ') && twin.envelope.hint.includes(payload), twin.envelope.hint);
  assert.deepEqual(await readFile(statePath), before);
  const applied = run(root, ['claim', 'apply', '--file', payload, '--json']);
  assert.equal(data(applied).receipt.id, 'r1');
  assert.deepEqual(applied.envelope.recovery.references, [{ kind: 'receipt', id: 'r1' }]);
  assert.equal(data(run(root, ['answer-check', '--file', payload, '--json'])).matches, true);
  const fresh = data(run(root, ['show', 'n2', '--context', '--full', '--json']));
  assert.deepEqual(fresh.claims, [{ nodeId: 'n2', text: 'Saved claim', id: 'r1' }]);
  for (const command of [['claim', 'validate'], ['claim', 'apply'], ['answer-check']]) {
    const invalid = run(join(scratch, 'absent'), [...command, '--file', '-', '--json'], { input: '{}' });
    assert.equal(invalid.status, 2);
    assert.equal(invalid.envelope.error.code, 'KERNEL_INPUT');
    assert.deepEqual(invalid.envelope.error.issues[0].path, ['nodeId']);
  }
  assert.deepEqual(data(run(root, ['show', 'n2', '--context', '--full', '--json'])).claims, fresh.claims);
});

function textFields(result) {
  assert.equal(result.status, 0, result.stderr);
  return Object.fromEntries(result.stdout.trim().split('\n').filter(line => !line.startsWith('hint:')).map(line => {
    const index = line.indexOf(': ');
    return [line.slice(0, index), JSON.parse(line.slice(index + 2))];
  }));
}
test('custom primary renderers disclose the same fields and values in text and JSON', () => {
  const root = join(scratch, 'parity');
  data(run(root, ['init', '--json']));
  for (const command of [['show', 'n1'], ['query']]) {
    assert.deepEqual(textFields(run(root, command)), data(run(root, [...command, '--json'])));
  }
});

test('raw file/stdin ingestion and binary export preserve exact finite bytes and hashes', async () => {
  const root = join(scratch, 'binary');
  data(run(root, ['init', '--json']));
  await assert.rejects(stat(join(root, 'artifacts')), { code: 'ENOENT' }, 'initialization leaves artifact setup to the kernel');
  const raw = Buffer.from('Raw UTF-8 😀\nwith NUL \0 and tabs\tend');
  const file = join(scratch, 'raw.txt');
  await writeFile(file, raw);
  data(run(root, ['ingest', 'n1', '--source', file, '--json']));
  for (const args of [[], ['--out', 'chosen.bin']]) {
    const result = run(root, ['export', 'n1', ...args, '--json']);
    assert.equal(result.status, 0, result.stdout);
    const manifest = result.envelope.payload.artifact;
    assert.equal(manifest.contains, 'binary');
    assert.equal(manifest.format, 'binary');
    assert.equal(manifest.bytes, raw.length);
    assert.equal(manifest.sha256, createHash('sha256').update(raw).digest('hex'));
    assert.deepEqual(await readFile(manifest.path), raw);
  }
  data(run(root, ['ingest', 'n1', '--source', '-', '--json'], { input: raw }));
  assert.equal(data(run(root, ['show', 'n1', '--context', '--full', '--json'])).body, raw.toString());
  const title = join(scratch, 'title.txt');
  await writeFile(title, 'Derived title');
  data(run(root, ['update', 'n1', '--title-file', title, '--json']));
  assert.equal(data(run(root, ['show', 'n1', '--json'])).title, 'Derived title');
});

test('runtime artifact policy refuses canonical dataset roots and symlink ancestors', async () => {
  const root = join(scratch, 'policy');
  data(run(root, ['init', '--json']));
  const before = await readFile(join(root, 'data/state.json'));
  const alias = join(root, 'dataset-alias');
  await symlink(join(root, 'data'), alias);
  await mkdir(join(root, 'artifacts'));
  await symlink(join(root, 'data'), join(root, 'artifacts', 'escape'));
  for (const directory of [join(root, 'data'), alias, join(root, 'artifacts', '..', 'data')]) {
    const refused = run(root, ['export', 'n1', '--json'], { env: { WORKSPACE_ARTIFACTS: directory } });
    assert.equal(refused.status, 1);
    assert.equal(refused.envelope.error.code, 'KERNEL_OUTPUT');
  }
  assert.equal(run(root, ['export', 'n1', '--out', 'escape/leak.bin', '--json']).status, 1);
  assert.deepEqual(await readFile(join(root, 'data/state.json')), before);
  const alternate = join(root, 'alternate');
  await mkdir(alternate);
  const exported = run(root, ['export', 'n1', '--json'], { env: { WORKSPACE_ARTIFACTS: alternate } });
  assert.equal(exported.status, 0, exported.stdout);
  assert.ok(exported.envelope.payload.artifact.path.startsWith(await realpath(alternate) + '/'));
});

test('bundled executable runs all seven inherited cases against the local CLI', () => {
  const result = data(run(join(scratch, 'contracts'), ['contracts', '--json']));
  assert.deepEqual(result.passed, ['offline-paths', 'schema-issue-survival', 'single-guidance-arbitration', 'unknown-totals', 'shell-safe-references', 'unicode-spill', 'operation-recovery']);
});

test('inherited callback evidence exposes each local production scenario', async () => {
  const file = await bundleLocal('.cc/temp/local-pilot/contracts', 'contracts.fixture.ts');
  const fixture = await import(file);
  assert.equal((await fixture.runLocalContracts()).length, 7);
});


test('fresh processes retain applied recovery and required guidance when artifact delivery fails', async () => {
  const root = join(scratch, 'live-recovery');
  data(run(root, ['init', '--json']));
  const payload = JSON.stringify({ nodeId: 'n1', text: '😀'.repeat(4000) });
  // A regular file cannot become the artifact directory; missing directories are created.
  const unusable = join(root, 'artifact-file');
  await writeFile(unusable, 'not a directory');
  const failed = run(root, ['claim', 'apply', '--file', '-', '--json'], { input: payload, env: { WORKSPACE_ARTIFACTS: unusable } });
  assert.equal(failed.status, 1);
  assert.equal(failed.envelope.error.code, 'KERNEL_OUTPUT');
  assert.equal(failed.envelope.effect, 'applied');
  assert.deepEqual(failed.envelope.recovery.references, [{ kind: 'receipt', id: 'r1' }]);
  assert.equal(failed.envelope.instruction, 'Inspect saved state before another mutation.');
  assert.match(failed.envelope.error.why, /is a file, not a directory/);
  assert.equal(data(run(root, ['answer-check', '--file', '-', '--json'], { input: payload })).matches, true);
  const saved = JSON.parse(await readFile(join(root, 'data/state.json'), 'utf8'));
  assert.equal(saved.receipts.length, 1, 'Recovery inspection must not replay the mutation');
  // A small response needs no artifact, so an unusable policy adds no diagnostic.
  const domainFailure = run(root, ['show', 'missing-node', '--json'], { env: { WORKSPACE_ARTIFACTS: unusable } });
  assert.equal(domainFailure.status, 1);
  assert.equal(domainFailure.envelope.error.code, 'NODE_MISSING');
  assert.deepEqual(domainFailure.envelope.error.secondary, []);
});

test('bootstrap needs no app, offline paths need no workspace, and copied bundle is self-contained', async () => {
  const copied = join(scratch, 'standalone.mjs');
  await copyFile(executable, copied);
  for (const argv of [['--help'], ['--version'], ['exit-codes'], ['claim', 'validate', '--help']]) {
    assert.equal(run(join(scratch, 'absent'), [...argv, '--json'], { executable: copied }).status, 0);
  }
  const initialized = data(run('', ['init', '--json'], { executable: copied }));
  try {
    assert.equal(data(run(initialized.root, ['doctor', '--json'], { executable: copied })).initialized, true);
    assert.equal(data(run(initialized.root, ['query', '--json'], { executable: copied })).items.length, 2);
  } finally { await rm(initialized.root, { recursive: true, force: true }); }
});
