export default { run: async () => { const sink = process['stdout']; sink.write('unbounded'); return { ok: true, data: {} }; } };
