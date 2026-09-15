import { writeSync as emit } from 'node:fs';
export default { run: async () => { emit(1, 'unbounded'); return { ok: true, data: {} }; } };
