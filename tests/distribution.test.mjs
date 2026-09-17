import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm, cp, readFile, writeFile, readdir, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { bundleConsumer } from '../scripts/distribution/bundle.mjs';

test('consumer builds into exactly one executable ESM file', async () => {
  await mkdir('.cc/temp/distribution', { recursive: true });
  const directory = await mkdtemp(resolve('.cc/temp/distribution/bundle-'));
  try {
    const bundle = await bundleConsumer(directory);
    assert.deepEqual(bundle.outputs, ['consumer.mjs'], 'bundle must contain one emitted executable');
    for (const output of Object.values(bundle.metafile.outputs)) {
      assert.ok(output.imports.every(item => item.external && item.path.startsWith('node:')), 'single file may only retain builtin imports');
    }
    const second = await bundleConsumer(resolve(directory, 'second'));
    assert.deepEqual(await readFile(bundle.file), await readFile(second.file), 'build bytes are reproducible');
    // Run an isolated copy: no adjacent source, package or node_modules can rescue a broken bundle.
    const isolated = resolve(directory, 'isolated');
    await mkdir(isolated);
    const executable = resolve(isolated, 'consumer.mjs');
    await cp(bundle.file, executable);
    await chmod(executable, 0o755);
    assert.deepEqual(await readdir(isolated), ['consumer.mjs']);
    const compatibility = await runCompatibility(executable);
    assert.deepEqual(compatibility.runtimes.map(runtime => runtime.name), ['node20', 'nodeCurrent', 'bun']);
    for (const runtime of compatibility.runtimes) {
      assert.equal(runtime.status, 'passed');
      assert.equal(runtime.runs.length, 14);
      assert.equal(runtime.runs.filter(run => run.passed?.length === 7).length, 2);
    }
    await writeFile('.cc/temp/distribution/compatibility.json', JSON.stringify(compatibility, null, 2) + '\n');
    const direct = child(executable, ['inspect', '--json'], { cwd: isolated });
    assert.equal(JSON.parse(direct.stdout).payload.data.distribution, 'single-file');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

function child(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024, ...options });
  assert.equal(result.error, undefined, `${command}: ${result.error?.message}`);
  assert.equal(result.status, 0, `${command} ${args.join(' ')}: ${result.stderr} ${result.stdout}`);
  return result;
}
function compilerProgram(file) {
  return ts.createProgram([file], { strict: true, noEmit: true, skipLibCheck: false,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [] });
}
function diagnostics(file) {
  return ts.getPreEmitDiagnostics(compilerProgram(file));
}
test('installed ESM and declarations resolve four public exports and refuse private paths', async () => {
  const directory = await mkdtemp(resolve('.cc/temp/distribution/package-'));
  try {
    // End the repository package scope so self-name resolution cannot bypass staging.
    await writeFile(resolve(directory, 'package.json'), JSON.stringify({
      name: 'distribution-installation-consumer', private: true, type: 'module',
    }));
    const installed = resolve(directory, 'node_modules/cli-for-agents');
    await mkdir(installed, { recursive: true });
    const manifest = JSON.parse(await readFile('package.json', 'utf8'));
    assert.equal(manifest.private, true);
    assert.deepEqual(manifest.dependencies ?? {}, {});
    assert.deepEqual(Object.keys(manifest.exports), ['.', './runtime', './guidance', './testing']);
    await writeFile(resolve(installed, 'package.json'), JSON.stringify(manifest));
    // Copy precisely the declared package payload; source and ambient project types are absent.
    assert.deepEqual(manifest.files, ['dist']);
    await cp('dist', resolve(installed, 'dist'), { recursive: true });
    const positive = resolve(directory, 'public.mts');
    await writeFile(positive, `import { bytes } from 'cli-for-agents';
import { createCli } from 'cli-for-agents/runtime';
import { instruction } from 'cli-for-agents/guidance';
import { contractTests } from 'cli-for-agents/testing';
const measured: number = bytes(8192);
void [measured, createCli, instruction, contractTests];
`);
    const program = compilerProgram(positive);
    assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []);
    const checker = program.getTypeChecker();
    for (const statement of program.getSourceFile(positive).statements.filter(ts.isImportDeclaration)) {
      const specifier = statement.moduleSpecifier.text;
      const exportKey = specifier === manifest.name ? '.' : `.${specifier.slice(manifest.name.length)}`;
      const imported = checker.getSymbolAtLocation(statement.moduleSpecifier);
      assert.equal(imported?.declarations?.[0]?.getSourceFile().fileName,
        resolve(installed, manifest.exports[exportKey].types), 'TypeScript must resolve the staged installation');
    }
    const publicTargets = Object.entries(manifest.exports).map(([path, target]) =>
      [`cli-for-agents${path === '.' ? '' : path.slice(1)}`, pathToFileURL(resolve(installed, target.import)).href]);
    const privatePaths = ['cli-for-agents/internal/registry', 'cli-for-agents/dist/internal/registry.js', 'cli-for-agents/src/index.ts', 'cli-for-agents/package.json'];
    const runtime = resolve(directory, 'imports.mjs');
    await writeFile(runtime, `import assert from 'node:assert/strict';
for (const [path, expected] of ${JSON.stringify(publicTargets)}) {
  assert.equal(import.meta.resolve(path), expected, 'Node must resolve the staged installation');
  assert.ok(Object.keys(await import(path)).length > 0);
}
for (const path of ${JSON.stringify(privatePaths)}) await assert.rejects(import(path), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
`);
    child(process.execPath, [runtime], { cwd: directory });
    // Each isolated negative must fail only on its intended inaccessible import.
    for (const [index, path] of privatePaths.entries()) {
      const negative = resolve(directory, `private-${index}.mts`);
      await writeFile(negative, `import * as privateApi from ${JSON.stringify(path)}; void privateApi;`);
      const errors = diagnostics(negative);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].code, 2307);
      assert.equal(errors[0].file.fileName, negative);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

import { sourceInventory, assertArchitecture, assertRatchet } from '../scripts/distribution/architecture.mjs';
for (const [name, reason] of [['eager-handler', /Eager handler\/schema/], ['eager-schema', /Eager handler\/schema/], ['output', /Direct output bypass/], ['output-console', /Direct output bypass/], ['output-stream', /Direct output bypass/], ['output-fd', /Direct output bypass/], ['output-alias', /Direct output bypass/], ['output-fd-alias', /Direct output bypass/], ['eager-dynamic', /Eager handler\/schema/], ['eager-empty', /Eager handler\/schema/], ['eager-inline-types.ts', /Eager handler\/schema/]]) {
  test(`architecture refuses deliberately invalid ${name}`, async () => {
    const path = `tests/fixtures/distribution-invalid/${name.includes('.') ? name : `${name}.mjs`}`;
    const inventory = await sourceInventory(['src', 'tests/fixtures/distribution', 'tests/fixtures/distribution-invalid']);
    assert.throws(() => assertArchitecture(inventory, { entries: [path], lazyOnly: ['tests/fixtures/distribution/handler.mjs', 'tests/fixtures/distribution-invalid/schema.mjs'] }), reason);
  });
}
test('the bundle budget refuses growth past its ceiling and undeclared eager modules', () => {
  assert.doesNotThrow(() => assertRatchet({ bytes: 99, eager: [] }, { bytes: 99, eager: [] }));
  assert.throws(() => assertRatchet({ bytes: 101, eager: [] }, { bytes: 100, eager: [] }), /Bundle bytes/);
  assert.throws(() => assertRatchet({ bytes: 99, eager: ['new'] }, { bytes: 100, eager: [] }), /Unexpected eager module/);
  // Raising the ceiling and declaring a new eager module are deliberate edits to
  // baseline.json, reviewable in the diff. Neither can happen by accident.
  assert.doesNotThrow(() => assertRatchet({ bytes: 101, eager: ['new'] }, { bytes: 101, eager: ['new'] }));
});

import { measureDistribution } from '../scripts/distribution/measure.mjs';
test('real source inventory and offline traces measure the first bundle baseline', async () => {
  const measured = await measureDistribution();
  // The testing export is separately importable, but absent from consumer offline paths.
  const inventory = await sourceInventory();
  assert.doesNotThrow(() => assertArchitecture(inventory, { entries: ['src/testing/index.ts'] }));
  assert.ok(measured.bytes > 0);
  assert.ok(measured.eager.includes('offline:node:process'));
  assert.ok(measured.eager.includes('source:src/index.ts'));
  const baseline = JSON.parse(await readFile('scripts/distribution/baseline.json', 'utf8'));
  assertRatchet(measured, baseline);
  assert.throws(() => assertRatchet({ ...measured, bytes: baseline.bytes + 1 }, baseline), /Bundle bytes/);
  assert.throws(() => assertRatchet({ ...measured, eager: [...measured.eager, 'offline:node:crypto'] }, baseline), /Unexpected eager module/);
});

test('architecture accepts the lazy schema control and detects an unexpected eager dependency', async () => {
  const inventory = await sourceInventory(['src', 'tests/fixtures/distribution', 'tests/fixtures/distribution-invalid']);
  const options = { entries: ['tests/fixtures/distribution-invalid/lazy-schema.mjs'], lazyOnly: ['tests/fixtures/distribution-invalid/schema.mjs'] };
  assert.doesNotThrow(() => assertArchitecture(inventory, options));
  assert.doesNotThrow(() => assertArchitecture(inventory, { ...options, entries: ['tests/fixtures/distribution-invalid/type-only.ts'] }));
  inventory[options.entries[0]].imports.push({ path: 'node:crypto', kind: 'static', eager: true });
  assert.throws(() => assertArchitecture(inventory, options), /Unexpected eager module: node:crypto/);
});

test('a real offline loader trace exposes an unexpected eager module', async () => {
  const directory = await mkdtemp(resolve('.cc/temp/distribution/invalid-trace-'));
  try {
    const log = resolve(directory, 'trace.jsonl');
    const runtimes = JSON.parse(await readFile('scripts/distribution/runtimes.json', 'utf8'));
    child(process.env[runtimes.node20.environment] ?? runtimes.node20.executable,
      ['--no-warnings', '--experimental-loader', resolve('scripts/distribution/trace-loader.mjs'),
        resolve('tests/fixtures/distribution-invalid/startup.mjs'), '--version'],
      { env: { ...process.env, DISTRIBUTION_TRACE: log } });
    const loaded = (await readFile(log, 'utf8')).trim().split('\n');
    assert.ok(loaded.includes('node:os'), 'the deliberately eager builtin must actually load');
    const baseline = JSON.parse(await readFile('scripts/distribution/baseline.json', 'utf8'));
    assert.throws(() => assertRatchet({ bytes: baseline.bytes, eager: loaded.filter(path => path.startsWith('node:')).map(path => `offline:${path}`) }, baseline), /Unexpected eager module: offline:node:os/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

import { checkRuntime, runCompatibility } from '../scripts/distribution/compatibility.mjs';
import { benchmarkIdle, summarizePairs } from '../scripts/distribution/idle.mjs';
test('required compatibility runtimes cannot pass as absent or mismatched', () => {
  assert.throws(() => checkRuntime({ executable: resolve('.cc/temp/distribution/missing-runtime'), version: 'v20.20.2' }), /Required runtime unavailable/);
  assert.throws(() => checkRuntime({ executable: process.execPath, version: 'v0.0.0' }), /Runtime version mismatch/);
});
test('paired idle evidence contains actual floor and CLI executions with no timing gate', async () => {
  const directory = await mkdtemp(resolve('.cc/temp/distribution/idle-'));
  try {
    const bundle = await bundleConsumer(directory);
    const report = await benchmarkIdle(bundle.file, { samples: 9 });
    assert.equal(report.timingGate, false);
    assert.deepEqual(report.runtimes.map(runtime => runtime.name), ['node20', 'nodeCurrent'], 'record actual Node floor and current Node pairs');
    for (const runtime of report.runtimes) {
      assert.equal(runtime.pairs.length, 9);
      for (const pair of runtime.pairs) {
        assert.ok(Number.isFinite(pair.floorMs) && pair.floorMs >= 0);
        assert.ok(Number.isFinite(pair.cliMs) && pair.cliMs >= 0);
      }
      assert.equal(runtime.floorCommand[1], '-e');
      assert.equal(runtime.cliCommand.at(-1), '--version');
    }
    await writeFile('.cc/temp/distribution/idle.json', JSON.stringify(report, null, 2) + '\n');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('idle summary accepts arbitrarily slow samples as advisory evidence', () => {
  const summary = summarizePairs([{ floorMs: 100000, cliMs: 900000 }, { floorMs: 200000, cliMs: 1000000 }, { floorMs: 300000, cliMs: 1100000 }]);
  assert.equal(summary.pairedDeltaMedianMs, 800000);
});
