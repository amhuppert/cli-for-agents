import { binaryArtifact, type ReadHandler } from 'cli-for-agents';
import type { Workspace } from './app.js';
import type { exportSpec, errors } from './commands.js';
const handler: ReadHandler<typeof exportSpec, Workspace, typeof errors.definitions> = { run: async ({ app, ctx }) => {
  const node = app.state.nodes.find(node => node.id === ctx.args.id);
  return node ? { ok: true, binary: binaryArtifact<{ id: string }>({ bytes: new TextEncoder().encode(node.body), mediaType: 'application/octet-stream', basename: 'document.bin', summary: { id: node.id } }) }
    : { ok: false, error: ctx.errors.error('NODE_MISSING', { message: 'Node not found.' }) };
} };
export default handler;
