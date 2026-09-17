import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { startService } from './remote-server.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'remote-pilot-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'remote.mjs');
  await build({ entryPoints: ['examples/remote-service/cli.mjs'], outfile: file, bundle: true, splitting: false, platform: 'node', target: 'node20', format: 'esm', minify: true, logLevel: 'silent' });
  const service = await startService();
  t.after(() => service.close());
  const children = new Set();
  const run = async (argv, env = {}, entry = file, nodeArgs = []) => {
    const child = spawn(process.execPath, [...nodeArgs, entry, ...argv], { timeout: 15000, killSignal: 'SIGKILL', env: { ...process.env, REMOTE_TOKEN: 'test-token', REMOTE_ARTIFACTS: directory, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    child.once('close', () => children.delete(child));
    t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    assert.ok(Buffer.byteLength(stdout + stderr) <= 8192);
    return { stdout, stderr, exitCode, ...(argv.includes('--json') ? { envelope: JSON.parse(stdout) } : {}) };
  };
  const remote = (argv, env) => run([...argv, '--server', service.url, '--workspace', 'selected', '--json'], env);
  return { directory, service, run, remote, children };
}
test('remote fixture has context-free diagnostics and production paged reads', async t => {
  const x = await fixture(t);
  for (const command of ['doctor', 'schema']) {
    const result = await x.run([command, '--json']);
    assert.equal(result.exitCode, 0, result.stdout + result.stderr);
    assert.equal(result.envelope.payload.data.context, 'none', 'diagnostics must report their app-free context');
  }
  const result = await x.remote(['list']);
  assert.equal(result.exitCode, 0, result.stdout + result.stderr);
  assert.deepEqual(result.envelope.payload.data.items, [{ id: 'item-1', name: 'First' }]);
  assert.equal(result.envelope.payload.data.omission.total.kind, 'unknown');
  assert.equal(result.envelope.payload.data.omission.reveal.path, 'list');
  assert.equal(x.service.requests[0].workspace, 'selected');
  assert.equal(x.service.requests[0].authorized, true);
});
test('remote fixture validates, commits once, shows detail and resumes a bounded wait', async t => {
  const x = await fixture(t);
  const input = join(x.directory, 'input.json');
  await writeFile(input, JSON.stringify({ name: 'Saved' }));
  const validated = await x.remote(['validate', '--file', input]);
  assert.equal(validated.exitCode, 0, validated.stdout + validated.stderr);
  assert.equal(x.service.items.length, 2);
  const applied = await x.remote(['apply', '--file', input]);
  assert.equal(applied.exitCode, 0, applied.stdout + applied.stderr);
  assert.equal(applied.envelope.effect, 'applied', 'mutation must report its applied effect');
  assert.equal(x.service.items.length, 3);
  assert.equal(x.service.requests.filter(request => request.method === 'POST').length, 1);
  const shown = await x.remote(['show', 'item-3']);
  assert.equal(shown.envelope.payload.data.name, 'Saved');
  const waited = await x.remote(['wait', '--delay', '0', '--cursor', '1']);
  assert.equal(waited.exitCode, 0, waited.stdout + waited.stderr);
  assert.equal(waited.envelope.payload.data.cursor, '1');
  const resumed = await x.remote(['status', '--cursor', '1']);
  assert.equal(resumed.envelope.payload.data.receipts[0].id, 'receipt-1');
});

import { readFile, readdir } from 'node:fs/promises';
import { createRemoteCli, list as listCommand } from '../../examples/remote-service/commands.mjs';
import { invocation, bytes, recoveryFacts } from 'cli-for-agents';
import { renderInvocation } from 'cli-for-agents/runtime';
import { contractTests, createContractFixtures, createTestHost, runForTest } from 'cli-for-agents/testing';
import { stopText } from '../../examples/remote-service/guidance.mjs';

test('bundled offline routes and rejected local inputs never reach the service', async t => {
  const x = await fixture(t);
  for (const argv of [['--help'], ['--version'], ['exit-codes'], ['show', '--help'], ['list', '--unexpected']]) {
    const result = await x.run([...argv, '--json']);
    assert.equal(result.exitCode, argv.includes('--unexpected') ? 2 : 0, result.stdout + result.stderr);
  }
  for (const content of ['{', '{}']) {
    const path = join(x.directory, 'bad.json'); await writeFile(path, content);
    const result = await x.remote(['apply', '--file', path]);
    assert.equal(result.exitCode, 2, result.stdout + result.stderr);
    if (content === '{}') assert.deepEqual(result.envelope.error.issues, [{ code: 'schema', message: 'Name must contain 1 to 80 characters', path: ['name'] }]);
  }
  assert.equal(x.service.requests.length, 0);
  const rejected = await x.remote(['list'], { REMOTE_TOKEN: 'wrong-token' });
  assert.equal(rejected.exitCode, 3);
  assert.equal(rejected.envelope.error.code, 'UNAUTHORIZED');
  assert.equal(rejected.envelope.error.doctor.path, 'doctor');
  assert.equal(x.service.requests.length, 1);
  assert.equal(x.service.requests[0].authorized, false);
  const accepted = await x.remote(['list', '--token', 'test-token'], { REMOTE_TOKEN: 'wrong-token' });
  assert.equal(accepted.exitCode, 0, accepted.stdout);
  assert.equal(x.service.requests[1].authorized, true);
});

test('rule stop instruction survives bundled JSON/text spill and handler conflict', async t => {
  const x = await fixture(t);
  const json = await x.remote(['show', 'item-1', '--full']);
  assert.equal(json.exitCode, 0, json.stdout);
  assert.equal(json.envelope.instruction, stopText);
  assert.equal(json.envelope.hint, undefined);
  assert.equal(json.envelope.payload.kind, 'artifact');
  const manifest = json.envelope.payload.artifact;
  const artifact = await readFile(manifest.path);
  assert.equal(artifact.length, manifest.bytes);
  assert.equal(JSON.parse(artifact).payload.data.content, x.service.state.content);
  const text = await x.run(['show', 'item-1', '--full', '--server', x.service.url]);
  assert.equal(text.exitCode, 0, text.stderr);
  assert.ok(text.stdout.includes(stopText));
  const conflict = await x.remote(['show', 'item-1', '--full', '--conflict']);
  assert.equal(conflict.exitCode, 1);
  assert.equal(conflict.envelope.error.code, 'KERNEL_GUIDANCE');
  assert.match(conflict.envelope.instruction, /^Stop and report/);
  assert.equal(conflict.envelope.hint, undefined);
  assert.equal(conflict.envelope.payload.kind, 'artifact');
});

// All seven callbacks execute this consumer's registry. Domain callbacks use the
// same live HTTP service as the executable; the testkit observes public runCli.
const inheritedNames = ['offline-paths', 'schema-issue-survival', 'single-guidance-arbitration', 'unknown-totals', 'shell-safe-references', 'unicode-spill', 'operation-recovery'];
for (const name of inheritedNames) test(`remote inherited contract: ${name}`, async t => {
  const x = await fixture(t);
  const cli = createRemoteCli({ directory: '/artifacts' });
  const host = () => createTestHost({ files: { '/artifacts/.keep': '', '/bad.json': '{}', '/input.json': '{"name":"Saved"}' } });
  const run = (argv, injected = host(), format = 'json', service = x.service) => runForTest(cli, [...argv, '--server', service.url, '--workspace', 'selected'], { host: injected, format, env: { REMOTE_TOKEN: 'test-token' } });
  const pair = async (argv, injected) => ({ json: await run(argv, injected), text: await run(argv, injected, 'text') });
  const fixtures = {
    'offline-paths': async () => {
      const value = await createContractFixtures(cli)['offline-paths']();
      assert.equal(x.service.requests.length, 0);
      return value;
    },
    'schema-issue-survival': async () => {
      const value = await pair(['apply', '--file', '/bad.json']);
      assert.equal(x.service.requests.length, 0);
      return { ...value, expectedIssues: [{ code: 'schema', message: 'Name must contain 1 to 80 characters', path: ['name'] }] };
    },
    'single-guidance-arbitration': async () => {
      const value = await pair(['show', 'item-1', '--conflict']);
      assert.equal(x.service.requests.length, 2);
      return value;
    },
    'unknown-totals': async () => ({ json: await run(['list']), continuation: invocation(listCommand, { flags: { cursor: '1', server: x.service.url, workspace: 'selected' } }), returned: 1 }),
    'shell-safe-references': async () => {
      const reference = invocation(listCommand, { flags: { cursor: "a b' $(touch nope); `echo nope`", server: x.service.url, workspace: 'selected' } });
      // The server supplies a cursor verbatim; only the public invocation renderer quotes it.
      x.service.state.nextCursor = reference.flags.cursor;
      return { json: await run(['list']), reference, executable: 'remote-service', rendered: renderInvocation(reference, 'remote-service') };
    },
    'unicode-spill': async () => {
      const injected = host();
      x.service.state.content = '';
      const empty = await run(['show', 'item-1', '--full'], injected);
      const remaining = 8192 - Buffer.byteLength(empty.stdout);
      x.service.state.content = '😀'.repeat(Math.floor(remaining / 4)) + 'x'.repeat(remaining % 4);
      const inline = await run(['show', 'item-1', '--full'], injected);
      x.service.state.content += '😀';
      const expectedSpill = JSON.stringify({ ...inline.envelope, payload: { kind: 'inline', data: { ...inline.envelope.payload.data, content: x.service.state.content } } }) + '\n';
      const spilled = await run(['show', 'item-1', '--full'], injected);
      return { inline, spilled, budget: bytes(8192), expectedSpill, artifactBytes: injected.filesSnapshot()[spilled.artifacts[0]?.path] ?? new Uint8Array() };
    },
    'operation-recovery': async () => {
      const injected = host();
      const failing = { ...injected, files: { ...injected.files, writeAtomic: async () => { throw Error('Injected publication failure'); } } };
      x.service.state.mutationContent = '😀'.repeat(4000);
      const json = await run(['apply', '--file', '/input.json'], failing);
      const fresh = await startService();
      t.after(() => fresh.close());
      fresh.state.mutationContent = x.service.state.mutationContent;
      const text = await run(['apply', '--file', '/input.json'], failing, 'text', fresh);
      for (const service of [x.service, fresh]) {
        assert.equal(service.items.length, 3);
        assert.equal(service.requests.filter(request => request.method === 'POST').length, 1);
      }
      return { json, text, effect: 'applied', recovery: recoveryFacts([{ kind: 'receipt', id: 'receipt-1' }]), instruction: stopText };
    },
  };
  await contractTests(cli, fixtures).find(check => check.name === name).run();
});

import { sourceInventory } from '../../scripts/distribution/architecture.mjs';
test('remote declarations stay lazy and all primary output uses main', async t => {
  const x = await fixture(t);
  const inventory = await sourceInventory(['src', 'examples/remote-service']);
  for (const [path, item] of Object.entries(inventory)) {
    if (path.startsWith('examples/remote-service/')) assert.deepEqual(item.output, [], `${path} bypasses bounded delivery`);
  }
  for (const argv of [['--help'], ['show', '--help'], ['--version'], ['exit-codes'], ['list', '--unexpected']]) {
    const trace = join(x.directory, 'imports.log');
    await writeFile(trace, '');
    await x.run(argv, { DISTRIBUTION_TRACE: trace }, resolve('examples/remote-service/cli.mjs'), ['--no-warnings', '--experimental-loader', resolve('scripts/distribution/trace-loader.mjs')]);
    const imports = await readFile(trace, 'utf8');
    assert.match(imports, /remote-service\/commands.mjs/);
    assert.doesNotMatch(imports, /remote-service\/(handlers|transport|guidance).mjs/);
  }
  await x.service.close();
  for (const command of ['doctor', 'schema']) {
    const result = await x.remote([command]);
    assert.equal(result.exitCode, 0, result.stdout);
  }
  assert.equal(x.service.requests.length, 0);
});

import { runCli } from 'cli-for-agents/runtime';
async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'Expected request/lifecycle boundary was not reached');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
function assertContinuation(result, cursor) {
  assert.equal(result.exitCode, 3, result.stdout + result.stderr);
  const envelope = result.envelope ?? JSON.parse(result.stdout);
  assert.equal(envelope.error.code, 'UNAVAILABLE');
  assert.equal(envelope.error.doctor.path, 'doctor');
  assert.equal(envelope.error.continuation.path, 'status');
  assert.equal(envelope.error.continuation.flags.cursor, cursor);
  assert.equal(envelope.effect, 'read');
  assert.ok(Buffer.byteLength(result.stdout + result.stderr) <= 8192);
  assert.doesNotMatch(result.stdout, /live progress|streaming progress/i);
}
for (const cancelled of [false, true]) test(`remote wait uses injected clock and retains cursor (cancelled=${cancelled})`, async t => {
  const x = await fixture(t);
  const host = createTestHost({ files: { '/artifacts/.keep': '' }, now: 100 });
  const controller = new AbortController();
  t.after(() => controller.abort());
  const pending = runCli(createRemoteCli({ directory: '/artifacts' }), {
    argv: ['wait', '--cursor', 'cursor-7', '--delay', '1000', '--server', x.service.url, '--json'],
    env: { REMOTE_TOKEN: 'test-token' }, host, signal: controller.signal,
  });
  await until(() => host.calls.some(call => call.kind === 'sleep'));
  assert.equal(x.service.requests.length, 1);
  assert.equal(x.service.requests[0].path, '/wait');
  assert.equal(host.now(), 100);
  if (cancelled) controller.abort();
  else { host.advance(999); assert.equal(x.service.requests.length, 1); host.advance(1); }
  const result = await pending;
  if (cancelled) { assertContinuation(result, 'cursor-7'); assert.equal(x.service.requests.length, 1); }
  else {
    assert.equal(result.exitCode, 0, result.stdout);
    assert.equal(JSON.parse(result.stdout).payload.data.cursor, 'cursor-7');
    assert.equal(x.service.requests[1].path, '/status');
  }
});
for (const signal of ['SIGINT', 'SIGTERM']) test(`bundled ${signal} cancels finite wait with doctor and continuation`, async t => {
  const x = await fixture(t);
  const pending = x.remote(['wait', '--cursor', 'cursor-9', '--delay', '60000']);
  await until(() => x.service.requests.some(request => request.path === '/wait'));
  assert.equal(x.children.size, 1);
  for (const child of x.children) child.kill(signal);
  const result = await pending;
  assertContinuation(result, 'cursor-9');
  assert.equal(x.children.size, 0);
  assert.equal(x.service.requests.filter(request => request.path === '/status').length, 0);
});
test('real socket disconnect returns doctor and a runnable status continuation', async t => {
  const x = await fixture(t);
  x.service.state.disconnectWait = true;
  const result = await x.remote(['wait', '--cursor', 'resume-3', '--delay', '0']);
  assertContinuation(result, 'resume-3');
  assert.equal(x.service.requests.filter(request => request.path === '/wait').length, 1);
  const resumed = await x.remote(['status', '--cursor', result.envelope.error.continuation.flags.cursor]);
  assert.equal(resumed.exitCode, 0, resumed.stdout);
  assert.equal(resumed.envelope.payload.data.cursor, 'resume-3');
  assert.equal(x.service.receipts.length, 0);
});
for (const format of ['json', 'text']) test(`applied remote mutation survives real artifact failure without replay (${format})`, async t => {
  const x = await fixture(t);
  const input = join(x.directory, 'input.json');
  await writeFile(input, '{"name":"Persisted once"}');
  // Observe a real successful publication from an independent identical service;
  // reserve that exact destination with different bytes before this mutation.
  const seed = await fixture(t);
  const seedInput = join(seed.directory, 'input.json');
  await writeFile(seedInput, '{"name":"Persisted once"}');
  seed.service.state.mutationContent = x.service.state.mutationContent = '😀'.repeat(4000);
  const before = new Set(await readdir(seed.directory));
  const seedResult = await seed.run(['apply', '--file', seedInput, '--server', seed.service.url, ...(format === 'json' ? ['--json'] : [])]);
  assert.equal(seedResult.exitCode, 0, seedResult.stdout + seedResult.stderr);
  const publications = (await readdir(seed.directory)).filter(name => !before.has(name));
  assert.equal(publications.length, 1);
  const blocked = join(x.directory, publications[0]);
  await writeFile(blocked, 'Unrelated existing file');
  const result = await x.run(['apply', '--file', input, '--server', x.service.url, ...(format === 'json' ? ['--json'] : [])]);
  assert.equal(result.exitCode, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /KERNEL_OUTPUT/);
  assert.ok((result.stdout + result.stderr).includes(stopText));
  assert.match(result.stdout + result.stderr, /receipt-1/);
  if (format === 'json') {
    assert.equal(result.envelope.effect, 'applied');
    assert.deepEqual(result.envelope.recovery, recoveryFacts([{ kind: 'receipt', id: 'receipt-1' }]));
  } else { assert.equal(result.stdout, ''); assert.match(result.stderr, /applied/); }
  assert.equal(await readFile(blocked, 'utf8'), 'Unrelated existing file');
  const status = await x.remote(['status', '--cursor', '1']);
  assert.equal(status.exitCode, 0, status.stdout);
  assert.deepEqual(status.envelope.payload.data.receipts, [{ id: 'receipt-1', item: 'item-3' }]);
  assert.equal(x.service.items.filter(item => item.name === 'Persisted once').length, 1);
  assert.equal(x.service.requests.filter(request => request.method === 'POST').length, 1);
});
test('lost mutation acknowledgment retains unknown recovery and status observes one applied operation', async t => {
  const x = await fixture(t);
  const input = join(x.directory, 'input.json');
  await writeFile(input, '{"name":"Disconnected once"}');
  x.service.state.disconnectApply = true;
  const result = await x.remote(['apply', '--file', input]);
  assert.equal(result.exitCode, 1);
  assert.equal(result.envelope.effect, 'unknown');
  assert.equal(result.envelope.recovery.kind, 'unknown_acknowledgment');
  assert.equal(result.envelope.recovery.commandPath, 'apply');
  assert.match(result.envelope.recovery.payloadHash, /^[a-f0-9]{64}$/);
  assert.equal(result.envelope.recovery.advice, 'inspect_before_retry');
  assert.doesNotMatch(result.stdout, /receipt-1|test-token|Disconnected once/);
  const resumed = await x.remote(['status', '--cursor', '0']);
  assert.equal(resumed.exitCode, 0, resumed.stdout);
  assert.deepEqual(resumed.envelope.payload.data.receipts, [{ id: 'receipt-1', item: 'item-3' }]);
  assert.equal(x.service.requests.filter(request => request.method === 'POST').length, 1);
});

function emittedArgv(reference) {
  return [...reference.path.split(' '), ...Object.entries(reference.flags).flatMap(([key, value]) => [`--${key}`, String(value)]), ...reference.args, '--json'];
}
test('emitted page and recovery references resume the selected server/workspace without helper flags', async t => {
  const x = await fixture(t);
  const listed = await x.remote(['list']);
  const reveal = listed.envelope.payload.data.omission.reveal;
  assert.equal(reveal.flags.server, x.service.url, 'read continuation must retain the selected service');
  assert.equal(reveal.flags.workspace, 'selected');
  assert.equal(reveal.flags.token, undefined);
  const next = await x.run(emittedArgv(reveal));
  assert.equal(next.exitCode, 0, next.stdout);
  assert.equal(next.envelope.payload.data.items[0].id, 'item-2');
  x.service.state.disconnectWait = true;
  const disconnected = await x.remote(['wait', '--cursor', 'resume-context', '--delay', '0']);
  const continuation = disconnected.envelope.error.continuation;
  assert.equal(continuation.flags.server, x.service.url);
  assert.equal(continuation.flags.workspace, 'selected');
  assert.equal(continuation.flags.token, undefined);
  const resumed = await x.run(emittedArgv(continuation));
  assert.equal(resumed.exitCode, 0, resumed.stdout);
  assert.equal(resumed.envelope.payload.data.cursor, 'resume-context');
  assert.ok(x.service.requests.every(request => request.workspace === 'selected'));
});
