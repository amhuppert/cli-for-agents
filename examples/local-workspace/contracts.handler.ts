import type { ReadHandler } from 'cli-for-agents';
import type { contractsSpec, errors } from './commands.js';
import { runLocalContracts } from './contracts.fixture.js';
const handler: ReadHandler<typeof contractsSpec, never, typeof errors.definitions> = { run: async () => ({ ok: true, data: { passed: await runLocalContracts() } }) };
export default handler;
