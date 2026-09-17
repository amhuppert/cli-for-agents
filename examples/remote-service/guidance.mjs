import { defineSteering, evaluateGuidance, instruction } from 'cli-for-agents/guidance';
import { show, apply } from './commands.mjs';

export const stopText = 'Stop and inspect the receipt before another mutation.';
// Guidance rules run in the CLI process over local state; the service only returns data.
const rules = [defineSteering({ id: 'inspect-receipt', appliesTo: [show, apply], when: () => true, tier: 'instruction', render: () => instruction('remote-service', stopText) })];
export default async ({ command }) => evaluateGuidance({ command, state: {}, rules, eventSink: () => {} });
