import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bytes, commandsFor, defineErrors, invocation, payloadRead } from "cli-for-agents";
import { createCli, nodeHost, runCli } from "cli-for-agents/runtime";
import { createTestHost } from "cli-for-agents/testing";

const schema = validate => ({ "~standard": { version: 1, vendor: "fixture", validate } });
function fixture({ decode = schema(value => ({ value })) } = {}) {
  const events = [];
  const small = { kind: "file", maxBytes: bytes(64) };
  const family = commandsFor()({ errors: defineErrors({}), globalFlags: { credential: { description: "Secret file", value: small, secret: true } } });
  const status = family.defineCommand({ path: "status", summary: "Read status", description: "Inspect state", requires: "none", effects: "read", args: [], flags: {} },
    { examples: [{ why: "Inspect state" }], handler: async () => ({ default: { run: async () => ({ ok: true, data: {} }) } }) });
  const inspect = family.defineCommand({ path: "inspect", summary: "Inspect payload", description: "Inspect a payload with a document", requires: "none", effects: "read",
    args: [{ name: "document", description: "Document file", value: small, required: false }],
    flags: { body: { description: "Prose", value: { kind: "string", minLength: 3 }, fileSource: { maxBytes: bytes(64) } } },
    payload: { maxBytes: bytes(64), examples: [{ payload: {}, why: "Example payload" }] } },
  { examples: [{ file: "payload.json", why: "Inspect data" }], handler: async () => {
    events.push("load");
    return { default: payloadRead({ decode, run: async () => { events.push("run"); return { ok: true, data: {} }; } }) };
  } });
  const cli = createCli({ name: "tool", version: "1", family, commands: [status, inspect], contexts: {}, doctor: invocation(status, {}),
    output: { artifacts: { directory: "/artifacts", forbiddenRoots: [] } } });
  const run = async (argv, { files = {}, format = "json", host } = {}) => {
    const result = await runCli(cli, { argv: ["inspect", ...argv, ...(format === "json" ? ["--json"] : [])], env: {},
      host: host ?? createTestHost({ files: { "/artifacts/.keep": "", "payload.json": "{}", ...files } }), signal: new AbortController().signal });
    return { ...result, wire: format === "json" ? JSON.parse(result.stdout) : undefined };
  };
  return { events, run };
}
function assertRefusal(result, events) {
  assert.equal(result.exitCode, 2, result.stdout + result.stderr);
  assert.equal(events.includes("run"), false, "input failures must not invoke the operation handler");
}

test("missing payload file names the supplied file and the read failure", async () => {
  const x = fixture();
  const json = await x.run(["--file", "missing.json"]);
  assertRefusal(json, x.events);
  assert.equal(json.wire.error.code, "KERNEL_INPUT");
  assert.equal(json.wire.error.message, "Input file could not be read.");
  assert.equal(json.wire.error.why, 'Payload --file "missing.json" could not be read: file does not exist.');
  const text = await x.run(["--file", "missing.json"], { format: "text" });
  assert.match(text.stderr, /^error: KERNEL_INPUT: Input file could not be read\.$/m);
  assert.match(text.stderr, /^why: Payload --file "missing\.json" could not be read: file does not exist\.$/m);
});

test("argument and derived flag files identify their own input", async () => {
  const x = fixture();
  const argument = await x.run(["gone.txt", "--file", "payload.json"]);
  assertRefusal(argument, x.events);
  assert.equal(argument.wire.error.why, 'Argument <document> "gone.txt" could not be read: file does not exist.');
  const flag = await x.run(["--body-file", "gone.txt", "--file", "payload.json"]);
  assert.equal(flag.wire.error.why, 'Flag --body-file "gone.txt" could not be read: file does not exist.');
  const value = await x.run(["--body-file", "short.txt", "--file", "payload.json"], { files: { "short.txt": "x" } });
  assert.equal(value.wire.error.message, "Input file value is invalid.");
  assert.equal(value.wire.error.why, 'Flag --body-file "short.txt" contents are not a valid value for --body.');
});

test("secret file inputs name the flag without echoing its path", async () => {
  const x = fixture();
  const result = await x.run(["--credential", "private-name.txt", "--file", "payload.json"]);
  assertRefusal(result, x.events);
  assert.equal(result.wire.error.why, "Secret global --credential could not be read: file does not exist.");
  assert.doesNotMatch(result.stdout, /private-name/);
});

