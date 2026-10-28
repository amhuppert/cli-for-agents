import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { bytes, commandsFor, defineErrors, invocation, validationInvocation, mutation, payloadRead, recoveryFacts } from "cli-for-agents";
import { createCli, runCli, helpNode } from "cli-for-agents/runtime";
import { createTestHost } from "cli-for-agents/testing";

const textInput = { flag: "prompt", field: "brief", description: "Task to perform" };
function fixture({ text = true, read = false, decode = value => ({ value }), flags = {}, globals = {} } = {}) {
  const events = [], prepared = [], committed = [];
  const family = commandsFor()({ errors: defineErrors({}), globalFlags: globals });
  const status = family.defineCommand({ path: "status", summary: "Status", description: "Read status", effects: "read", requires: "none", args: [], flags: {} }, {
    examples: [{ why: "Read status" }], handler: async () => ({ default: { run: async () => ({ ok: true, data: {} }) } }),
  });
  let command;
  assert.doesNotThrow(() => {
    command = family.defineCommand({ path: "launch", summary: "Launch", description: "Launch a task", effects: read ? "read" : "write", requires: "app", args: [], flags,
      payload: { maxBytes: bytes(64), ...(!read ? { validatePath: "launch-check" } : {}), ...(text ? { textInput: typeof text === "object" ? text : textInput } : {}), examples: [{ payload: { brief: "work" }, why: "A task" }] } }, {
      examples: [{ file: "input.json", why: "Launch structured task" }],
      handler: async () => {
        events.push("load");
        const schema = { "~standard": { version: 1, vendor: "test", validate: value => { events.push("decode"); return decode(value); } } };
        return { default: read ? payloadRead({ decode: schema, run: async ({ payload }) => ({ ok: true, data: payload }) }) : mutation({ decode: schema,
          prepare: async ({ payload, ctx }) => { events.push("prepare"); prepared.push({ payload, files: ctx.inputFiles, flags: ctx.flags }); return { ok: true, value: payload, preview: payload }; },
          commit: async ({ prepared }) => { events.push("commit"); committed.push(prepared); return { effect: "applied", recovery: recoveryFacts([{ kind: "task", id: "one" }]), result: { ok: true, data: prepared.value } }; },
        }) };
      },
    });
  }, "payload.textInput must be accepted as a declarative payload alternative");
  const cli = createCli({ name: "tool", version: "1", family, commands: [status, command], contexts: { app: async () => { events.push("acquire"); return { ok: true, app: {} }; } }, doctor: invocation(status, {}), output: { artifacts: { directory: "/artifacts", forbiddenRoots: [] } } });
  const run = async (argv, { files = {}, stdin } = {}) => {
    const host = createTestHost({ files: { "input.json": '{"brief":"work"}', ...files }, ...(stdin === undefined ? {} : { stdin }) });
    const result = await runCli(cli, { argv: [...argv, "--json"], env: {}, host, signal: new AbortController().signal });
    return { ...result, wire: JSON.parse(result.stdout), host };
  };
  return { run, cli, command, events, prepared, committed };
}

test("payload text declaration derives inline and file inputs for writes and their validation twins", async () => {
  for (const route of ["launch", "launch-check"]) {
    const x = fixture();
    const result = await x.run([route, "--prompt", "work"]);
    assert.equal(result.exitCode, 0, result.stdout + result.stderr);
    assert.deepEqual(x.prepared[0], { payload: { brief: "work" }, files: [], flags: {} });
    assert.equal(x.committed.length, route === "launch" ? 1 : 0);
    const hash = createHash("sha256").update('{"brief":"work"}').digest("hex");
    assert.equal(route === "launch" ? x.committed[0].payloadHash : result.wire.payload.data.payloadHash, hash);
  }
});

