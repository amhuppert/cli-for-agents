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

import { createHash } from "node:crypto";
import { recoveryFacts } from "cli-for-agents";
import { defineSteering, evaluateGuidance } from "cli-for-agents/guidance";
const identity = { "~standard": { version: 1, vendor: "fixture", validate: value => ({ value }) } };
const inputText = '{"items":[1,2]}';
const payloadHash = createHash("sha256").update(inputText).digest("hex");
function previewFixture({ prepare, args = [], flags = {}, globals = {}, passthrough, example = {}, rules } = {}) {
  const state = { prepared: 0, commits: 0, values: [], committed: [], inputs: [] };
  const family = commandsFor()({ errors: defineErrors({ REFUSED: { exitClass: "failed", description: "Admission refused" } }), globalFlags: globals });
  const read = family.defineCommand({ path: "status", summary: "Read status", description: "Inspect current state", requires: "none", effects: "read", args: [], flags: {} }, { examples: [{ why: "Read current state" }], handler: async () => ({ default: { run: async () => ({ ok: true, data: {} }) } }) });
  const write = family.defineCommand({ path: "save", summary: "Save payload", description: "Prepare admission before saving", requires: "none", effects: "write", args, flags, ...(passthrough ? { passthrough: true } : {}), payload: { maxBytes: bytes(4096), validatePath: "save-check" } }, {
    examples: [{ file: "/input.json", ...example, why: "Save a payload" }],
    handler: async () => ({ default: mutation({ decode: identity,
      prepare: async input => {
        state.prepared++;
        state.inputs.push({ args: input.ctx.args, flags: input.ctx.flags, globals: input.ctx.globals, passthrough: input.ctx.passthrough ?? null });
        const value = { handle: new Map([["secret", "opaque-handle"]]), close() {} };
        state.values.push(value);
        return prepare ? prepare({ input, value, read, family }) : { ok: true, value, preview: { records: input.payload.items.length, planned: ["insert"] } };
      },
      commit: async ({ prepared }) => { state.commits++; state.committed.push(prepared); return { effect: "applied", recovery: recoveryFacts([{ kind: "save", id: "s1" }]), result: { ok: true, data: { saved: true } } }; },
    }) }),
  });
  const guidance = rules ? { guidance: { load: async () => ({ default: async ({ command }) => evaluateGuidance({ command, state: {}, rules: rules({ write, read }), eventSink: () => {} }) }), conflictSink: () => {} } } : {};
  const cli = createCli({ name: "tool", version: "1", family, commands: [read, write], contexts: {}, doctor: invocation(read, {}), output: { artifacts: { directory: "/artifacts", forbiddenRoots: [] } }, ...guidance });
  const run = (argv, { stdin, env = {} } = {}) => runCli(cli, { argv, env, host: createTestHost({ files: { "/input.json": inputText, "/notes.txt": "note text" }, ...(stdin === undefined ? {} : { stdin }) }), signal: new AbortController().signal });
  const json = async (argv, options) => { const result = await run(["--json", ...argv], options); return { result, wire: decodeEnvelope(JSON.parse(result.stdout)) }; };
  return { cli, state, run, json, read };
}