test("byte limit overflow and invalid UTF-8 are distinguishable read stages", async () => {
  const x = fixture();
  const large = await x.run(["--file", "big.json"], { files: { "big.json": `"${"x".repeat(80)}"` } });
  assertRefusal(large, x.events);
  assert.equal(large.wire.error.why, 'Payload --file "big.json" could not be read: input exceeds the 64-byte limit.');
  const binary = await x.run(["--file", "binary.json"], { files: { "binary.json": new Uint8Array([0x7b, 0xff, 0x7d]) } });
  assertRefusal(binary, x.events);
  assert.equal(binary.wire.error.message, "Input is not valid UTF-8.");
  assert.equal(binary.wire.error.why, 'Payload --file "binary.json" is not valid UTF-8 text.');
});

test("malformed JSON reports the parser reason and location without raw contents", async () => {
  const x = fixture();
  const multiline = await x.run(["--file", "bad.json"], { files: { "bad.json": '{\n  "a": "SECRET-CONTENT"\n  "b": 2\n}' } });
  assertRefusal(multiline, x.events);
  assert.equal(multiline.wire.error.message, "Input is not valid JSON.");
  assert.equal(multiline.wire.error.why, `Payload --file "bad.json" is not valid JSON: Expected ',' or '}' after property value at line 3 column 3.`);
  const bare = await x.run(["--file", "bare.json"], { files: { "bare.json": "SECRET-CONTENT" } });
  assert.match(bare.wire.error.why, /^Payload --file "bare\.json" is not valid JSON: Unexpected token\.$/);
  const empty = await x.run(["--file", "empty.json"], { files: { "empty.json": "" } });
  assert.equal(empty.wire.error.why, 'Payload --file "empty.json" is not valid JSON: Unexpected end of JSON input.');
  for (const result of [multiline, bare]) assert.doesNotMatch(result.stdout, /SECRET-CONTENT/);
  const text = await x.run(["--file", "bad.json"], { files: { "bad.json": '{"a":1,}' }, format: "text" });
  assert.match(text.stderr, /^why: Payload --file "bad\.json" is not valid JSON: Expected double-quoted property name at line 1 column 8\.$/m);
});

test("stdin payload failures name stdin", async () => {
  const x = fixture();
  const result = await x.run(["--file", "-"], { host: createTestHost({ files: { "/artifacts/.keep": "" }, stdin: "[1," }) });
  assertRefusal(result, x.events);
  assert.equal(result.wire.error.why, "Payload --file stdin is not valid JSON: Unexpected end of JSON input.");
});

test("long paths are shortened to the diagnostic bound", async () => {
  const x = fixture();
  const path = `${"deep/".repeat(200)}missing.json`;
  const result = await x.run(["--file", path]);
  assertRefusal(result, x.events);
  assert.ok(new TextEncoder().encode(JSON.stringify(result.wire.error.why)).length <= 512);
  assert.match(result.wire.error.why, /^Payload --file "deep\/deep\/.*….*missing\.json" could not be read: file does not exist\.$/);
});

test("schema refusal keeps its issue paths and messages", async () => {
  const x = fixture({ decode: schema(() => ({ issues: [{ message: "Required", path: ["items", { key: 0 }, "name"] }] })) });
  const json = await x.run(["--file", "payload.json"]);
  assertRefusal(json, x.events);
  assert.equal(json.wire.error.message, "Local file, JSON or schema input could not be validated.");
  assert.deepEqual(json.wire.error.issues, [{ code: "schema", message: "Required", path: ["items", 0, "name"] }]);
  const text = await x.run(["--file", "payload.json"], { format: "text" });
  assert.match(text.stderr, /^issue: schema: Required \(\["items",0,"name"\]\)$/m);
});

test("a throwing decoder is an input failure with a bounded cause", async () => {
  const x = fixture({ decode: schema(() => { throw new TypeError("SECRET-CONTENT ".repeat(100)); }) });
  const json = await x.run(["--file", "payload.json"]);
  assertRefusal(json, x.events);
  assert.equal(json.wire.error.code, "KERNEL_INPUT");
  assert.equal(json.wire.error.message, "Payload decoder failed.");
  assert.equal(json.wire.error.why, 'Payload --file "payload.json" decoder threw TypeError instead of returning schema issues.');
  assert.doesNotMatch(json.stdout, /SECRET-CONTENT/);
});

test("the production node host reports a missing real file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "local-input-"));
  try {
    await writeFile(join(directory, ".keep"), "");
    const x = fixture();
    const host = await nodeHost();
    const missing = join(directory, "absent.json");
    const result = await x.run(["--file", missing], { host, format: "text" });
    assertRefusal(result, x.events);
    assert.ok(result.stderr.includes(`why: Payload --file ${JSON.stringify(missing)} could not be read: file does not exist.`), result.stderr);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
