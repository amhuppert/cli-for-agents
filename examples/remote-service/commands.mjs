import { commandsFor, defineErrors, invocation, bytes } from 'cli-for-agents';
import { createCli } from 'cli-for-agents/runtime';

export const errors = defineErrors({
  UNAVAILABLE: { exitClass: 'connection', description: 'The service could not acknowledge the request.' },
  UNAUTHORIZED: { exitClass: 'connection', description: 'The service rejected the credential.' },
  NOT_FOUND: { exitClass: 'failed', description: 'The requested item does not exist.' },
});
export const family = commandsFor()({ errors, globalFlags: {
  server: { description: 'Service URL', value: { kind: 'url' }, default: 'http://127.0.0.1:1' },
  token: { description: 'Service credential', value: { kind: 'string' }, secret: true, credential: { env: 'REMOTE_TOKEN' } },
  workspace: { description: 'Workspace', value: { kind: 'string' }, default: 'demo' },
} });
const base = { summary: 'Inspect remote service', description: 'Bounded request and response; waits return a cursor.', effects: 'read', requires: 'remote', args: [], flags: {} };
const bind = (spec, name, example = {}) => family.defineCommand({ ...base, ...spec }, {
  examples: [{ ...example, why: 'Inspect service state' }],
  handler: async () => ({ default: (await import('./handlers.mjs'))[name] }),
});
export const doctor = bind({ path: 'doctor', requires: 'none' }, 'doctor');
export const schema = bind({ path: 'schema', requires: 'none' }, 'schema');
export const list = bind({ path: 'list', flags: { cursor: { description: 'Next page cursor', value: { kind: 'string' }, default: '0' } } }, 'list');
export const show = bind({ path: 'show', args: [{ name: 'id', description: 'Item ID', value: { kind: 'string' } }], flags: { conflict: { description: 'Exercise local protocol conflict', value: { kind: 'boolean' } } }, levels: { full: { output: 'artifact-eligible' } } }, 'show', { args: { id: 'item-1' } });
export const apply = bind({ path: 'apply', effects: 'write', payload: { maxBytes: bytes(4096), validatePath: 'validate' } }, 'apply', { file: 'input.json' });
export const status = bind({ path: 'status', flags: { cursor: { description: 'Operation cursor', value: { kind: 'string' }, default: '0' } } }, 'status');
export const wait = bind({ path: 'wait', flags: { cursor: { description: 'Operation cursor', value: { kind: 'string' }, default: '0' }, delay: { description: 'Wait milliseconds', value: { kind: 'integer', min: 0, max: 60000 }, default: 1000 } } }, 'wait');
export const commands = [doctor, schema, list, show, apply, status, wait];
export function createRemoteCli({ directory = '.', conflictSink = () => {}, acquire } = {}) {
  return createCli({ name: 'remote-service', version: '1.0.0', family, commands,
    contexts: { remote: acquire ?? (async input => (await import('./transport.mjs')).acquire(input)) },
    doctor: invocation(doctor, {}),
    guidance: { load: async () => ({ default: (await import('./guidance.mjs')).default }), conflictSink },
    output: { maxBytes: bytes(8192), artifacts: { directory, forbiddenRoots: [] } },
  });
}
