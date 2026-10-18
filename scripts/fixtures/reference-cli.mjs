import { commandsFor, defineErrors, defineGroup, defineFlow, invocation, bytes, mutation } from 'cli-for-agents';
import { createCli } from 'cli-for-agents/runtime';

/** Static rule documentation feeds the same leaf sections used by help/reference. */
export const ruleInventory = Object.freeze([{ id: 'inspect-before-write', description: 'Inspect the record before changing it.' }]);
export function createReferenceCli({ documentationDirectory = decodeURIComponent(new URL('../../docs/reference-fixture/', import.meta.url).pathname), skill = 'guide.md', summary = 'Show a record', extraFlag = false, ruleText = ruleInventory[0].description } = {}) {
  const family = commandsFor()({ errors: defineErrors({ RECORD_MISSING: { exitClass: 'failed', description: 'The record does not exist.' } }), globalFlags: { workspace: { description: 'Workspace name', value: { kind: 'string' } } } });
  const unloaded = () => { throw Error('Reference fixture runners must stay unloaded.'); };
  const binding = { examples: [{ why: 'Inspect status' }], handler: async () => unloaded() };
  // Reference validation decodes payload examples, so the payload handler module loads; its runners never run.
  const recordSchema = { '~standard': { version: 1, vendor: 'reference-fixture', validate: value => typeof value?.id === 'string' && typeof value.title === 'string' ? { value } : { issues: [{ message: 'id and title are required' }] } } };
  const writeModule = { default: mutation({ decode: recordSchema, prepare: async () => unloaded(), commit: async () => unloaded() }) };
  const base = { requires: 'none', effects: 'read', args: [], flags: {} };
  const doctor = family.defineCommand({ ...base, path: 'doctor', summary: 'Diagnose local setup', description: 'Inspect local setup without changing it.' }, binding);
  const show = family.defineCommand({ ...base, path: 'records show', summary, description: 'Read a record with explicit detail selection.', args: [{ name: 'id', description: 'Record ID', value: { kind: 'string' } }], flags: extraFlag ? { label: { description: 'Filter by label', value: { kind: 'string' } } } : {}, levels: { full: { output: 'artifact-eligible' } }, skills: [{ path: skill, readWhen: 'Before working with records.' }], sections: [{ kind: 'list', title: 'Rules', items: ruleInventory.map(rule => `${rule.id}: ${ruleText}`) }] }, { ...binding, examples: [{ args: { id: 'example record' }, level: 'full', why: 'Inspect all record details' }] });
  const write = family.defineCommand({ ...base, path: 'records write', summary: 'Write a record', description: 'Validate and apply a bounded payload.', effects: 'write', payload: { maxBytes: bytes(4096), validatePath: 'records validate', examples: [{ payload: { id: 'r1', title: 'First record' }, why: 'Create one record' }] }, related: [{ path: 'records show', description: 'Inspect before changing.' }] }, { examples: [{ file: 'record.json', why: 'Apply a validated record' }], handler: async () => writeModule });
  return createCli({ name: 'reference-fixture', version: '1.0.0', family, commands: [doctor, show, write], groups: [defineGroup({ path: 'records', summary: 'Records', description: 'Inspect and update records.' })], flows: [defineFlow({ id: 'record-update', steps: [{ command: show, description: 'Inspect' }, { command: write, description: 'Apply' }] })], contexts: {}, doctor: invocation(doctor, {}), documentation: { directory: documentationDirectory }, output: { artifacts: { resolve() { throw Error('Reference fixture policy must stay unloaded.'); } } } });
}
export default createReferenceCli();
