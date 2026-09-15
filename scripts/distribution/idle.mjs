#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { checkRuntime, runtimePins } from './compatibility.mjs';

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}
export function summarizePairs(pairs) {
  return { floorMedianMs: median(pairs.map(pair => pair.floorMs)), cliMedianMs: median(pairs.map(pair => pair.cliMs)),
    pairedDeltaMedianMs: median(pairs.map(pair => pair.cliMs - pair.floorMs)) };
}
export async function benchmarkIdle(file, { samples = 9 } = {}) {
  if (!Number.isInteger(samples) || samples < 3 || samples > 100) throw Error('Idle samples must be an integer from 3 to 100');
  const runtimes = [], pins = await runtimePins();
  for (const name of ['node20', 'nodeCurrent']) {
    const runtime = checkRuntime(pins[name]);
    const floorCommand = [runtime.executable, '-e', ''];
    const cliCommand = [runtime.executable, resolve(file), '--version'];
    function timed(command, expected) {
      const start = process.hrtime.bigint();
      const run = spawnSync(command[0], command.slice(1), { encoding: 'utf8', timeout: 60000, maxBuffer: 65536,
        env: { ...process.env, NODE_DISABLE_COMPILE_CACHE: '1' } });
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      // Execution correctness is required; elapsed time has no pass/fail threshold.
      if (run.error || run.status !== 0 || run.stderr !== '' || run.stdout !== expected) throw Error(`Idle command failed: ${run.error?.message ?? run.stderr + run.stdout}`);
      return ms;
    }
    const floor = () => timed(floorCommand, '');
    const cli = () => timed(cliCommand, 'distribution-fixture 1.0.0\n');
    floor(); cli(); // One discarded warmup pair; every measured sample is a fresh process.
    const pairs = [];
    for (let index = 0; index < samples; index++) {
      const order = index % 2 ? 'cli-first' : 'floor-first';
      let floorMs, cliMs;
      if (index % 2) { cliMs = cli(); floorMs = floor(); }
      else { floorMs = floor(); cliMs = cli(); }
      pairs.push({ order, floorMs, cliMs });
    }
    runtimes.push({ name, ...runtime, floorCommand, cliCommand, warmupPairs: 1, pairs, ...summarizePairs(pairs) });
  }
  return { recordedAt: new Date().toISOString(), platform: process.platform, arch: process.arch,
    timingGate: false, compileCache: 'disabled', method: 'Fresh child processes, one discarded warmup pair, alternating pair order; wall time includes spawn overhead and host contention.', runtimes };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw Error('Pass the built consumer.mjs path');
  const report = await benchmarkIdle(process.argv[2]);
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2) + '\n');
  else console.log(JSON.stringify(report, null, 2));
}
