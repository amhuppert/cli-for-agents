#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export const caseNames = ['offline-paths', 'schema-issue-survival', 'single-guidance-arbitration', 'unknown-totals', 'shell-safe-references', 'unicode-spill', 'operation-recovery'];
export async function runtimePins() {
  return JSON.parse(await readFile(new URL('./runtimes.json', import.meta.url), 'utf8'));
}
export function checkRuntime(runtime) {
  const executable = runtime.environment ? process.env[runtime.environment] ?? runtime.executable : runtime.executable;
  const run = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 10000, maxBuffer: 65536 });
  if (run.error || run.status !== 0) throw Error(`Required runtime unavailable: ${executable}: ${run.error?.message ?? run.stderr}`);
  const version = run.stdout.trim();
  if (version !== runtime.version) throw Error(`Runtime version mismatch: ${executable}: expected ${runtime.version}, received ${version}`);
  return { executable, resolvedExecutable: realpathSync(executable), version, versionCommand: [executable, '--version'] };
}
export async function runCompatibility(file) {
  const results = [];
  for (const [name, pin] of Object.entries(await runtimePins())) {
    const runtime = checkRuntime(pin);
    const runs = [];
    for (const [distribution, entry] of [['emitted', resolve('tests/fixtures/distribution/consumer.mjs')], ['bundled', resolve(file)]]) {
      for (const argv of [['inspect', '--json'], ['contracts', '--json'], ['--help'], ['inspect', '--help'], ['--version'], ['exit-codes'], ['--!distribution-invalid']]) {
        const expected = argv[0] === '--!distribution-invalid' ? 2 : 0;
        const args = [entry, ...argv];
        const run = spawnSync(runtime.executable, args, { cwd: dirname(entry), encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 });
        if (run.error || run.status !== expected) throw Error(`Compatibility execution failed (${name}/${distribution}): ${run.error?.message ?? run.stderr + run.stdout}`);
        const bytes = Buffer.byteLength(run.stdout) + Buffer.byteLength(run.stderr);
        if (bytes > 8192) throw Error('Consumer executable exceeded its byte bound');
        let passed;
        if (argv.includes('--json')) {
          if (run.stderr !== '') throw Error('JSON consumer unexpectedly wrote stderr');
          const data = JSON.parse(run.stdout).payload.data;
          if (argv[0] === 'inspect' && data.distribution !== 'single-file') throw Error('Consumer inspect result missing');
          if (argv[0] === 'contracts') {
            passed = data.passed;
            if (JSON.stringify(passed) !== JSON.stringify(caseNames)) throw Error('Consumer must execute every inherited contract case');
          }
        }
        runs.push({ distribution, command: [runtime.executable, ...args], exitCode: run.status, bytes, ...(passed ? { passed } : {}) });
      }
    }
    results.push({ name, ...runtime, status: 'passed', runs });
  }
  return { recordedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, runtimes: results };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw Error('Pass the built consumer.mjs path');
  const report = await runCompatibility(process.argv[2]);
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2) + '\n');
  else console.log(JSON.stringify(report, null, 2));
}
