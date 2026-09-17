import assert from "node:assert/strict";
import test from "node:test";
import { bytes, commandsFor, defineErrors, invocation } from "cli-for-agents";
import { createCli, decodeEnvelope, runCli } from "cli-for-agents/runtime";
import { createTestHost } from "cli-for-agents/testing";

const string = { kind: "string" };
for (const scenario of [
  { name: "flag", flags: { revision: { description: "Observed revision", value: string, required: true } }, example: { flags: { revision: "observed" } }, path: ["flags", "revision"], text: "--revision" },
  { name: "argument", args: [{ name: "target", description: "Target", value: string }], example: { args: { target: "one" } }, path: ["args", "target"], text: "<target>" },
  { name: "variadic argument", args: [{ name: "targets", description: "Targets", value: string, variadic: true }], example: { args: { targets: ["one"] } }, path: ["args", "targets"], text: "<targets>" },
  { name: "global flag", globals: { region: { description: "Region", value: string, required: true } }, example: { flags: { region: "local" } }, path: ["globals", "region"], text: "--region" },
  { name: "prose alternative", flags: { body: { description: "Body", value: string, fileSource: { maxBytes: bytes(128) }, required: true } }, example: { flags: { body: "text" } }, path: ["flags", "body"], text: "--body", alternative: "--body-file" },
  { name: "payload file", payload: { maxBytes: bytes(128) }, example: { file: "request.json" }, path: ["file"], text: "--file" },
]) test(`missing required ${scenario.name} names its input in text and structured diagnostics before IO`, async () => {
  let touched = 0;
  const family = commandsFor()({ errors: defineErrors({}), globalFlags: scenario.globals ?? {} });
  const base = { summary: "Inspect", description: "Inspect state", requires: "remote", effects: "read", args: [], flags: {} };
  const doctor = family.defineCommand({ ...base, path: "doctor", requires: "none" }, { examples: [{ ...(scenario.globals ? { flags: { region: "local" } } : {}), why: "Diagnose" }], handler: async () => { touched++; throw new Error("doctor touched"); } });
  const command = family.defineCommand({ ...base, path: "inspect", args: scenario.args ?? [], flags: scenario.flags ?? {}, ...(scenario.payload ? { payload: scenario.payload } : {}) }, { examples: [{ ...scenario.example, why: "Inspect state" }], handler: async () => { touched++; throw new Error("handler touched"); } });
  const cli = createCli({ name: "tool", version: "1", family, commands: [doctor, command], contexts: { remote: async () => { touched++; throw new Error("context touched"); } }, doctor: invocation(doctor, scenario.globals ? { flags: { region: "local" } } : {}), output: { artifacts: { directory: "/artifacts", forbiddenRoots: [] } }, guidance: { load: async () => { touched++; throw new Error("guidance touched"); }, conflictSink() {} } });
  for (const json of [true, false]) {
    const host = createTestHost();
    const result = await runCli(cli, { argv: ["inspect", ...(json ? ["--json"] : [])], env: {}, host, signal: new AbortController().signal });
    assert.equal(result.exitCode, 2);
    if (json) {
      const wire = decodeEnvelope(JSON.parse(result.stdout));
      assert.equal(wire.error.code, "KERNEL_USAGE");
      assert.deepEqual(wire.error.issues[0].path, scenario.path);
      assert.equal(wire.error.issues[0].code, "invalid_value");
      assert.ok(wire.error.issues[0].message.includes(scenario.text));
      if (scenario.alternative) assert.ok(wire.error.issues[0].message.includes(scenario.alternative));
    } else assert.ok(result.stderr.includes(scenario.text), result.stderr);
    assert.deepEqual(host.calls, []);
    assert.equal(touched, 0);
  }
});
