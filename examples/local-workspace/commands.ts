import { bytes, commandsFor, defineErrors, defineGroup } from 'cli-for-agents';
import type { Workspace } from './app.js';
export const errors = defineErrors({
  WORKSPACE_UNAVAILABLE: { exitClass: 'connection', description: 'Initialize the workspace and verify WORKSPACE_HOME.' },
  NODE_MISSING: { exitClass: 'failed', description: 'The node does not exist in this workspace.' },
});
export const family = commandsFor<{ workspace: Workspace }>()({ errors, globalFlags: {} });
const base = { summary: 'Inspect workspace', description: 'Read local JSON workspace state.', requires: 'workspace', effects: 'read', args: [], flags: {} } as const;
const nodeArgs = [{ name: 'id', description: 'Stable node handle.', value: { kind: 'string', minLength: 1, maxLength: 64 } }] as const;
const define = family.defineCommand;
export const doctorSpec = { ...base, path: 'doctor', requires: 'none' } as const;
export const doctor = define(doctorSpec, { examples: [{ why: 'Check configuration before retrying.' }], handler: async () => ({ default: (await import('./doctor.handler.js')).default }) });
export const initSpec = { ...base, path: 'init', requires: 'none', effects: 'write' } as const;
export const init = define(initSpec, { examples: [{ why: 'Create a temporary workspace.' }], handler: async () => ({ default: (await import('./init.handler.js')).default }) });
export const querySpec = { ...base, path: 'query', flags: {
  limit: { description: 'Maximum rows.', value: { kind: 'integer', min: 1, max: 20 }, default: 2 },
  cursor: { description: 'Row offset.', value: { kind: 'integer', min: 0 }, default: 0 },
  tag: { description: 'Require each tag.', value: { kind: 'string' }, repeatable: true },
  text: { description: 'Title search.', value: { kind: 'string' }, fileSource: { maxBytes: bytes(4096) } },
}, args: [{ name: 'terms', description: 'Additional title terms.', value: { kind: 'string' }, required: false, variadic: true }] } as const;
export const query = define(querySpec, { examples: [{ why: 'Read the first bounded page.' }], handler: async () => ({ default: (await import('./query.handler.js')).default }) });
export const showSpec = { ...base, path: 'show', args: nodeArgs, levels: {
  context: { output: 'bounded' }, full: { selectors: ['context', 'full'], output: 'artifact-eligible' },
} } as const;
export const show = define(showSpec, { examples: [{ args: { id: 'n1' }, why: 'Inspect a stable handle.' }], handler: async () => ({ default: (await import('./show.handler.js')).default }) });
const claimExamples = [{ payload: { nodeId: 'n1', text: 'The claim text, as saved.' }, why: 'Claim one node' }] as const;
export const answerSpec = { ...base, path: 'answer-check', payload: { maxBytes: bytes(65536), examples: claimExamples } } as const;
export const answer = define(answerSpec, { examples: [{ file: 'claim.json', why: 'Check an answer against saved claims.' }], handler: async () => ({ default: (await import('./answer.handler.js')).default }) });
export const applySpec = { ...base, path: 'claim apply', effects: 'write', payload: { maxBytes: bytes(65536), validatePath: 'claim validate', examples: claimExamples } } as const;
export const apply = define(applySpec, { examples: [{ file: 'claim.json', why: 'Validate before applying a claim.' }], handler: async () => ({ default: (await import('./apply.handler.js')).default }) });
export const updateSpec = { ...base, path: 'update', args: nodeArgs, effects: 'write', flags: { title: { description: 'New title.', value: { kind: 'string', minLength: 1, maxLength: 200 }, required: true, fileSource: { maxBytes: bytes(1024) } } } } as const;
export const update = define(updateSpec, { examples: [{ args: { id: 'n1' }, flags: { title: 'New title' }, why: 'Change one scalar.' }], handler: async () => ({ default: (await import('./update.handler.js')).default }) });
export const ingestSpec = { ...base, path: 'ingest', args: nodeArgs, effects: 'write', flags: { source: { description: 'UTF-8 document path or stdin.', value: { kind: 'file', maxBytes: bytes(65536) }, required: true } } } as const;
export const ingest = define(ingestSpec, { examples: [{ args: { id: 'n1' }, flags: { source: 'document.txt' }, why: 'Ingest raw text.' }], handler: async () => ({ default: (await import('./ingest.handler.js')).default }) });
export const exportSpec = { ...base, path: 'export', args: nodeArgs, output: 'binary' } as const;
export const exportNode = define(exportSpec, { examples: [{ args: { id: 'n1' }, why: 'Export exact UTF-8 bytes.' }], handler: async () => ({ default: (await import('./export.handler.js')).default }) });
export const contractsSpec = { ...base, path: 'contracts', requires: 'none', summary: 'Run inherited contract cases', description: 'Exercise the local store through all seven consumer contract scenarios.' } as const;
export const contracts = define(contractsSpec, { examples: [{ why: 'Verify the local executable contract.' }], handler: async () => ({ default: (await import('./contracts.handler.js')).default }) });
export const groups = [defineGroup({ path: 'claim', summary: 'Manage claims', description: 'Validate and apply structured claims.' })];
export const commands = [doctor, init, query, show, answer, apply, update, ingest, exportNode, contracts];