test("text files and stdin preserve literal UTF-8 including BOM, quotes and whitespace", async () => {
  const literal = '\ufeff  {"brief":"literal"}\r\n$HOME `echo hi`\n';
  for (const path of ["prompt.txt", "-"]) {
    const x = fixture();
    const result = await x.run(["launch-check", "--prompt-file", path], { files: { "prompt.txt": literal }, stdin: literal });
    assert.equal(result.exitCode, 0, result.stdout + result.stderr);
    assert.deepEqual(x.prepared[0].payload, { brief: literal });
    assert.deepEqual(x.prepared[0].files, [{ kind: "payload", name: "prompt-file", path }]);
    assert.equal(result.wire.payload.data.payloadHash, createHash("sha256").update(JSON.stringify({ brief: literal })).digest("hex"));
    assert.equal(result.wire.hint, path === "-" ? undefined : "Apply the validated payload: tool launch --prompt-file=prompt.txt");
  }
});

test("all three spellings share decode and preparation; JSON file behavior is retained", async () => {
  for (const flags of [["--file", "input.json"], ["--prompt", "work"], ["--prompt-file", "prompt.txt"]]) {
    const x = fixture({ decode: value => ({ value: { ...value, normalized: true } }) });
    const result = await x.run(["launch-check", ...flags], { files: { "prompt.txt": "work" } });
    assert.equal(result.exitCode, 0, result.stdout);
    assert.deepEqual(x.prepared[0].payload, { brief: "work", normalized: true });
    assert.deepEqual(x.events, ["load", "decode", "acquire", "prepare"]);
  }
  const x = fixture({ read: true });
  const result = await x.run(["launch", "--prompt", "work"]);
  assert.equal(result.exitCode, 0, result.stdout);
  assert.deepEqual(result.wire.payload.data, { brief: "work" });
});

test("missing and mixed payload alternatives fail before file reads or context acquisition", async () => {
  for (const flags of [[], ["--file", "missing.json", "--prompt", "work"], ["--file", "missing.json", "--prompt-file", "missing.txt"], ["--prompt", "work", "--prompt-file", "missing.txt"]]) {
    const x = fixture();
    const result = await x.run(["launch", ...flags]);
    assert.equal(result.exitCode, 2, result.stdout);
    assert.deepEqual(x.events, []);
    assert.match(JSON.stringify(result.wire.error), /exactly one.*--file.*--prompt.*--prompt-file/i);
    assert.equal(result.host.calls.some(call => ["read", "stdin"].includes(call.kind)), false);
  }
  const x = fixture({ text: false });
  assert.equal((await x.run(["launch"])).exitCode, 2);
  assert.equal(helpNode(x.cli, "launch").flags.find(flag => flag.name === "file").required, true);
});

test("text byte limits apply to raw UTF-8, and file and decoder diagnostics identify the selected source", async () => {
  for (const flags of [["--prompt", "é".repeat(33)], ["--prompt-file", "large.txt"]]) {
    const x = fixture();
    const result = await x.run(["launch", ...flags], { files: { "large.txt": "é".repeat(33) } });
    assert.equal(result.exitCode, 2, result.stdout);
    assert.deepEqual(x.events, []);
  }
  const boundary = fixture();
  assert.equal((await boundary.run(["launch", "--prompt", "é".repeat(32)])).exitCode, 0);
  const missing = fixture();
  assert.match((await missing.run(["launch", "--prompt-file", "missing.txt"])).wire.error.why, /Payload --prompt-file.*missing.txt.*does not exist/);
  const invalid = fixture();
  assert.match((await invalid.run(["launch", "--prompt-file", "invalid.txt"], { files: { "invalid.txt": new Uint8Array([255]) } })).wire.error.why, /--prompt-file.*not valid UTF-8/);
  for (const flags of [["--prompt", "work"], ["--prompt-file", "prompt.txt"]]) {
    const x = fixture({ decode: () => { throw new Error("private contents"); } });
    const result = await x.run(["launch", ...flags], { files: { "prompt.txt": "work" } });
    assert.equal(result.exitCode, 2, result.stdout);
    assert.match(result.wire.error.why, /Payload --prompt.*decoder threw Error/);
    assert.doesNotMatch(result.stdout, /private contents/);
    assert.equal(x.events.includes("acquire"), false);
  }
  const refused = fixture({ decode: () => ({ issues: [{ message: "Brief required", path: ["brief"] }] }) });
  const result = await refused.run(["launch", "--prompt", ""]);
  assert.equal(result.exitCode, 2, result.stdout);
  assert.equal(refused.events.includes("acquire"), false);
  assert.match(JSON.stringify(result.wire.error), /Brief required/);
});

