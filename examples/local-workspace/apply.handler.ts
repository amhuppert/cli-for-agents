import { mutation, recoveryFacts } from 'cli-for-agents';
import { instruction } from 'cli-for-agents/guidance';
import type { Workspace, Claim } from './app.js';
import type { applySpec, errors } from './commands.js';
import { claimSchema } from './claim-schema.js';
export const appliedInstruction = 'Inspect saved state before another mutation.';
/** What `claim validate` shows before anything is saved. */
export interface ClaimPreview { readonly nodeId: string; readonly nodeTitle: string; readonly characters: number; readonly existingClaims: number }
export default mutation<typeof applySpec, Workspace, Claim, typeof errors.definitions, {}, Claim, ClaimPreview>({ decode: claimSchema,
  prepare: async ({ payload, app, ctx }) => {
    const node = app.state.nodes.find(candidate => candidate.id === payload.nodeId);
    if (!node) return { ok: false, error: ctx.errors.error('NODE_MISSING', { message: 'Node not found.' }) };
    return { ok: true, value: payload, preview: { nodeId: node.id, nodeTitle: node.title, characters: payload.text.length,
      existingClaims: app.state.receipts.filter(receipt => receipt.nodeId === node.id).length } };
  },
  commit: async ({ app, prepared }) => {
    const saved = await app.save(current => { current.receipts.push({ ...prepared.value, id: `r${current.receipts.length + 1}` }); });
    const receipt = saved.receipts[saved.receipts.length - 1]!;
    return { effect: 'applied', recovery: recoveryFacts([{ kind: 'receipt', id: receipt.id }]), result: { ok: true, data: { receipt }, instruction: instruction('claim-saved', appliedInstruction) } };
  },
});
