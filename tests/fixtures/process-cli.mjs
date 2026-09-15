#!/usr/bin/env node
import { commandsFor, defineErrors, invocation, bytes } from 'cli-for-agents';
import { createCli, main } from 'cli-for-agents/runtime';

const errors = defineErrors({ OFFLINE: { exitClass: 'connection', description: 'Disconnected' } });
const family = commandsFor()({ errors, globalFlags: {} });
const inspect = family.defineCommand({ path: 'inspect', summary: 'Inspect', description: 'Inspect process inputs',
  requires: 'local', effects: 'read', args: [], flags: {} }, {
  examples: [{ why: 'Inspect' }],
  handler: () => import('./process-handler.mjs'),
});
const commands = [inspect, ...['large', 'failure', 'wait', 'save', 'save-wait'].map(path => family.defineCommand({
  path, summary: path, description: path, requires: 'local', effects: path.startsWith('save') ? 'write' : 'read', args: [], flags: {},
}, { examples: [{ why: path }], handler: () => import('./process-handler.mjs') }))];
const cli = createCli({ name: 'process-fixture', version: '1.2.3', family, commands,
  doctor: invocation(inspect, {}), contexts: { local: async ({ env }) => {
    if (env['PROCESS_FORBID_EXECUTION']) throw Error('Unexpected context acquisition');
    const record = async event => {
      if (env['PROCESS_EVENTS']) await (await import('node:fs/promises')).appendFile(env['PROCESS_EVENTS'], event + '\n');
    };
    await record('acquire');
    return { ok: true, app: { value: env['PROCESS_VALUE'] ?? '', record }, release: async () => {
      await new Promise(resolve => setTimeout(resolve, 15));
      await record('release');
    } };
  } }, output: { maxBytes: bytes(1048576), artifacts: { directory: '.', forbiddenRoots: [] } },
});
await main(cli, { compileCache: process.env['PROCESS_COMPILE_CACHE'] === '1' });
