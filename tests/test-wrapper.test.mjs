import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('the test wrapper reports counts, filters names, and refuses zero executions or missing targets', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cfa-test-wrapper-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'tests'));
  await mkdir(join(root, 'node_modules/typescript/bin'), { recursive: true });
  // Only compiler preparation is stubbed; the wrapper runs the real Node test runner.
  await writeFile(join(root, 'node_modules/typescript/bin/tsc'), '');
  await writeFile(join(root, 'tests/sample.test.mjs'), `
import test from 'node:test';
test('selected pass', () => {});
test('excluded failure', () => { throw Error('failure detail must survive'); });
`);
  const wrapper = fileURLToPath(new URL('../scripts/validate/test.sh', import.meta.url));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const run = args => spawnSync('bash', [wrapper, ...args], { cwd: root, env, encoding: 'utf8', timeout: 20000 });
  for (const args of [['--test-name-pattern', 'selected pass', 'tests/sample.test.mjs'], ['--test-name-pattern=selected pass', '--', 'tests/sample.test.mjs']]) {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^test: passed; tests=\d+ passed=1 failed=0/m);
    assert.doesNotMatch(result.stdout, /duration_ms|Subtest/);
  }
  const unmatched = run(['--test-name-pattern=does not exist', 'tests/sample.test.mjs']);
  assert.equal(unmatched.status, 1);
  assert.match(unmatched.stderr, /test: no tests executed;/);
  const missing = run(['tests/missing.test.mjs']);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /missing.test.mjs/);
  const mangled = run(['tests/sample.test.mjs tests/missing.test.mjs']);
  assert.equal(mangled.status, 2);
  const failed = run(['tests/sample.test.mjs']);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /failure detail must survive/);
  assert.match(failed.stderr, /test: failed; tests=2 passed=1 failed=1/);
  const invalidPattern = run(['--test-name-pattern=[', 'tests/sample.test.mjs']);
  assert.equal(invalidPattern.status, 2);
  assert.match(invalidPattern.stderr, /regular expression/);
});
