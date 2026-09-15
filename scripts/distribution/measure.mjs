import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { bundleConsumer } from './bundle.mjs';
import { sourceInventory, assertArchitecture } from './architecture.mjs';

export const offlineRequests = [['--help'], ['inspect', '--help'], ['--version'], ['exit-codes'], ['--!distribution-invalid']];
export async function measureDistribution() {
  const root = process.cwd();
  await mkdir('.cc/temp/distribution', { recursive: true });
  const directory = await mkdtemp(resolve('.cc/temp/distribution/measure-'));
  try {
    const inventory = await sourceInventory();
    const eager = new Set(assertArchitecture(inventory).map(path => `source:${path}`));
    const bundle = await bundleConsumer(directory);
    const bytes = (await readFile(bundle.file)).byteLength;
    const runtimes = JSON.parse(await readFile('scripts/distribution/runtimes.json', 'utf8'));
    const executable = process.env[runtimes.node20.environment] ?? runtimes.node20.executable;
    const traces = [];
    for (const [index, argv] of offlineRequests.entries()) {
      const log = resolve(directory, `trace-${index}.jsonl`);
      const command = [ '--no-warnings', '--experimental-loader', pathToFileURL(resolve('scripts/distribution/trace-loader.mjs')).href,
        resolve('tests/fixtures/distribution/consumer.mjs'), ...argv ];
      const run = spawnSync(executable, command, { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
        env: { ...process.env, DISTRIBUTION_TRACE: log } });
      const expected = argv[0] === '--!distribution-invalid' ? 2 : 0;
      if (run.error || run.status !== expected) throw Error(`Offline trace failed: ${run.error?.message ?? run.stderr}`);
      const modules = [...new Set((await readFile(log, 'utf8')).trim().split('\n').map(url => url.startsWith('file:') ? relative(root, fileURLToPath(url)) : url))].sort();
      for (const module of modules) eager.add(`offline:${module}`);
      if (modules.some(path => /tests\/fixtures\/distribution\/(handler|contracts)\.mjs|dist\/testing\/|node:(crypto|module|http|https|net)/.test(path))) throw Error('Offline path initialized handler/schema/transport/testing code');
      const bundled = spawnSync(executable, [bundle.file, ...argv], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
      if (bundled.error || bundled.status !== expected || bundled.stdout !== run.stdout || bundled.stderr !== run.stderr) throw Error('Bundled offline output differs from emitted ESM');
      traces.push({ argv, modules, exitCode: run.status });
    }
    const measurement = { bytes, eager: [...eager].sort() };
    await writeFile('.cc/temp/distribution/source-import-inventory.json', JSON.stringify(inventory, null, 2) + '\n');
    await writeFile('.cc/temp/distribution/measurement.json', JSON.stringify({ ...measurement, traces }, null, 2) + '\n');
    return measurement;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
