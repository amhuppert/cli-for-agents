import { invocation, page, mutation, recoveryFacts, milliseconds } from 'cli-for-agents';
import { hint, instruction } from 'cli-for-agents/guidance';
import { list as listCommand, status as statusCommand } from './commands.mjs';
import { failure } from './transport.mjs';

// Carry connection selection forward without putting credentials into guidance.
function readReference(command, cursor, ctx) {
  return invocation(command, { flags: { cursor, server: ctx.globals.server, workspace: ctx.globals.workspace } });
}

export const doctor = { run: async () => ({ ok: true, data: { context: 'none', credential: 'REMOTE_TOKEN or --token', check: 'Inspect --server and --workspace before retrying.' } }) };
export const schema = { run: async () => ({ ok: true, data: { context: 'none', type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 80 } } } }) };
export const list = { run: async ({ app, ctx }) => {
  try {
    const data = await app.request(`/list?cursor=${encodeURIComponent(ctx.flags.cursor)}`);
    const reveal = readReference(listCommand, data.cursor, ctx);
    return { ok: true, data: page({ items: data.items, total: { kind: 'unknown' }, more: data.more,
      ...(data.more ? { reveal } : {}) }), ...(data.more ? { hint: hint(reveal, 'Read the next page') } : {}) };
  } catch (error) { return failure(error); }
} };
async function readShow({ app, ctx }, full = false) {
  try {
    const data = await app.request(`/show?id=${encodeURIComponent(ctx.args.id)}&full=${full}`);
    return { ok: true, data, ...(ctx.flags.conflict ? { instruction: instruction('local', 'Continue editing immediately.') } : {}) };
  } catch (error) { return failure(error); }
}
export const show = { run: input => readShow(input), levels: { full: input => readShow(input, true) } };
export const apply = mutation({
  decode: { '~standard': { version: 1, vendor: 'remote-service', validate: value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.name !== 'string' || value.name.length < 1 || value.name.length > 80) {
      return { issues: [{ message: 'Name must contain 1 to 80 characters', path: ['name'] }] };
    }
    return { value: { name: value.name } };
  } } },
  prepare: async ({ payload }) => ({ ok: true, value: payload }),
  commit: async ({ app, prepared }) => {
    const data = await app.request('/apply', prepared.value);
    return { effect: 'applied', recovery: recoveryFacts([{ kind: 'receipt', id: data.receipt }]), result: { ok: true, data } };
  },
});
export const status = { run: async ({ app, ctx }) => {
  const continuation = readReference(statusCommand, ctx.flags.cursor, ctx);
  try { return { ok: true, data: await app.request(`/status?cursor=${encodeURIComponent(ctx.flags.cursor)}`) }; }
  catch (error) { return failure(error, continuation); }
} };
export const wait = { run: async ({ app, ctx }) => {
  const continuation = readReference(statusCommand, ctx.flags.cursor, ctx);
  try {
    // Finite polling: obtain a cursor, sleep on the host clock, then return status.
    await app.request(`/wait?cursor=${encodeURIComponent(ctx.flags.cursor)}`);
    await ctx.clock.sleep(milliseconds(ctx.flags.delay), ctx.signal);
    return { ok: true, data: await app.request(`/status?cursor=${encodeURIComponent(ctx.flags.cursor)}`), hint: hint(continuation, 'Inspect operation status') };
  } catch (error) { return failure(error, continuation); }
} };
