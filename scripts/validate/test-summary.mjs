import { readFileSync } from 'node:fs';

const [path, status] = process.argv.slice(2);
const output = readFileSync(path, 'utf8');
const counts = {};
// Node's TAP reporter emits one unindented aggregate after all worker output.
for (const match of output.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)) {
  counts[match[1]] = Number(match[2]);
}
const complete = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].every(key => key in counts);
// Newer Node versions count a file with an empty root plan as a passing test.
// Those wrappers did not execute a selected test; exclude them from the verdict.
const emptyPlans = [...output.matchAll(/^1\.\.0$/gm)].length;
if (complete) {
  counts.tests = Math.max(0, counts.tests - emptyPlans);
  counts.pass = Math.max(0, counts.pass - emptyPlans);
}
const failed = Number(status) !== 0 || !complete || counts.fail > 0 || counts.cancelled > 0;
const empty = !failed && counts.pass === 0;
if (failed) process.stderr.write(output);
const verdict = failed ? 'failed' : empty ? 'no tests executed' : 'passed';
const summary = complete ? `tests=${counts.tests} passed=${counts.pass} failed=${counts.fail} cancelled=${counts.cancelled} skipped=${counts.skipped} todo=${counts.todo}` : 'test counts unavailable';
process[failed || empty ? 'stderr' : 'stdout'].write(`test: ${verdict}; ${summary}\n`);
process.exitCode = failed ? Number(status) || 1 : empty ? 1 : 0;