test("validation twin returns a JSON preview beside the payload hash in JSON and text", async () => {
  const x = previewFixture();
  const { result, wire } = await x.json(["save-check", "--file", "/input.json"]);
  assert.equal(result.exitCode, 0);
  assert.equal(wire.effect, "read");
  assert.deepEqual(wire.payload.data, { valid: true, payloadHash, preview: { records: 2, planned: ["insert"] } });
  assert.doesNotMatch(result.stdout, /opaque-handle/);
  const text = await x.run(["save-check", "--file", "/input.json"]);
  assert.equal(text.exitCode, 0);
  assert.ok(text.stdout.startsWith(JSON.stringify({ valid: true, payloadHash, preview: { records: 2, planned: ["insert"] } }, null, 2) + "\n"), text.stdout);
  assert.doesNotMatch(text.stdout, /opaque-handle/);
  assert.equal(x.state.commits, 0);
});
for (const preview of [null, 0, "text", [1, "two"]]) test(`any JSON preview value is retained: ${JSON.stringify(preview)}`, async () => {
  const x = previewFixture({ prepare: ({ value }) => ({ ok: true, value, preview }) });
  assert.deepEqual((await x.json(["save-check", "--file", "/input.json"])).wire.payload.data, { valid: true, payloadHash, preview });
});
test("a preparation without preview keeps the prior validation data shape", async () => {
  const x = previewFixture({ prepare: ({ value }) => ({ ok: true, value }) });
  assert.deepEqual((await x.json(["save-check", "--file", "/input.json"])).wire.payload.data, { valid: true, payloadHash });
});
test("the opaque prepared value reaches commit unchanged; each invocation prepares once and only writes commit", async () => {
  const x = previewFixture();
  await x.json(["save-check", "--file", "/input.json"]);
  assert.deepEqual([x.state.prepared, x.state.commits], [1, 0]);
  const { wire } = await x.json(["save", "--file", "/input.json"]);
  assert.deepEqual([x.state.prepared, x.state.commits], [2, 1]);
  assert.deepEqual(wire.payload.data, { saved: true });
  const [prepared] = x.state.committed;
  assert.deepEqual(Object.keys(prepared).sort(), ["payloadHash", "value"]);
  assert.equal(prepared.value, x.state.values[1]);
  assert.equal(Object.isFrozen(prepared.value), false);
  assert.equal(prepared.value.handle.get("secret"), "opaque-handle");
  assert.equal(prepared.payloadHash, payloadHash);
});
for (const [label, preview] of [["Map", new Map([["a", 1]])], ["function", { run() {} }], ["NaN", Number.NaN], ["undefined", undefined], ["class instance", new Date(0)]]) {
  for (const path of ["save", "save-check"]) test(`${path} refuses a non-JSON ${label} preview before commit`, async () => {
    const x = previewFixture({ prepare: ({ value }) => ({ ok: true, value, preview }) });
    const { wire } = await x.json([path, "--file", "/input.json"]);
    assert.equal(wire.error.code, "KERNEL_CONTRACT");
    assert.equal(wire.effect, path === "save" ? "not_applied" : "read");
    assert.equal(x.state.commits, 0);
  });
}
for (const path of ["save", "save-check"]) test(`${path} refuses conflicting successful preparation guidance before commit`, async () => {
  const x = previewFixture({ prepare: ({ value, read }) => ({ ok: true, value, hint: hint(invocation(read, {}), "Inspect"), instruction: instruction("owner", "Stop") }) });
  assert.equal((await x.json([path, "--file", "/input.json"])).wire.error.code, "KERNEL_CONTRACT");
  assert.equal(x.state.commits, 0);
});
test("successful preparation guidance applies to the check response only", async () => {
  const hinted = previewFixture({ prepare: ({ value, read }) => ({ ok: true, value, hint: hint(invocation(read, {}), "Inspect status first") }) });
  assert.equal((await hinted.json(["save-check", "--file", "/input.json"])).wire.hint, "Inspect status first: tool status");
  const written = (await hinted.json(["save", "--file", "/input.json"])).wire;
  assert.equal(written.hint, undefined);
  assert.deepEqual(written.payload.data, { saved: true });
  const instructed = previewFixture({ prepare: ({ value }) => ({ ok: true, value, instruction: instruction("reviewer", "Confirm the planned changes.") }) });
  const check = (await instructed.json(["save-check", "--file", "/input.json"])).wire;
  assert.equal(check.instruction, "Confirm the planned changes.");
  assert.equal(check.hint, undefined);
  assert.equal((await instructed.json(["save", "--file", "/input.json"])).wire.instruction, undefined);
  const text = await instructed.run(["save-check", "--file", "/input.json"]);
  assert.match(text.stdout, /^instruction: Confirm the planned changes\.$/m);
});

