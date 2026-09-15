import { runner, type HandlerInput, type ReadHandler, type FamilyCode } from 'cli-for-agents';
import type { Workspace } from './app.js';
import type { showSpec, errors } from './commands.js';
type Input = HandlerInput<typeof showSpec, Workspace, typeof errors.definitions>;
const get = ({ app, ctx }: Input) => app.state.nodes.find(node => node.id === ctx.args.id);
const handler: ReadHandler<typeof showSpec, Workspace, typeof errors.definitions> = {
  run: runner<Input, { id: string; title: string }, FamilyCode<typeof errors.definitions>>({ run: async input => {
    const node = get(input);
    return node ? { ok: true, data: { id: node.id, title: node.title } } : { ok: false, error: input.ctx.errors.error('NODE_MISSING', { message: 'Node not found.' }) };
  }, text: data => `id: ${JSON.stringify(data.id)}\ntitle: ${JSON.stringify(data.title)}` }),
  levels: {
    context: async input => { const node = get(input); return node ? { ok: true, data: { id: node.id, title: node.title, tags: node.tags } } : { ok: false, error: input.ctx.errors.error('NODE_MISSING', { message: 'Node not found.' }) }; },
    full: async input => { const node = get(input); return node ? { ok: true, data: { ...node, claims: input.app.state.receipts.filter(receipt => receipt.nodeId === node.id) } } : { ok: false, error: input.ctx.errors.error('NODE_MISSING', { message: 'Node not found.' }) }; },
  },
};
export default handler;
