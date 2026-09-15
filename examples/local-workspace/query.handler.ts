import { invocation, page, runner, type HandlerInput, type Page, type ReadHandler, type FamilyCode } from 'cli-for-agents';
import { hint } from 'cli-for-agents/guidance';
import type { Workspace } from './app.js';
import { query, type querySpec, type errors } from './commands.js';
type Row = { id: string; title: string };
const handler: ReadHandler<typeof querySpec, Workspace, typeof errors.definitions> = { run: runner<HandlerInput<typeof querySpec, Workspace, typeof errors.definitions>, Page<Row>, FamilyCode<typeof errors.definitions>>({
  run: async ({ ctx, app }) => {
    const { limit, cursor, tag, text } = ctx.flags;
    const selected = app.state.nodes.filter(node => tag.every(value => node.tags.includes(value))
      && [text ?? '', ...ctx.args.terms].every(term => node.title.toLowerCase().includes(term.toLowerCase())));
    const items = selected.slice(cursor, cursor + limit).map(({ id, title }) => ({ id, title }));
    const reveal = invocation(query, { args: { terms: ctx.args.terms }, flags: { limit, cursor: cursor + limit, tag, ...(text === undefined ? {} : { text }) } });
    const data = page<Row>({ items, total: { kind: 'unknown' }, ...(cursor + limit < selected.length ? { more: true, reveal } as const : { more: false } as const) });
    return { ok: true, data, hint: hint(invocation(query, { flags: { text: text ?? '' } }), 'Search workspace titles') };
  },
  text: data => `items: ${JSON.stringify(data.items)}\nomission: ${JSON.stringify(data.omission)}`,
}) };

export default handler;
