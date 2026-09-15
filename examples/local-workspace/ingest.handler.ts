import { recoveryFacts, type WriteHandler } from 'cli-for-agents';
import type { Workspace } from './app.js';
import type { ingestSpec, errors } from './commands.js';
const handler: WriteHandler<typeof ingestSpec, Workspace, typeof errors.definitions> = { run: async ({ app, ctx }) => {
  if (!app.state.nodes.some(node => node.id === ctx.args.id)) return { effect: 'not_applied', result: { ok: false, error: ctx.errors.error('NODE_MISSING', { message: 'Node not found.' }) } };
  await app.save(current => { const node = current.nodes.find(node => node.id === ctx.args.id)!; node.body = ctx.flags.source; });
  return { effect: 'applied', recovery: recoveryFacts([{ kind: 'node', id: ctx.args.id }]), result: { ok: true, data: { id: ctx.args.id, bytes: new TextEncoder().encode(ctx.flags.source).byteLength } } };
} };
export default handler;
