import { payloadRead } from 'cli-for-agents';
import type { Workspace, Claim } from './app.js';
import type { answerSpec, errors } from './commands.js';
import { claimSchema } from './claim-schema.js';
export default payloadRead<typeof answerSpec, Workspace, Claim, typeof errors.definitions>({ decode: claimSchema,
  run: async ({ payload, app }) => ({ ok: true, data: { nodeId: payload.nodeId, matches: app.state.receipts.some(receipt => receipt.nodeId === payload.nodeId && receipt.text === payload.text) } }),
});
