import { recoveryFacts, type WriteHandler } from 'cli-for-agents';
import type { Workspace } from './app.js';
import type { updateSpec, errors } from './commands.js';
const handler: WriteHandler<typeof updateSpec, Workspace, typeof errors.definitions> = { run: async ({ app, ctx }) => {
  if (!app.state.nodes.some(node => node.id === ctx.args.id)) return { effect: 'not_applied', result: { ok: false, error: ctx.errors.error('NODE_MISSING', { message: 'Node not found.' }) } };
  await app.save(current => { const node = current.nodes.find(node => node.id === ctx.args.id)!; node.title = ctx.flags.title; });
  return { effect: 'applied', recovery: recoveryFacts([{ kind: 'node', id: ctx.args.id }]), result: { ok: true, data: { id: ctx.args.id, title: ctx.flags.title } } };
} };
export default handler;
