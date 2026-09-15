import destination from 'node:process';
export default { run: async () => { destination.stdout.write('unbounded'); return { ok: true, data: {} }; } };
