import { bytes, invocation, recoveryFacts } from 'cli-for-agents';
import { defineSteering, evaluateGuidance, instruction } from 'cli-for-agents/guidance';
import { nodeHost, helpNode, renderInvocation, type Host, type Environment } from 'cli-for-agents/runtime';
import { contractTests, runForTest, type ContractFixtures, type JsonTestRun, type TestRunResult } from 'cli-for-agents/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { createWorkspaceCli, cli } from './cli.js';
import { apply, query } from './commands.js';
import { appliedInstruction } from './apply.handler.js';

type LocalCli = ReturnType<typeof createWorkspaceCli>;
type Fixture = { cli: LocalCli; host: Host; env: Environment; root: string };
const signal = () => new AbortController().signal;
const encoder = new TextEncoder();
async function json(fixture: Fixture, argv: readonly string[]): Promise<JsonTestRun> {
  const result = await runForTest(fixture.cli, argv, { host: fixture.host, env: fixture.env, format: 'json' });
  if (result.format !== 'json') throw new Error('Expected JSON fixture evidence.');
  return result;
}
function success(result: TestRunResult): void {
  if (result.exitCode !== 0) throw new Error(`Fixture setup failed: ${result.stdout}${result.stderr}`);
}
async function pair(fixture: Fixture, argv: readonly string[]) {
  return { json: await json(fixture, argv), text: await runForTest(fixture.cli, argv, { host: fixture.host, env: fixture.env, format: 'text' }) };
}
async function workspace<T>(run: (fixture: Fixture) => Promise<T>, selected = cli): Promise<T> {
  const root = await mkdtemp('/tmp/local-contract-');
  try {
    const fixture = { cli: selected, host: await nodeHost(), env: { WORKSPACE_HOME: root }, root };
    success(await json(fixture, ['init']));
    return await run(fixture);
  } finally { await rm(root, { recursive: true, force: true }); }
}
async function input(fixture: Fixture, name: string, text: string): Promise<string> {
  const path = `${fixture.root}/${name}`;
  await fixture.host.files.writeAtomic(path, encoder.encode(text), 'reuse-identical-or-refuse');
  return path;
}

/** Every scenario uses this consumer registry and real local files. Host fault
 * injection affects artifact publication only; the domain commit stays real. */