// A successful check suggests replaying the same inputs as the write.
function shellTokens(line) {
  const tokens = []; let token = "", active = false, quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === "'") { quoted = !quoted; active = true; }
    else if (!quoted && char === "\\" && line[index + 1] === "'") { token += "'"; index++; active = true; }
    else if (!quoted && char === " ") { if (active) tokens.push(token); token = ""; active = false; }
    else { token += char; active = true; }
  }
  if (active) tokens.push(token);
  return tokens;
}
const action = "Apply the validated payload: ";
test("a successful check hints the matching write with its payload file", async () => {
  const x = previewFixture();
  const { wire } = await x.json(["save-check", "--file", "/input.json"]);
  assert.equal(wire.hint, `${action}tool save --file=/input.json`);
  const text = await x.run(["save-check", "--file", "/input.json"]);
  assert.match(text.stdout, /^hint: Apply the validated payload: tool save --file=\/input\.json$/m);
  assert.equal(x.state.commits, 0);
});
const rich = () => previewFixture({
  globals: { profile: { description: "Profile", value: { kind: "string" } } },
  args: [{ name: "target", description: "Target", value: { kind: "string" } }, { name: "label", description: "Label", value: { kind: "string" }, required: false }, { name: "limit", description: "Limit", value: { kind: "integer" }, default: 5 }],
  flags: {
    tag: { description: "Tags", value: { kind: "string" }, repeatable: true },
    force: { description: "Force", value: { kind: "boolean" } },
    dry: { description: "Dry run", value: { kind: "boolean" } },
    level: { description: "Level", value: { kind: "integer" }, default: 3 },
    note: { description: "Note", value: { kind: "string" }, fileSource: { maxBytes: bytes(64) } },
    attachment: { description: "Attachment", value: { kind: "file", maxBytes: bytes(64) } },
    token: { description: "Token", value: { kind: "string" }, secret: true, credential: { env: "TOOL_TOKEN" } },
  },
  example: { args: { target: "one" } },
});
for (const [label, argv, expected, env = {}] of [
  ["arguments, globals, repeats, booleans and file origins", ["--profile", "dev", "save-check", "--file", "/input.json", "--tag", "a", "--tag", "b c's", "--force", "--dry=false", "--level=7", "--note-file", "/notes.txt", "--attachment", "/notes.txt", "--", "-leading", "label text", "9"],
    { args: { target: "-leading", label: "label text", limit: 9 }, flags: { tag: ["a", "b c's"], force: true, dry: false, level: 7, attachment: "note text", note: "note text" }, globals: { profile: "dev" } }],
  ["an optional positional gap and defaults", ["save-check", "--file=/input.json", "--", "only"],
    { args: { target: "only", limit: 5 }, flags: { tag: [], level: 3 }, globals: {} }],
  ["an environment credential fallback", ["save-check", "--file=/input.json", "--", "env"],
    { args: { target: "env", limit: 5 }, flags: { tag: [], level: 3, token: "env-secret" }, globals: {} }, { TOOL_TOKEN: "env-secret" }],
]) test(`the generated write hint faithfully replays ${label}`, async () => {
  const x = rich();
  const { result, wire } = await x.json(argv, { env });
  assert.equal(result.exitCode, 0, result.stdout);
  assert.ok(wire.hint?.startsWith(action), wire.hint);
  assert.doesNotMatch(wire.hint, /TOOL_TOKEN|env-secret|note text|--token/);
  const tokens = shellTokens(wire.hint.slice(action.length));
  assert.equal(tokens[0], "tool");
  assert.equal(tokens[1], "save");
  const replay = await x.json(tokens.slice(1), { env });
  assert.equal(replay.result.exitCode, 0, replay.result.stdout);
  assert.equal(x.state.commits, 1);
  assert.deepEqual(x.state.inputs[1], x.state.inputs[0]);
  assert.deepEqual({ args: x.state.inputs[0].args, flags: x.state.inputs[0].flags, globals: x.state.inputs[0].globals }, expected);
});
test("default-valued flags are omitted while positionals keep canonical invocation rendering", async () => {
  const x = rich();
  const { wire } = await x.json(["save-check", "--file=/input.json", "--level=3", "--tag", "a", "--", "only", "label"]);
  assert.equal(wire.hint, `${action}tool save --tag=a --file=/input.json -- only label 5`);
});
for (const [label, argv, options] of [
  ["a stdin payload", ["save-check", "--file", "-", "--", "one"], { stdin: inputText }],
  ["a stdin file alternative", ["save-check", "--file", "/input.json", "--note-file", "-", "--", "one"], { stdin: "note text" }],
  ["a stdin file argument", ["save-check", "--file", "/input.json", "--attachment", "-", "--", "one"], { stdin: "note text" }],
  ["a supplied secret", ["save-check", "--file", "/input.json", "--token", "inline-secret", "--", "one"], {}],
  ["an oversized invocation", ["save-check", "--file", "/input.json", ...Array.from({ length: 12 }, () => ["--tag", "x".repeat(100)]).flat(), "--", "one"], {}],
]) test(`the generated hint is omitted without failing for ${label}`, async () => {
  const x = rich();
  const { result, wire } = await x.json(argv, options);
  assert.equal(result.exitCode, 0, result.stdout);
  assert.equal(wire.ok, true);
  assert.equal(wire.hint, undefined);
  assert.doesNotMatch(result.stdout, /inline-secret/);
});
test("nonempty passthrough suppresses the generated hint; an empty boundary keeps it", async () => {
  const x = previewFixture({ passthrough: true });
  assert.equal((await x.json(["save-check", "--file", "/input.json", "--", "--raw", "token"])).wire.hint, undefined);
  const empty = await x.json(["save-check", "--file", "/input.json"]);
  assert.equal(empty.wire.hint, `${action}tool save --file=/input.json`);
  const replay = await x.json(["save", "--file=/input.json"]);
  assert.equal(replay.result.exitCode, 0);
  assert.deepEqual(x.state.inputs[2].passthrough, []);
});
test("preparation and rule hints override the generated write hint; instruction conflicts still fail", async () => {
  const prepared = previewFixture({ prepare: ({ value, read }) => ({ ok: true, value, hint: hint(invocation(read, {}), "Inspect status first") }) });
  assert.equal((await prepared.json(["save-check", "--file", "/input.json"])).wire.hint, "Inspect status first: tool status");
  const ruled = previewFixture({ rules: ({ write, read }) => [defineSteering({ id: "inspect-first", appliesTo: [write], when: () => true, tier: "hint", render: () => hint(invocation(read, {}), "Inspect with the rule") })] });
  assert.equal((await ruled.json(["save-check", "--file", "/input.json"])).wire.hint, "Inspect with the rule: tool status");
  const conflicted = previewFixture({ prepare: ({ value }) => ({ ok: true, value, instruction: instruction("reviewer", "Wait for review.") }),
    rules: ({ write }) => [defineSteering({ id: "proceed", appliesTo: [write], when: () => true, tier: "instruction", render: () => instruction("policy", "Proceed now.") })] });
  const { result, wire } = await conflicted.json(["save-check", "--file", "/input.json"]);
  assert.equal(result.exitCode, 1);
  assert.equal(wire.error.code, "KERNEL_GUIDANCE");
  assert.equal(wire.hint, undefined);
  assert.equal(conflicted.state.commits, 0);
});
