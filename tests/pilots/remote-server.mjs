import { createServer } from 'node:http';
import { defineSteering, evaluateGuidance, instruction } from 'cli-for-agents/guidance';
import { show, apply } from '../../examples/remote-service/commands.mjs';

export const stopText = 'Stop and inspect the receipt before another mutation.';
// Every listener, connection, observation and state cell belongs to one test.
export async function startService() {
  const requests = [], firings = [], receipts = [];
  const items = [{ id: 'item-1', name: 'First' }, { id: 'item-2', name: 'Second' }];
  const state = { content: '😀'.repeat(4000), disconnectWait: false, disconnectApply: false };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const authorized = request.headers.authorization === 'Bearer test-token';
      requests.push({ path: url.pathname, cursor: url.searchParams.get('cursor'), workspace: request.headers['x-workspace'], authorized, method: request.method });
      response.setHeader('content-type', 'application/json');
      if (!authorized) { response.writeHead(401); response.end('{}'); return; }
      let data, command;
      if (url.pathname === '/list') {
        const cursor = Number(url.searchParams.get('cursor'));
        data = { items: items.slice(cursor, cursor + 1), more: cursor + 1 < items.length, cursor: state.nextCursor ?? String(cursor + 1) };
      } else if (url.pathname === '/show') {
        const item = items.find(item => item.id === url.searchParams.get('id'));
        if (!item) { response.writeHead(404); response.end('{}'); return; }
        data = { ...item, ...(url.searchParams.get('full') === 'true' ? { content: state.content } : {}) };
        command = show;
      } else if (url.pathname === '/apply' && request.method === 'POST') {
        let body = '';
        for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > 4096) throw Error('Oversized request'); }
        const payload = JSON.parse(body);
        const item = { id: `item-${items.length + 1}`, name: payload.name };
        items.push(item);
        const receipt = { id: `receipt-${receipts.length + 1}`, item: item.id };
        receipts.push(receipt);
        if (state.disconnectApply) { request.socket.destroy(); return; }
        data = { ...item, receipt: receipt.id, content: state.mutationContent ?? '' };
        command = apply;
      } else if (url.pathname === '/status' || url.pathname === '/wait') {
        if (url.pathname === '/wait' && state.disconnectWait) { request.socket.destroy(); return; }
        data = { cursor: url.searchParams.get('cursor'), receipts: receipts.slice(-2), total: receipts.length };
      } else { response.writeHead(404); response.end('{}'); return; }
      const guidance = command ? await evaluateGuidance({ command, authority: 'service', state: {},
        rules: [defineSteering({ id: 'inspect-receipt', appliesTo: [command], when: () => true, tier: 'instruction', render: () => instruction('service', stopText) })],
        eventSink: event => { firings.push(event); },
      }) : undefined;
      response.end(JSON.stringify({ data, ...(guidance ? { guidance } : {}) }));
    } catch { if (!response.destroyed) { response.writeHead(400); response.end('{}'); } }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, firings, items, receipts, state,
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
