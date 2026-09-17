import assert from "node:assert/strict";
import test from "node:test";
import { bytes, commandsFor, defineErrors, invocation, mutation, recoveryFacts } from "cli-for-agents";
import { evaluateGuidance } from "cli-for-agents/guidance";
import { createCli, runCli } from "cli-for-agents/runtime";
import { createTestHost } from "cli-for-agents/testing";

function fixture() {
  const seen = { prepare: [], commit: [], guidance: [] };
  const file = { kind: "file", maxBytes: bytes(256) };
  const family = commandsFor()({ errors: defineErrors({}), globalFlags: { config: { description: "Configuration file", value: file }, credential: { description: "Secret file", value: file, secret: true }, token: { description: "Token", value: { kind: "string" }, secret: true, credential: { env: "TOKEN" } } } });
  const status = family.defineCommand({ path: "status", summary: "Read status", description: "Inspect state", requires: "none", effects: "read", args: [], flags: {} }, { examples: [{ why: "Inspect state" }], handler: async () => ({ default: { run: async () => ({ ok: true, data: {} }) } }) });
  const save = family.defineCommand({ path: "save", summary: "Save payload", description: "Save a file with related text", requires: "none", effects: "write", args: [{ name: "document", description: "Document file", value: file }], flags: { body: { description: "Prose", value: { kind: "string" }, fileSource: { maxBytes: bytes(256) } }, attachment: { description: "Attachment file", value: file }, private: { description: "Private attachment", value: file, secret: true } }, payload: { maxBytes: bytes(256), validatePath: "save-check" } }, { examples: [{ args: { document: "doc.txt" }, file: "payload.json", why: "Save data" }], handler: async () => ({ default: mutation({
    decode: { "~standard": { version: 1, vendor: "fixture", validate: value => ({ value }) } },
    prepare: async ({ ctx }) => { seen.prepare.push(ctx.inputFiles); return { ok: true, value: {} }; },
    commit: async ({ ctx }) => { seen.commit.push(ctx.inputFiles); return { effect: "applied", recovery: recoveryFacts([{ kind: "item", id: "saved" }]), result: { ok: true, data: {} } }; },
  }) }) });
  const cli = createCli({ name: "tool", version: "1", family, commands: [status, save], contexts: {}, doctor: invocation(status, {}), output: { artifacts: { directory: "/artifacts", forbiddenRoots: [] } }, guidance: { load: async () => ({ default: async input => { seen.guidance.push(input.inputFiles); return evaluateGuidance({ command: input.command, state: {} }); } }), conflictSink() {} } });
  const run = (argv, stdin) => runCli(cli, { argv: [...argv, "--json"], env: { TOKEN: "environment-secret" }, host: createTestHost({ files: { "/artifacts/.keep": "", "doc.txt": "DOCUMENT CONTENT", "payload.json": '{"value":"PAYLOAD CONTENT"}', "body.txt": "BODY CONTENT", "attach.txt": "ATTACHMENT CONTENT", "settings.json": "CONFIG CONTENT", "secret.txt": "SECRET CONTENT", "private.txt": "PRIVATE CONTENT" }, ...(stdin === undefined ? {} : { stdin }) }), signal: new AbortController().signal });
  return { seen, run };
}

for (const path of ["save", "save-check"]) test(`${path} shares immutable original file origins with handlers and guidance while excluding secrets and content`, async () => {
  const x = fixture();
  const result = await x.run([path, "doc.txt", "--body-file", "body.txt", "--attachment", "attach.txt", "--config", "settings.json", "--credential", "secret.txt", "--private", "private.txt", "--file", "payload.json"]);
  assert.equal(result.exitCode, 0, result.stdout + result.stderr);
  const expected = [
    { kind: "argument", name: "document", path: "doc.txt" },
    { kind: "flag", name: "body", path: "body.txt" },
    { kind: "flag", name: "attachment", path: "attach.txt" },
    { kind: "global", name: "config", path: "settings.json" },
    { kind: "payload", name: "file", path: "payload.json" },
  ];
  const byOrigin = (left, right) => `${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`);
  assert.deepEqual([...x.seen.prepare[0]].sort(byOrigin), expected.sort(byOrigin));
  assert.equal(x.seen.guidance[0], x.seen.prepare[0]);
  assert.equal(x.seen.commit.length, path === "save" ? 1 : 0);
  if (path === "save") assert.equal(x.seen.commit[0], x.seen.prepare[0]);
  assert.ok(Object.isFrozen(x.seen.guidance[0]));
  assert.ok(x.seen.guidance[0].every(Object.isFrozen));
  assert.doesNotMatch(JSON.stringify(x.seen.guidance[0]), /CONTENT|secret|private|environment/);
});

test("stdin keeps its original '-' origin and inline prose creates no file origin", async () => {
  const x = fixture();
  const result = await x.run(["save", "doc.txt", "--file", "-", "--body", "inline content"], "{}");
  assert.equal(result.exitCode, 0, result.stdout + result.stderr);
  assert.deepEqual(x.seen.guidance[0], [{ kind: "argument", name: "document", path: "doc.txt" }, { kind: "payload", name: "file", path: "-" }]);
});

test("local file refusal does not invoke handlers or guidance with unvalidated origins", async () => {
  const x = fixture();
  const result = await x.run(["save", "missing.txt", "--file", "payload.json"]);
  assert.equal(result.exitCode, 2);
  assert.deepEqual(x.seen, { prepare: [], commit: [], guidance: [] });
});
