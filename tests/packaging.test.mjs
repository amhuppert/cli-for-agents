import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

// Real pack and yalc lifecycles run against copied producers in fresh staging roots;
// the worktree's own dist and the user's global yalc store are never touched.
const producerFiles = ['src', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.build.json', 'scripts/prepack.mjs', 'scripts/validate/build.sh'];
const yalc = resolve('node_modules/yalc/src/yalc.js');
async function staging(t) {
  await mkdir('.cc/temp/packaging', { recursive: true });
  const directory = await realpath(await mkdtemp(resolve('.cc/temp/packaging/run-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
function environment(stage) {
  return { ...process.env, npm_config_cache: join(stage, 'npm-cache'), npm_config_offline: 'true', npm_config_update_notifier: 'false',
    npm_config_fund: 'false', npm_config_audit: 'false' };
}
function run(stage, command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env: environment(stage), encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.error, undefined, `${command} ${args.join(' ')}: ${result.error?.message}`);
  return result;
}
const succeeded = (result, label) => assert.equal(result.status, 0, `${label}: ${result.stderr}\n${result.stdout}`);
async function producer(stage, name) {
  const directory = join(stage, name);
  await mkdir(join(directory, 'scripts/validate'), { recursive: true });
  for (const path of producerFiles) await cp(path, join(directory, path), { recursive: true });
  // Reuse installed compiler dependencies; no network install runs inside tests.
  await symlink(resolve('node_modules'), join(directory, 'node_modules'), 'dir');
  return directory;
}
async function poison(directory, marker = 'stale') {
  await mkdir(join(directory, 'dist'), { recursive: true });
  await writeFile(join(directory, 'dist/obsolete.js'), `export const obsolete = ${JSON.stringify(marker)};\n`);
  await writeFile(join(directory, 'dist/index.js'), `export const stale = ${JSON.stringify(marker)};\n`);
  await writeFile(join(directory, 'dist/index.d.ts'), 'export declare const stale: string;\n');
}
async function setMarker(directory, marker) {
  const path = join(directory, 'src/results.ts');
  const source = await readFile(path, 'utf8');
  const updated = source.replace(/(KERNEL_CONTRACT: \{ exitClass: "failed", description: )"[^"]*"/u, `$1${JSON.stringify(marker)}`);
  assert.notEqual(updated, source, 'fixture marker must be source-visible');
  await writeFile(path, updated);
}
async function consumerPackage(stage, name, dependencies = ['zod', '@standard-schema/spec', '@types/node']) {
  const directory = join(stage, name);
  // A separately named package boundary: self-name resolution cannot reach this repository.
  await mkdir(join(directory, 'node_modules/@types'), { recursive: true });
  await mkdir(join(directory, 'node_modules/@standard-schema'), { recursive: true });
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name, private: true, type: 'module' }, null, 2) + '\n');
  for (const dependency of dependencies) await symlink(resolve('node_modules', dependency), join(directory, 'node_modules', dependency), 'dir');
  return directory;
}
function packed(result) {
  // npm prints the pack report as a JSON array starting on its own line.
  const [entry] = JSON.parse(result.stdout.slice(result.stdout.search(/^\[/m)));
  return { filename: entry.filename, files: entry.files.map(file => file.path).sort() };
}
const imported = (stage, cwd, expression) => run(stage, process.execPath, ['--input-type=module', '-e', `const m = await import('cli-for-agents'); process.stdout.write(String(${expression}));`], cwd);

test('npm pack rebuilds missing and stale dist from source and ships only fresh exports', async t => {
  const stage = await staging(t);
  for (const state of ['missing', 'stale']) {
    const directory = await producer(stage, `pack-${state}`);
    if (state === 'stale') await poison(directory);
    const result = run(stage, 'npm', ['pack', '--json', '--pack-destination', directory], directory);
    succeeded(result, `npm pack (${state} dist)`);
    const { filename, files } = packed(result);
    for (const entry of ['index', 'runtime/index', 'guidance/index', 'testing/index']) {
      assert.ok(files.includes(`dist/${entry}.js`) && files.includes(`dist/${entry}.d.ts`), `${state}: ${entry}`);
    }
    assert.ok(!files.includes('dist/obsolete.js'), `${state}: obsolete emitted file shipped`);
    assert.deepEqual(files.filter(path => !path.startsWith('dist/')), ['package.json']);
    const extracted = join(stage, `extracted-${state}`);
    await mkdir(extracted);
    succeeded(run(stage, 'tar', ['-xzf', join(directory, filename), '-C', extracted, '--strip-components=1'], stage), 'extract');
    const index = await readFile(join(extracted, 'dist/index.js'), 'utf8');
    assert.doesNotMatch(index, /stale/);
    assert.match(index, /export \{ bytes, count, id, milliseconds \}/);
  }
});

test('an extracted real archive serves direct schemas, new contracts and runtime behavior to an isolated consumer', async t => {
  const stage = await staging(t);
  const directory = await producer(stage, 'producer');
  await poison(directory);
  const result = run(stage, 'npm', ['pack', '--json', '--pack-destination', directory], directory);
  succeeded(result, 'npm pack');
  const consumer = await consumerPackage(stage, 'packed-consumer');
  const installed = join(consumer, 'node_modules/cli-for-agents');
  await mkdir(installed);
  succeeded(run(stage, 'tar', ['-xzf', join(directory, packed(result).filename), '-C', installed, '--strip-components=1'], stage), 'extract');
  const shipped = (await readdir(join(installed, 'dist'), { recursive: true })).filter(path => path.endsWith('.d.ts'));
  for (const path of shipped) assert.doesNotMatch(await readFile(join(installed, 'dist', path), 'utf8'), /zod|standard-schema/, `${path} imports a development-only package`);

  const check = join(consumer, 'check.ts');
  await writeFile(check, `import type { StandardSchemaV1 } from "@standard-schema/spec";
import { z } from "zod";
import { bytes, type Preparation, type StandardSchema } from "cli-for-agents";
import { commandReference, type Host, type ReferenceSelection, type ReferenceWriteResult } from "cli-for-agents/runtime";
import { hint } from "cli-for-agents/guidance";
import { createTestHost } from "cli-for-agents/testing";
declare const official: StandardSchemaV1<unknown, { unit: string }>;
export const standard: StandardSchema<{ unit: string }> = official;
export const direct: StandardSchema<{ unit: string }> = z.object({ unit: z.string() });
interface Counts { readonly records: number }
export const prepared: Preparation<Map<string, number>, string, Counts> = { ok: true, value: new Map(), preview: { records: 1 } };
export const ensure: Host["files"]["ensureDirectory"] = createTestHost({ directories: ["/artifacts"] }).files.ensureDirectory;
export const selection: ReferenceSelection = { commands: ["save"] };
declare const written: ReferenceWriteResult;
export const measured: number | undefined = written.sizes?.documentBytes;
void [bytes, commandReference, hint];
`);
  const program = ts.createProgram([check], { strict: true, exactOptionalPropertyTypes: true, noEmit: true, skipLibCheck: false, types: ['node'],
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext });
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')), []);
  const checker = program.getTypeChecker();
  for (const statement of program.getSourceFile(check).statements.filter(ts.isImportDeclaration)) {
    if (!statement.moduleSpecifier.text.startsWith('cli-for-agents')) continue;
    const declaration = checker.getSymbolAtLocation(statement.moduleSpecifier)?.declarations?.[0]?.getSourceFile().fileName;
    assert.ok(declaration?.startsWith(`${installed}/dist/`), `TypeScript resolved ${statement.moduleSpecifier.text} outside the archive: ${declaration}`);
  }

  await writeFile(join(consumer, 'imports.mjs'), `import assert from 'node:assert/strict';
for (const path of ['cli-for-agents', 'cli-for-agents/runtime', 'cli-for-agents/guidance', 'cli-for-agents/testing']) {
  assert.ok(import.meta.resolve(path).startsWith(${JSON.stringify(`file://${installed}/dist/`)}), path);
  assert.ok(Object.keys(await import(path)).length > 0, path);
}
for (const path of ['cli-for-agents/internal/registry', 'cli-for-agents/dist/index.js', 'cli-for-agents/src/index.ts']) {
  await assert.rejects(import(path), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }, path);
}
`);
  succeeded(run(stage, process.execPath, ['imports.mjs'], consumer), 'public and private imports');

  const artifacts = join(stage, 'missing/artifacts');
  const items = join(stage, 'items.json');
  await writeFile(items, JSON.stringify({ items: ['a', 'b'] }));
  await writeFile(join(consumer, 'cli.mjs'), `import { bytes, commandsFor, defineErrors, invocation, mutation, recoveryFacts } from 'cli-for-agents';
import { createCli, nodeHost, runCli } from 'cli-for-agents/runtime';
import { z } from 'zod';
const family = commandsFor()({ errors: defineErrors({}), globalFlags: {} });
const save = family.defineCommand({ path: 'save', summary: 'Save', description: 'Save items', requires: 'none', effects: 'write', args: [], flags: {}, payload: { maxBytes: bytes(4096), validatePath: 'save-check', examples: [{ payload: {}, why: 'Example payload' }] } },
  { examples: [{ file: 'items.json', why: 'Save items' }], handler: async () => ({ default: mutation({ decode: z.object({ items: z.array(z.string()) }),
    prepare: async ({ payload }) => ({ ok: true, value: new Set(payload.items), preview: { records: payload.items.length } }),
    commit: async ({ prepared }) => ({ effect: 'applied', recovery: recoveryFacts([{ kind: 'save', id: String(prepared.value.size) }]), result: { ok: true, data: {} } }) }) }) });
const dump = family.defineCommand({ path: 'dump', summary: 'Dump', description: 'Large output', requires: 'none', effects: 'read', args: [], flags: {} },
  { examples: [{ why: 'Dump' }], handler: async () => ({ default: { run: async () => ({ ok: true, data: { rows: 'x'.repeat(40000) } }) } }) });
const cli = createCli({ name: 'packed', version: '1', family, commands: [save, dump], contexts: {}, doctor: invocation(dump, {}), output: { artifacts: { directory: ${JSON.stringify(artifacts)}, forbiddenRoots: [] } } });
const host = await nodeHost();
const run = async argv => JSON.parse((await runCli(cli, { argv, env: {}, host, signal: new AbortController().signal })).stdout);
process.stdout.write(JSON.stringify({ check: await run(['save-check', '--file', ${JSON.stringify(items)}, '--json']), spilled: await run(['dump', '--json']) }));
`);
  const behavior = run(stage, process.execPath, ['cli.mjs'], consumer);
  succeeded(behavior, 'packed CLI');
  const { check: validated, spilled } = JSON.parse(behavior.stdout);
  assert.equal(validated.ok, true);
  assert.deepEqual(validated.payload.data.preview, { records: 2 });
  assert.ok(validated.hint.startsWith('Apply the validated payload: packed save ') && validated.hint.includes(items), validated.hint);
  assert.equal(spilled.ok, true);
  assert.equal(spilled.payload.spill.format, 'json');
  assert.ok(spilled.payload.artifact.path.startsWith(`${artifacts}/`));
  assert.ok((await stat(artifacts)).isDirectory(), 'the kernel created the missing artifact directory');
});

test('isolated yalc publication ships fresh builds, updates consumers and preserves the last snapshot after a failed build', async t => {
  const stage = await staging(t);
  const store = join(stage, 'yalc-store');
  const directory = await producer(stage, 'yalc-producer');
  await poison(directory);
  await setMarker(directory, 'Packaging marker one.');
  const publish = () => run(stage, process.execPath, [yalc, 'publish', '--private', '--scripts', '--store-folder', store], directory);
  succeeded(publish(), 'first yalc publish');
  const stored = join(store, 'packages/cli-for-agents/0.0.0');
  assert.match(await readFile(join(stored, 'dist/results.js'), 'utf8'), /Packaging marker one\./);
  assert.doesNotMatch(await readFile(join(stored, 'dist/index.js'), 'utf8'), /stale/);
  await assert.rejects(stat(join(stored, 'dist/obsolete.js')), { code: 'ENOENT' });

  const consumer = await consumerPackage(stage, 'yalc-consumer', []);
  succeeded(run(stage, process.execPath, [yalc, 'add', 'cli-for-agents', '--store-folder', store], consumer), 'yalc add');
  assert.equal(JSON.parse(await readFile(join(consumer, 'package.json'), 'utf8')).dependencies['cli-for-agents'], 'file:.yalc/cli-for-agents');
  succeeded(run(stage, 'npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], consumer), 'offline consumer install');
  assert.equal(imported(stage, consumer, 'm.kernelErrors.KERNEL_CONTRACT.description').stdout, 'Packaging marker one.');

  await setMarker(directory, 'Packaging marker two.');
  succeeded(publish(), 'second yalc publish');
  succeeded(run(stage, process.execPath, [yalc, 'update', 'cli-for-agents', '--store-folder', store], consumer), 'yalc update');
  succeeded(run(stage, 'npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], consumer), 'offline consumer reinstall');
  assert.equal(imported(stage, consumer, 'm.kernelErrors.KERNEL_CONTRACT.description').stdout, 'Packaging marker two.');

  // A compile error with stale output present must not produce any usable package.
  await poison(directory, 'stale after success');
  const values = join(directory, 'src/values.ts');
  await writeFile(values, `${await readFile(values, 'utf8')}\nexport const broken: number = "not a number";\n`);
  const before = await readFile(join(stored, 'dist/results.js'), 'utf8');
  const failedPack = run(stage, 'npm', ['pack', '--json', '--pack-destination', directory], directory);
  assert.notEqual(failedPack.status, 0, 'npm pack must fail when the build fails');
  assert.deepEqual((await readdir(directory)).filter(name => name.endsWith('.tgz')), []);
  assert.notEqual(publish().status, 0, 'yalc publish must fail when the build fails');
  assert.equal(await readFile(join(stored, 'dist/results.js'), 'utf8'), before);
  await assert.rejects(stat(join(stored, 'dist/obsolete.js')), { code: 'ENOENT' });
  assert.equal(imported(stage, consumer, 'm.kernelErrors.KERNEL_CONTRACT.description').stdout, 'Packaging marker two.');
});
