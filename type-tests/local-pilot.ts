import { nodeHost } from 'cli-for-agents/runtime';
import { runForTest } from 'cli-for-agents/testing';
import { cli } from '../examples/local-workspace/cli.js';

// Consumer contract scenarios must accept a real filesystem host without a forged TestHost brand.
export async function localPilotHostControl() {
  return runForTest(cli, ['doctor'], { host: await nodeHost(), format: 'json' });
}
