import { milliseconds, recoveryFacts } from 'cli-for-agents';
import { instruction } from 'cli-for-agents/guidance';

if (process.env['PROCESS_FORBID_EXECUTION']) throw Error('Unexpected handler import');
export default {
  run: async ({ app, ctx }) => {
    await app.record('run');
    const path = ctx.command.spec.path;
    const write = path.startsWith('save');
    if (write) await app.record('mutation');
    if (path === 'wait' || path === 'save-wait') {
      await app.record('waiting');
      await ctx.clock.sleep(milliseconds(60000), ctx.signal);
    }
    if (path === 'failure') return { ok: false, error: ctx.errors.error('OFFLINE', {
      message: 'Disconnected', details: { body: '🌍'.repeat(80000) },
    }) };
    if (write) return { effect: 'applied', recovery: recoveryFacts([{ kind: 'receipt', id: 'saved-1' }]),
      result: { ok: true, data: { body: '🌍'.repeat(80000) }, instruction: instruction('fixture', 'Inspect saved state before another mutation.') } };
    if (path === 'large') return { ok: true, data: { body: '🌍'.repeat(80000) } };
    return { ok: true, data: { value: app.value, hash: await ctx.host.sha256(new Uint8Array()) } };
  },
};
