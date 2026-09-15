import { stdout as destination } from 'node:process';
export default { run: async () => { destination.write('unbounded'); return { ok: true, data: {} }; } };