export function localContractFixtures(): ContractFixtures {
  return {
    'offline-paths': async () => {
      const host = await nodeHost();
      const paths = [''];
      for (let i = 0; i < paths.length; i++) paths.push(...helpNode(cli, paths[i]!).children.map(child => child.path));
      const first = await runForTest(cli, ['--version'], { host, format: 'json' });
      const runs: [TestRunResult, ...TestRunResult[]] = [first];
      for (const format of ['text', 'json'] as const) {
        for (const path of paths) runs.push(await runForTest(cli, [...path.split(' ').filter(Boolean), '--help'], { host, format }));
        for (const argv of [['--version'], ['exit-codes'], ['--!invalid']]) runs.push(await runForTest(cli, argv, { host, format }));
      }
      return { runs };
    },
    'schema-issue-survival': () => workspace(async fixture => {
      const file = await input(fixture, 'invalid.json', '{}');
      const absent = { ...fixture, env: { WORKSPACE_HOME: `${fixture.root}/absent` } };
      return { ...await pair(absent, ['claim', 'apply', '--file', file]), expectedIssues: [{ code: 'schema', message: 'nodeId is required', path: ['nodeId'] }] };
    }),
    'single-guidance-arbitration': () => {
      const selected = createWorkspaceCli({ load: async () => ({ default: async () => evaluateGuidance({
        command: apply, state: {},
        rules: [defineSteering({ id: 'workspace-review', appliesTo: [apply], when: () => true, tier: 'instruction', render: () => instruction('review-required', 'Stop and request review of the saved claim.') })], eventSink: () => {},
      }) }), conflictSink: () => {} });
      // Bootstrap with ordinary policy: the conflicting provider applies only to the mutation run.
      return workspace(async fixture => {
        const file = await input(fixture, 'claim.json', JSON.stringify({ nodeId: 'n1', text: 'Conflict evidence' }));
        return pair({ ...fixture, cli: selected }, ['claim', 'apply', '--file', file]);
      });
    },
    'unknown-totals': () => workspace(async fixture => ({
      json: await json(fixture, ['query']), returned: 2,
      continuation: invocation(query, { args: { terms: [] }, flags: { limit: 2, cursor: 2, tag: [] } }),
    })),
    'shell-safe-references': () => workspace(async fixture => {
      const text = "a b' $(touch nope); `echo nope` \\";
      const reference = invocation(query, { flags: { text } });
      return { json: await json(fixture, ['query', '--text', text]), reference, executable: 'workspace', rendered: renderInvocation(reference, 'workspace') };
    }),
    'unicode-spill': () => workspace(async fixture => {
      const empty = await input(fixture, 'empty.txt', '');
      success(await json(fixture, ['ingest', 'n1', '--source', empty]));
      const argv = ['show', 'n1', '--context', '--full'];
      const baseline = await json(fixture, argv);
      success(baseline);
      const remaining = 8192 - encoder.encode(baseline.stdout).byteLength;
      const body = '😀'.repeat(Math.floor(remaining / 4)) + 'x'.repeat(remaining % 4);
      const exact = await input(fixture, 'exact.txt', body);
      success(await json(fixture, ['ingest', 'n1', '--source', exact]));
      const inline = await json(fixture, argv);
      const overflow = await input(fixture, 'overflow.txt', body + '😀');
      success(await json(fixture, ['ingest', 'n1', '--source', overflow]));
      const expectedSpill = JSON.stringify({ ...inline.envelope, payload: { kind: 'inline', data: {
        id: 'n1', title: 'Alpha', body: body + '😀', tags: ['work', 'shared'], claims: [],
      } } }) + '\n';
      const spilled = await json(fixture, argv);
      const manifest = spilled.artifacts[0];
      if (!manifest) throw new Error(`Missing Unicode artifact: ${spilled.stdout}`);
      return { inline, spilled, budget: bytes(8192), expectedSpill,
        artifactBytes: await fixture.host.files.read(manifest.path, bytes(65536), signal()) };
    }),
    'operation-recovery': async () => {
      async function failed(format: 'text' | 'json') {
        return workspace(async fixture => {
          const file = await input(fixture, 'large-claim.json', JSON.stringify({ nodeId: 'n1', text: '😀'.repeat(4000) }));
          const failing: Host = { ...fixture.host, files: { ...fixture.host.files,
            writeAtomic: async () => { throw new Error('Injected artifact publication failure after durable commit.'); },
          } };
          const result = await runForTest(fixture.cli, ['claim', 'apply', '--file', file], { host: failing, env: fixture.env, format });
          // A separate acquisition proves the receipt survived the failed response.
          const checked = await json(fixture, ['answer-check', '--file', file]);
          success(checked);
          if (!checked.envelope.ok || checked.envelope.payload.kind !== 'inline'
            || typeof checked.envelope.payload.data !== 'object' || checked.envelope.payload.data === null
            || !('matches' in checked.envelope.payload.data) || checked.envelope.payload.data['matches'] !== true) throw new Error('Durable claim disappeared after artifact failure.');
          return result;
        });
      }
      const jsonRun = await failed('json');
      if (jsonRun.format !== 'json') throw new Error('Expected JSON recovery evidence.');
      return { json: jsonRun, text: await failed('text'), effect: 'applied', recovery: recoveryFacts([{ kind: 'receipt', id: 'r1' }]), instruction: appliedInstruction };
    },
  };
}
export async function runLocalContracts(): Promise<string[]> {
  const passed = [];
  for (const check of contractTests(cli, localContractFixtures())) { await check.run(); passed.push(check.name); }
  return passed;
}