test("help, typed references and apply hints describe the same exclusive alternatives", async () => {
  const x = fixture();
  for (const route of ["launch", "launch-check"]) {
    const help = helpNode(x.cli, route);
    assert.deepEqual(help.payload.textInput, textInput);
    assert.match(help.usage[0], /\(--file <path> \| --prompt <string> \| --prompt-file <path>\)/);
    assert.equal(help.flags.find(flag => flag.name === "file").required, false);
    assert.deepEqual(help.flags.find(flag => flag.name === "prompt").fileAlternative, { name: "prompt-file", maxBytes: 64 });
  }
  for (const flags of [{ prompt: "work" }, { "prompt-file": "prompt.txt" }]) {
    assert.deepEqual(invocation(x.command, { flags }).flags, flags);
    assert.equal(validationInvocation(x.command, { flags }).path, "launch-check");
  }
  assert.throws(() => invocation(x.command, {}));
  assert.throws(() => invocation(x.command, { file: "input.json", flags: { prompt: "work" } }));
  const result = await x.run(["launch-check", "--prompt", "work"]);
  assert.equal(result.wire.hint, "Apply the validated payload: tool launch --prompt=work");
});

test("text alternatives use declared names and still reject duplicate flags and competing stdin consumers", async () => {
  const custom = fixture({ text: { flag: "message", field: "content", description: "Message body" } });
  const result = await custom.run(["launch-check", "--message", "work"]);
  assert.equal(result.exitCode, 0, result.stdout);
  assert.deepEqual(custom.prepared[0].payload, { content: "work" });
  assert.equal(result.wire.hint, "Apply the validated payload: tool launch --message=work");
  for (const argv of [["--prompt", "one", "--prompt", "two"], ["--prompt-file", "-", "--body-file", "-"]]) {
    const x = fixture({ flags: { body: { description: "Body", value: { kind: "string" }, fileSource: { maxBytes: bytes(64) } } } });
    const refused = await x.run(["launch", ...argv], { stdin: "work" });
    assert.equal(refused.exitCode, 2, refused.stdout);
    assert.deepEqual(x.events, []);
    assert.equal(refused.host.calls.some(call => ["read", "stdin"].includes(call.kind)), false);
  }
});

test("payload text declarations reject invalid names and collisions with existing generated inputs", () => {
  const string = { description: "Text", value: { kind: "string" } };
  for (const { text = textInput, flags = {}, globals = {}, levels } of [
    { text: { ...textInput, flag: "file" } },
    { text: { ...textInput, flag: "bad name" } },
    { text: { ...textInput, field: "" } },
    { flags: { prompt: string } },
    { flags: { "prompt-file": string } },
    { globals: { prompt: { ...string, fileSource: { maxBytes: bytes(64) } } } },
    { levels: { prompt: { output: "bounded" } } },
  ]) {
    const family = commandsFor()({ errors: defineErrors({}), globalFlags: globals });
    assert.throws(() => family.defineCommand({ path: "inspect", summary: "Inspect", description: "Inspect payload", requires: "none", effects: "read", args: [], flags, ...(levels ? { levels } : {}),
      payload: { maxBytes: bytes(64), textInput: text, examples: [{ payload: {}, why: "Payload" }] } },
    { examples: [{ file: "input.json", why: "Inspect" }], handler: async () => { throw Error("Never load"); } }), TypeError);
  }
});
