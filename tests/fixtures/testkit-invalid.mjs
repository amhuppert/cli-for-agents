// Deliberately violating JavaScript consumer evidence. Start from actual public
// runtime executions, then corrupt exactly the named invariant at the boundary.
// The inherited assertions must reject these even without the runtime decoder.
export function invalidContractFixtures(valid) {
  return {
    ...valid,
    'offline-paths': async () => {
      const evidence = await valid['offline-paths']();
      return { runs: evidence.runs.map((run, i) => i ? run : { ...run, events: [...run.events, { type: 'handler.load', commandPath: 'inspect' }] }) };
    },
    'schema-issue-survival': async () => {
      const evidence = await valid['schema-issue-survival']();
      return { ...evidence, json: { ...evidence.json, envelope: { ...evidence.json.envelope, error: { ...evidence.json.envelope.error, issues: [] } } } };
    },
    'single-guidance-arbitration': async () => {
      const evidence = await valid['single-guidance-arbitration']();
      return { ...evidence, json: { ...evidence.json, events: [...evidence.json.events, { type: 'guidance.arbitrate' }] } };
    },
    'unknown-totals': async () => {
      const evidence = await valid['unknown-totals']();
      const data = evidence.json.envelope.payload.data;
      return { ...evidence, json: { ...evidence.json, envelope: { ...evidence.json.envelope, payload: { kind: 'inline', data: { ...data, omission: { ...data.omission, total: { kind: 'known', count: data.items.length } } } } } } };
    },
    'shell-safe-references': async () => {
      const evidence = await valid['shell-safe-references']();
      return { ...evidence, rendered: `${evidence.executable} ${evidence.reference.path} --query=${evidence.reference.flags.query}` };
    },
    'unicode-spill': async () => {
      const evidence = await valid['unicode-spill']();
      return { ...evidence, spilled: { ...evidence.spilled, stdout: evidence.expectedSpill, artifacts: [] } };
    },
    'operation-recovery': async () => {
      const evidence = await valid['operation-recovery']();
      const { recovery: _lost, ...envelope } = evidence.json.envelope;
      return { ...evidence, json: { ...evidence.json, envelope } };
    },
  };
}
