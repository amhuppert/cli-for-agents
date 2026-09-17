import { commandsFor, defineErrors, invocation, bytes } from 'cli-for-agents';
import { createCli } from 'cli-for-agents/runtime';

const family = commandsFor()({ errors: defineErrors({}), globalFlags: {} });
const spec = { summary: 'Inspect distribution', description: 'Exercise installed consumer execution', requires: 'none', effects: 'read', args: [], flags: {} };
const inspect = family.defineCommand({ ...spec, path: 'inspect' }, {
  // Snapshot the declared export after lazy loading so this module never imports the handler statically.
  examples: [{ why: 'Inspect the executable' }], handler: async () => ({ default: (await import('./handler.mjs')).default }),
});
const contracts = family.defineCommand({ ...spec, path: 'contracts' }, {
  examples: [{ why: 'Run inherited contracts' }], handler: async () => ({ default: (await import('./contracts.mjs')).default }),
});
export const cli = createCli({ name: 'distribution-fixture', version: '1.0.0', family,
  commands: [inspect, contracts], contexts: {}, doctor: invocation(inspect, {}),
  output: { maxBytes: bytes(8192), artifacts: { directory: '.', forbiddenRoots: [] } },
});
