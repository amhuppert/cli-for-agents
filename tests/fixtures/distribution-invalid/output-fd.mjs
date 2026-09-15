import { writeSync } from 'node:fs';
export default { run: async () => { writeSync(1, 'unbounded'); return { ok: true, data: {} }; } };
