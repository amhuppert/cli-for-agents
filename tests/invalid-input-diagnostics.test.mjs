import assert from "node:assert/strict";
import test from "node:test";
import { commandsFor, defineErrors, invocation } from "cli-for-agents";
import { createCli, decodeEnvelope, runCli } from "cli-for-agents/runtime";
import { createTestHost } from "cli-for-agents/testing";

for (const scenario of [
  { name: "bounded integer", value: { kind: "integer", min: 1, max: 100 }, valid: 10, bad: "500", expected: ["1", "100"] },
  { name: "enum", value: { kind: "enum", values: ["accept", "reject"] }, valid: "accept", bad: "private-rejected-input", expected: ["accept", "reject"] },
  { name: "secret string", value: { kind: "string", maxLength: 8 }, valid: "token", bad: "private-rejected-input", secret: true, expected: ["8"] },
  { name: "large enum", value: { kind: "enum", values: ["x".repeat(700), "y".repeat(700)] }, valid: "x".repeat(700), bad: "private-rejected-input", expected: ["--help"] },
]) test(`invalid ${scenario.name} identifies the input and its constraints without exposing its value`, async () => {
  let touched = 0;
  const family = commandsFor()({ errors: defineErrors({}), globalFlags: {} });
  const base = { summary: "Inspect", description: "Inspect state", requires: "none", effects: "read", args: [], flags: {} };
  const doctor = family.defineCommand({ ...base, path: "doctor" }, { examples: [{ why: "Diagnose" }], handler: async () => { throw new Error("doctor touched"); } });
  const command = family.defineCommand({ ...base, path: "inspect", flags: { value: { description: "Selected value", value: scenario.value, ...(scenario.secret ? { secret: true } : {}) } } }, { examples: [{ flags: { value: scenario.valid }, why: "Inspect" }], handler: async () => { touched++; throw new Error("handler touched"); } });
  const cli = createCli({ name: "tool", version: "1", family, commands: [doctor, command], contexts: {}, doctor: invocation(doctor, {}), output: { artifacts: { directory: "/artifacts", forbiddenRoots: [] } } });
  for (const json of [true, false]) {
    const host = createTestHost();
    const result = await runCli(cli, { argv: ["inspect", "--value", scenario.bad, ...(json ? ["--json"] : [])], env: {}, host, signal: new AbortController().signal });
    assert.equal(result.exitCode, 2);
    if (json) {
      const wire = decodeEnvelope(JSON.parse(result.stdout));
      assert.equal(wire.error.code, "KERNEL_USAGE");
      assert.deepEqual(wire.error.issues[0].path, ["flags", "value"]);
      assert.ok(wire.error.issues[0].message.includes("--value"));
      for (const expected of scenario.expected) assert.ok(wire.error.issues[0].message.includes(expected), wire.error.issues[0].message);
    } else {
      assert.ok(result.stderr.includes("--value"), result.stderr);
      for (const expected of scenario.expected) assert.ok(result.stderr.includes(expected), result.stderr);
    }
    assert.ok(!`${result.stdout}${result.stderr}`.includes("private-rejected-input"));
    assert.deepEqual(host.calls, []);
    assert.equal(touched, 0);
  }
});
