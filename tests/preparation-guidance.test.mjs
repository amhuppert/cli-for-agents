import assert from "node:assert/strict";
import test from "node:test";
import { bytes, commandsFor, defineErrors, invocation, mutation } from "cli-for-agents";
import { hint, instruction } from "cli-for-agents/guidance";
import { createCli, decodeEnvelope, runCli } from "cli-for-agents/runtime";
import { createTestHost } from "cli-for-agents/testing";

function fixture(guidance) {
  let commits = 0;
  const family = commandsFor()({ errors: defineErrors({ REFUSED: { exitClass: "failed", description: "Admission refused" } }), globalFlags: {} });
  const read = family.defineCommand({ path: "status", summary: "Read status", description: "Inspect current state", requires: "none", effects: "read", args: [], flags: {} }, { examples: [{ why: "Read current state" }], handler: async () => ({ default: { run: async () => ({ ok: true, data: {} }) } }) });
  const write = family.defineCommand({ path: "save", summary: "Save payload", description: "Prepare admission before saving", requires: "none", effects: "write", args: [], flags: {}, payload: { maxBytes: bytes(128), validatePath: "save-check" } }, {
    examples: [{ file: "/input.json", why: "Save a payload" }],
    handler: async () => ({ default: mutation({
      decode: { "~standard": { version: 1, vendor: "fixture", validate: value => ({ value }) } },
      prepare: async () => ({ ok: false, error: family.errors.error("REFUSED", { message: "Human review is required", why: "The decision belongs to the human reviewer." }), ...guidance(read) }),
      commit: async () => { commits++; throw new Error("refused preparation must never commit"); },
    }) }),
  });
  const cli = createCli({ name: "tool", version: "1", family, commands: [read, write], contexts: {}, doctor: invocation(read, {}), output: { artifacts: { directory: "/artifacts", forbiddenRoots: [] } } });
  return { cli, commits: () => commits, run: async (path, json = true) => runCli(cli, { argv: [path, "--file", "/input.json", ...(json ? ["--json"] : [])], env: {}, host: createTestHost({ files: { "/input.json": "{}" } }), signal: new AbortController().signal }) };
}

for (const path of ["save", "save-check"]) {
  test(`${path} preserves the preparation refusal's authoritative instruction without committing`, async () => {
    const x = fixture(() => ({ instruction: instruction("server-review", "Open the human review page before retrying.") }));
    const result = await x.run(path);
    const wire = decodeEnvelope(JSON.parse(result.stdout));
    assert.equal(result.exitCode, 1);
    assert.equal(wire.effect, path === "save" ? "not_applied" : "read");
    assert.equal(wire.error.code, "REFUSED");
    assert.equal(wire.error.why, "The decision belongs to the human reviewer.");
    assert.equal(wire.instruction, "Open the human review page before retrying.");
    assert.equal(wire.hint, undefined);
    const text = await x.run(path, false);
    assert.match(text.stdout + text.stderr, /instruction: Open the human review page before retrying\./);
    assert.equal(x.commits(), 0);
  });
  test(`${path} preserves a preparation refusal's registered next-read hint`, async () => {
    const x = fixture(read => ({ hint: hint(invocation(read, {}), "Inspect admission state") }));
    const wire = decodeEnvelope(JSON.parse((await x.run(path)).stdout));
    assert.equal(wire.error.code, "REFUSED");
    assert.match(wire.hint, /Inspect admission state/);
    assert.equal(wire.instruction, undefined);
    assert.equal(x.commits(), 0);
  });
}
for (const [name, guidance] of [
  ["conflicting tiers", read => ({ hint: hint(invocation(read, {}), "Inspect"), instruction: instruction("server-review", "Review first") })],
  ["malformed instruction", () => ({ instruction: { ownerId: "server-review", text: "" } })],
  ["unexpected payload", () => ({ data: { hidden: true } })],
]) test(`preparation refuses ${name} before commit`, async () => {
  const x = fixture(guidance);
  const wire = decodeEnvelope(JSON.parse((await x.run("save")).stdout));
  assert.equal(wire.error.code, "KERNEL_CONTRACT");
  assert.equal(wire.effect, "not_applied");
  assert.equal(x.commits(), 0);
});
