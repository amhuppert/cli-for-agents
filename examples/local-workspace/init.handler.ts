import { recoveryFacts, type WriteHandler } from 'cli-for-agents';
import type { initSpec, errors } from './commands.js';
import { initialize } from './store.js';
const handler: WriteHandler<typeof initSpec, never, typeof errors.definitions> = { run: async ({ ctx }) => ({ effect: 'applied', recovery: recoveryFacts([{ kind: 'node', id: 'n1' }]), result: { ok: true, data: { root: await initialize(ctx) } } }) };
export default handler;
