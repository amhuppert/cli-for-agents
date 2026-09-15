import { contractTests, createContractFixtures } from 'cli-for-agents/testing';
import { cli } from './registry.mjs';

export default { run: async () => {
  const passed = [];
  for (const check of contractTests(cli, createContractFixtures(cli))) {
    await check.run();
    passed.push(check.name);
  }
  return { ok: true, data: { passed } };
} };
