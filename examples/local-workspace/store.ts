import { bytes } from 'cli-for-agents';
import { mkdir, mkdtemp, open, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Node, Receipt, State, StoreInput, Workspace } from './app.js';
const encoder = new TextEncoder();
const limit = bytes(2 * 1024 * 1024);
export function configuredRoot(env: StoreInput['env']): string {
  const root = env['WORKSPACE_HOME'];
  if (!root) throw new Error('Set WORKSPACE_HOME to the root returned by init.');
  return resolve(root);
}
function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string'
    && 'title' in value && typeof value.title === 'string' && 'body' in value && typeof value.body === 'string'
    && 'tags' in value && Array.isArray(value.tags) && value.tags.every((tag: unknown) => typeof tag === 'string');
}
function isReceipt(value: unknown): value is Receipt {
  return typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string'
    && 'nodeId' in value && typeof value.nodeId === 'string' && 'text' in value && typeof value.text === 'string';
}
async function read(input: StoreInput, root: string): Promise<State> {
  const value: unknown = JSON.parse(new TextDecoder().decode(await input.host.files.read(`${root}/data/state.json`, limit, input.signal)));
  if (typeof value !== 'object' || value === null || !('nodes' in value) || !Array.isArray(value.nodes)
    || !value.nodes.every(isNode) || !('receipts' in value) || !Array.isArray(value.receipts) || !value.receipts.every(isReceipt)) throw new Error('Invalid workspace state.');
  return { nodes: value.nodes, receipts: value.receipts };
}
export async function initialize(input: StoreInput): Promise<string> {
  const root = input.env['WORKSPACE_HOME'] ? configuredRoot(input.env) : await mkdtemp(`${input.env['TMPDIR'] ?? '/tmp'}/workspace-`);
  const state: State = { nodes: ['Alpha', 'Beta', 'Gamma', 'Delta'].map((title, index) => ({ id: `n${index + 1}`, title, body: `${title} document`, tags: index < 2 ? ['work', 'shared'] : ['personal'] })), receipts: [] };
  await mkdir(`${root}/data`, { recursive: true });
  await mkdir(`${root}/artifacts`, { recursive: true });
  await input.host.files.writeAtomic(`${root}/data/state.json`, encoder.encode(JSON.stringify(state)), 'reuse-identical-or-refuse');
  return root;
}
export async function acquire(input: StoreInput): Promise<Workspace> {
  const root = configuredRoot(input.env);
  const state = await read(input, root);
  return { root, state, async save(change) {
    // Serialize writers, then reread inside the lock so a cold process cannot overwrite a previous commit.
    const lockPath = `${root}/data/.write-lock`;
    const lock = await open(lockPath, 'wx', 0o600);
    const pending = `${root}/data/.pending`;
    try {
      const current = await read(input, root);
      change(current);
      const encoded = encoder.encode(JSON.stringify(current));
      if (encoded.byteLength > limit) throw new Error('Workspace exceeds the finite store limit.');
      const file = await open(pending, 'wx', 0o600);
      try { await file.writeFile(encoded); await file.sync(); } finally { await file.close(); }
      await rename(pending, `${root}/data/state.json`);
      return current;
    } finally {
      await unlink(pending).catch(error => { if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) throw error; });
      await lock.close();
      await unlink(lockPath);
    }
  } };
}
