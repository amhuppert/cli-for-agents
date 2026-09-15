import type { ReadHandler } from 'cli-for-agents';
import type { doctorSpec, errors } from './commands.js';
const handler: ReadHandler<typeof doctorSpec, never, typeof errors.definitions> = { run: async ({ ctx }) => {
  const root = ctx.env['WORKSPACE_HOME'];
  return { ok: true, data: { root: root ?? null, initialized: root ? await ctx.host.files.kind(`${root}/data/state.json`) === 'file' : false } };
} };
export default handler;
