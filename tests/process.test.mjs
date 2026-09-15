import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fixture = fileURLToPath(new URL('./fixtures/process-cli.mjs', import.meta.url));
const dataModule = source => `data:text/javascript,${encodeURIComponent(source)}`;
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'cli-process-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
function childRun(t, argv, { env = {}, nodeArgs = [], executable = process.execPath, slow, onData, closePipe } = {}) {
  const child = spawn(executable, [...nodeArgs, fixture, ...argv], {
    env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdout = [], stderr = [];
  for (const [name, chunks] of [['stdout', stdout], ['stderr', stderr]]) {
    child[name].on('data', chunk => {
      chunks.push(chunk);
      onData?.(child, name, chunk);
      if (slow === name) { child[name].pause(); setTimeout(() => child[name].resume(), 10); }
    });
  }
  if (closePipe) child[closePipe].destroy();
  const settled = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal,
      stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() }));
  });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 10000);
  t.after(async () => { clearTimeout(timeout); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await settled; });
  return { child, settled };
}

for (const mode of ['off', 'supported', 'unsupported', 'throws']) {
  test(`compile cache is optional and feature detected: ${mode}`, async t => {
    const log = join(await temporary(t), 'cache');
    const preload = dataModule(`
      import module from 'node:module';
      import { appendFileSync } from 'node:fs';
      module.enableCompileCache = ${mode === 'unsupported' ? 'undefined' : `() => {
        appendFileSync(${JSON.stringify(log)}, 'enabled\\n');
        ${mode === 'throws' ? "throw Error('Unavailable cache')" : 'return { status: 1 }'};
      }`};
      module.syncBuiltinESMExports();
    `);
    const result = await childRun(t, ['--version'], { nodeArgs: ['--import', preload],
      env: { PROCESS_COMPILE_CACHE: mode === 'off' ? '0' : '1', PROCESS_FORBID_EXECUTION: '1' } }).settled;
    assert.deepEqual(result, { code: 0, signal: null, stdout: 'process-fixture 1.2.3\n', stderr: '' });
    const calls = await readFile(log, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    assert.equal(calls, ['supported', 'throws'].includes(mode) ? 'enabled\n' : '');
  });
}

test('offline main acquires Node lazily and never imports the handler or crypto', async t => {
  const log = join(await temporary(t), 'imports');
  const loader = dataModule(`
    import { appendFileSync } from 'node:fs';
    export async function resolve(specifier, context, next) {
      const result = await next(specifier, context);
      appendFileSync(${JSON.stringify(log)}, result.url + '\\n');
      return result;
    }
  `);
  const result = await childRun(t, ['--version'], {
    nodeArgs: ['--no-warnings', '--experimental-loader', loader],
    env: { PROCESS_COMPILE_CACHE: '0', PROCESS_FORBID_EXECUTION: '1' },
  }).settled;
  assert.deepEqual(result, { code: 0, signal: null, stdout: 'process-fixture 1.2.3\n', stderr: '' });
  const trace = (await readFile(log, 'utf8')).trim().split('\n');
  const adapter = trace.findIndex(url => url.endsWith('/internal/process.js'));
  assert.ok(adapter >= 0);
  assert.equal(trace.slice(0, adapter).some(url => url.startsWith('node:')), false);
  assert.ok(trace.some(url => url.endsWith('/internal/node-host.js')));
  assert.equal(trace.some(url => /process-handler|node:crypto|node:module/.test(url)), false);
});

test('main runs on the Node 20 floor with compile cache opted in', async t => {
  const result = await childRun(t, ['--version'], { executable: '/Users/alex/.local/share/cli-for-agents/runtimes/node20/bin/node',
    env: { PROCESS_COMPILE_CACHE: '1' } }).settled;
  assert.deepEqual(result, { code: 0, signal: null, stdout: 'process-fixture 1.2.3\n', stderr: '' });
});

test('a pipe error during runtime work stays quiet when delivery begins', async t => {
  const preload = dataModule(`
    process.stdout.once('newListener', (event) => {
      if (event === 'error') queueMicrotask(() => process.stdout.emit('error', Object.assign(Error('closed'), { code: 'EPIPE' })));
    });
  `);
  const result = await childRun(t, ['inspect', '--json'], { nodeArgs: ['--import', preload] }).settled;
  assert.deepEqual(result, { code: 0, signal: null, stdout: '', stderr: '' });
});

test('public main forwards argv/env and uses the default Node host', async t => {
  const result = await childRun(t, ['inspect', '--json'], { env: { PROCESS_VALUE: 'from environment' } }).settled;
  assert.equal(result.code, 0, 'main must complete the production request: ' + result.stderr);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout).payload.data, { value: 'from environment',
    hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' });
});

for (const argv of [['--version'], ['--help'], ['exit-codes'], ['inspect', '--help'], ['missing'], ['inspect', '--bad']]) {
  test(`public main routes offline ${argv.join(' ')} without handlers`, async t => {
    const result = await childRun(t, argv, { env: { PROCESS_FORBID_EXECUTION: '1' } }).settled;
    const invalid = argv.includes('missing') || argv.includes('--bad');
    assert.equal(result.code, invalid ? 2 : 0, 'main must preserve the offline exit code: ' + result.stderr);
    assert.equal(result.signal, null);
    assert.equal(invalid ? result.stdout : result.stderr, '');
    assert.doesNotMatch(result.stdout + result.stderr, /Unexpected|not implemented/i);
    if (argv[0] === '--version') assert.equal(result.stdout, 'process-fixture 1.2.3\n');
  });
}

for (const [command, json, stream, exitCode] of [
  ['large', true, 'stdout', 0], ['large', false, 'stdout', 0],
  ['failure', true, 'stdout', 3], ['failure', false, 'stderr', 3],
  ['save', true, 'stdout', 0],
]) test(`drain preserves every UTF-8 byte for ${command} ${json ? 'JSON' : 'text'}`, async t => {
  const argv = [command, ...(json ? ['--json'] : [])];
  const expected = await childRun(t, argv).settled;
  let chunks = 0;
  const actual = await childRun(t, argv, { slow: stream, onData: (_child, name) => { if (name === stream) chunks++; } }).settled;
  assert.equal(actual.code, exitCode, actual.stderr);
  assert.equal(actual.signal, null);
  assert.ok(Buffer.byteLength(actual[stream]) > 65536);
  assert.ok(Buffer.byteLength(actual[stream]) <= 1048576);
  assert.ok(chunks > 1, 'the response must cross multiple pipe reads');
  assert.deepEqual(Buffer.from(actual[stream]), Buffer.from(expected[stream]));
  assert.equal(actual[stream === 'stdout' ? 'stderr' : 'stdout'], '');
  assert.ok(actual[stream].includes('🌍'.repeat(80000)));
  if (command === 'save') {
    const wire = JSON.parse(actual.stdout);
    assert.equal(wire.effect, 'applied');
    assert.deepEqual(wire.recovery, { kind: 'reported', references: [{ kind: 'receipt', id: 'saved-1' }] });
    assert.match(wire.instruction, /Inspect saved state/);
  }
});

for (const [command, json, stream, code] of [['save', true, 'stdout', 0], ['failure', true, 'stdout', 3], ['failure', false, 'stderr', 3]]) {
  test(`real closed ${stream} is quiet EPIPE for ${command}`, async t => {
    const events = join(await temporary(t), 'events');
    const errors = `${events}-errors`;
    const observer = dataModule(`
      import { appendFileSync } from 'node:fs';
      process[${JSON.stringify(stream)}].on('error', error => appendFileSync(${JSON.stringify(errors)}, error.code + '\\n'));
    `);
    const result = await childRun(t, [command, ...(json ? ['--json'] : [])], {
      env: { PROCESS_EVENTS: events }, closePipe: stream, nodeArgs: ['--import', observer],
    }).settled;
    assert.deepEqual(result, { code, signal: null, stdout: '', stderr: '' });
    assert.equal(await readFile(events, 'utf8'), `acquire\nrun\n${command === 'save' ? 'mutation\n' : ''}release\n`);
    assert.equal(await readFile(errors, 'utf8'), 'EPIPE\n');
  });
}

for (const mode of ['callback', 'event', 'throw', 'close']) {
  for (const [command, json, stream, code] of [['save', true, 'stdout', 1], ['failure', true, 'stdout', 3], ['failure', false, 'stderr', 3]]) {
    test(`non-EPIPE ${mode} on ${stream} preserves ${command} without retry`, async t => {
      const directory = await temporary(t);
      const events = join(directory, 'events');
      const writes = join(directory, 'writes');
      const preload = dataModule(`
        import { appendFileSync } from 'node:fs';
        const stream = process[${JSON.stringify(stream)}];
        stream.write = (text, callback) => {
          appendFileSync(${JSON.stringify(writes)}, text);
          const error = Object.assign(Error('private writer detail'), { code: 'EIO' });
          ${mode === 'throw' ? 'throw error;' : mode === 'callback' ? "setTimeout(() => { callback(error); stream.emit('error', error); }, 15);" : mode === 'event' ? "setTimeout(() => stream.emit('error', error), 15);" : "setTimeout(() => stream.emit('close'), 15);"}
          return false;
        };
      `);
      const result = await childRun(t, [command, ...(json ? ['--json'] : [])], {
        nodeArgs: ['--import', preload], env: { PROCESS_EVENTS: events },
      }).settled;
      assert.deepEqual(result, { code, signal: null, stdout: '', stderr: '' });
      assert.equal(await readFile(events, 'utf8'), `acquire\nrun\n${command === 'save' ? 'mutation\n' : ''}release\n`);
      const attempted = await readFile(writes, 'utf8');
      assert.ok(Buffer.byteLength(attempted) <= 1048576);
      if (json) {
        const wire = JSON.parse(attempted); // Also rejects a retried/duplicated envelope.
        if (command === 'save') {
          assert.equal(wire.effect, 'applied');
          assert.match(wire.instruction, /Inspect saved state/);
          assert.deepEqual(wire.recovery, { kind: 'reported', references: [{ kind: 'receipt', id: 'saved-1' }] });
        }
        else assert.equal(wire.error.code, 'OFFLINE');
      } else assert.match(attempted, /^error: OFFLINE:/);
    });
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) for (const command of ['wait', 'save-wait']) {
  test(`${signal} cancels ${command} through production and releases once`, async t => {
    const events = join(await temporary(t), 'events');
    const run = childRun(t, [command, '--json'], { env: { PROCESS_EVENTS: events } });
    let ready = false;
    for (let attempt = 0; attempt < 500; attempt++) {
      const log = await readFile(events, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
      if (log.includes('waiting\n')) { ready = true; break; }
      if (run.child.exitCode !== null || run.child.signalCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(ready, 'handler must reach the cancellable wait');
    assert.equal(run.child.kill(signal), true);
    const result = await run.settled;
    assert.equal(result.code, 1, result.stderr);
    assert.equal(result.signal, null, 'the adapter must handle the signal');
    assert.equal(result.stderr, '');
    const wire = JSON.parse(result.stdout);
    assert.equal(wire.error.code, 'KERNEL_CANCELLED');
    assert.equal(wire.effect, command === 'wait' ? 'read' : 'unknown');
    if (command === 'save-wait') assert.deepEqual(wire.recovery, {
      kind: 'unknown_acknowledgment', commandPath: 'save-wait', advice: 'inspect_before_retry',
    });
    assert.equal(await readFile(events, 'utf8'), `acquire\nrun\n${command === 'save-wait' ? 'mutation\n' : ''}waiting\nrelease\n`);
  });
}

test('SIGTERM during a slow drain preserves an already assembled applied result', async t => {
  let signalled = false;
  const result = await childRun(t, ['save', '--json'], { slow: 'stdout', onData: child => {
    if (!signalled) { signalled = true; child.kill('SIGTERM'); }
  } }).settled;
  assert.equal(signalled, true);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.signal, null);
  const wire = JSON.parse(result.stdout);
  assert.equal(wire.effect, 'applied');
  assert.equal(wire.payload.data.body, '🌍'.repeat(80000));
  assert.match(wire.instruction, /Inspect saved state/);
});

for (const ordering of ['callback-first', 'drain-first', 'accepted']) {
  test(`main waits for the write callback and required drain: ${ordering}`, async t => {
    const events = join(await temporary(t), 'writer');
    const preload = dataModule(`
      import { appendFileSync } from 'node:fs';
      const stream = process.stdout;
      const write = stream.write.bind(stream);
      stream.write = (text, callback) => {
        const flushed = () => { appendFileSync(${JSON.stringify(events)}, 'callback\\n'); callback(); };
        const drained = () => { appendFileSync(${JSON.stringify(events)}, 'drain\\n'); stream.emit('drain'); };
        write(text, () => {
          ${ordering === 'accepted' ? 'setTimeout(flushed, 30);' : ordering === 'callback-first' ? 'flushed(); setTimeout(drained, 30);' : 'drained(); setTimeout(flushed, 30);'}
        });
        return ${ordering === 'accepted'};
      };
    `);
    const result = await childRun(t, ['--version'], { nodeArgs: ['--import', preload] }).settled;
    assert.deepEqual(result, { code: 0, signal: null, stdout: 'process-fixture 1.2.3\n', stderr: '' });
    assert.equal(await readFile(events, 'utf8'), ordering === 'accepted' ? 'callback\n' : ordering === 'callback-first' ? 'callback\ndrain\n' : 'drain\ncallback\n');
  });
}

test('the slow-pipe control detects an adapter that exits before drain', async t => {
  // Negative control falsifies Node's completion signals; the real adapter must
  // then exit with bytes still buffered. The normal tests above require all bytes.
  const preload = dataModule(`
    const stream = process.stdout;
    const write = stream.write.bind(stream);
    stream.write = (text, callback) => { write(text); callback(); return true; };
  `);
  const result = await childRun(t, ['large', '--json'], { slow: 'stdout', nodeArgs: ['--import', preload] }).settled;
  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, '');
  assert.ok(Buffer.byteLength(result.stdout) < 320000, 'control must reproduce truncation before serving as drain evidence');
});
