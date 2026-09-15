import type { StandardSchema } from 'cli-for-agents';
import type { Claim } from './app.js';
export const claimSchema: StandardSchema<Claim> = { '~standard': { version: 1, vendor: 'local-workspace', validate(value) {
  if (typeof value !== 'object' || value === null || !('nodeId' in value) || typeof value.nodeId !== 'string' || !value.nodeId || value.nodeId.length > 64) return { issues: [{ message: 'nodeId is required', path: ['nodeId'] }] };
  if (!('text' in value) || typeof value.text !== 'string' || !value.text || value.text.length > 32000) return { issues: [{ message: 'text is required (1–32000 characters)', path: ['text'] }] };
  return { value: { nodeId: value.nodeId, text: value.text } };
} } };
