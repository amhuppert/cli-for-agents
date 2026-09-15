import { mutation, recoveryFacts } from 'cli-for-agents';
import { instruction } from 'cli-for-agents/guidance';
import type { Workspace, Claim } from './app.js';
import type { applySpec, errors } from './commands.js';
import { claimSchema } from './claim-schema.js';
export const appliedInstruction = 'Inspect saved state before another mutation.';
export default mutation<typeof applySpec, Workspace, Claim, typeof errors.definitions, {}, Claim>({ decode: claimSchema,
  prepare: async ({ payload, app, ctx }) => app.state.nodes.some(node => node.id === payload.nodeId)
    ? { ok: true, value: payload } : { ok: false, error: ctx.errors.error('NODE_MISSING', { message: 'Node not found.' }) },
  commit: async ({ app, prepared }) => {
    const saved = await app.save(current => { current.receipts.push({ ...prepared.value, id: `r${current.receipts.length + 1}` }); });
    const receipt = saved.receipts[saved.receipts.length - 1]!;
    return { effect: 'applied', recovery: recoveryFacts([{ kind: 'receipt', id: receipt.id }]), result: { ok: true, data: { receipt }, instruction: instruction('claim-saved', appliedInstruction) } };
  },
});
