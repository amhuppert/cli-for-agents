import assert from "node:assert/strict";
import test from "node:test";
import { commandsFor, defineErrors, invocation, validationInvocation, bytes, count, elide, id, page, binaryArtifact, payloadRead, mutation, runner, writeRunner, recoveryFacts, milliseconds } from "cli-for-agents";
import { hint, instruction } from "cli-for-agents/guidance";
import { createCli } from "cli-for-agents/runtime";
import { createTestHost } from "cli-for-agents/testing";
import { cliRegistry, resolve } from "../dist/internal/registry.js";
import { execute } from "../dist/internal/execution.js";
import { resolveLocalInput } from "../dist/internal/local-input.js";
const spec = extra => ({ path: "inspect", summary: "Inspect", description: "Inspect input", requires: "remote", effects: "read", args: [], flags: {}, ...extra });
const schema = validate => ({ "~standard": { version: 1, vendor: "fixture", validate } });
const identitySchema = schema(value => ({ value }));
function fixture({ extra = {}, argv = [], files = {}, stdin, globals = {}, env = {}, load, example = {} } = {}) {
  let acquired = 0; let loaded = 0;
  const family = commandsFor()({ errors: defineErrors({ REFUSED: { exitClass: "failed", description: "Refused" } }), globalFlags: globals });
  const doctor = family.defineCommand(spec({ path: "doctor", requires: "none" }), { examples: [{ why: "Inspect" }], handler: async () => ({ default: { run: async () => ({ ok: true, data: {} }) } }) });
  const command = family.defineCommand(spec(extra), { examples: [{ ...example, ...(extra.payload ? { file: "payload.json" } : {}), why: "Inspect" }], handler: async () => { loaded++; return load ? load() : { default: { run: async () => ({ ok: true, data: {} }) } }; } });
  const contexts = { remote: async () => { acquired++; throw new Error("provider touched"); } };
  const cli = createCli({ name: "tool", version: "1", family, commands: [doctor, command], contexts, doctor: invocation(doctor, {}), output: { artifacts: { directory: "/artifacts", forbiddenRoots: [] } } });
  const resolution = resolve(cliRegistry(cli), [extra.path ?? "inspect", ...argv]);
  const host = createTestHost({ files, ...(stdin === undefined ? {} : { stdin }) });
  const request = { argv, env, host, signal: new AbortController().signal };
  return { cli, resolution, host, request, contexts, command, family, acquired: () => acquired, loaded: () => loaded };
}
async function local(x) {
  assert.equal(x.resolution.kind, "leaf");
  const result = await resolveLocalInput(x.resolution.invocation, x.request);
  return result;
}
const payload = { maxBytes: bytes(64), examples: [{ payload: {}, why: "Example payload" }] };
for (const [name, options] of [
  ["missing file", { argv: ["--file", "missing"] }],
  ["malformed JSON", { files: { "payload.json": "not JSON" } }],
  ["byte overflow", { files: { "payload.json": '"' + "😀".repeat(16) + '"' } }],
  ["invalid UTF-8", { files: { "payload.json": new Uint8Array([0xff]) } }],
  ["schema refusal", { files: { "payload.json": "{}" }, decode: schema(() => ({ issues: [{ message: "Required", path: ["items", { key: 0 }, { key: "name" }] }] })) }],
  ["schema exception", { files: { "payload.json": "{}" }, decode: schema(() => { throw new Error("sensitive input"); }) }],
]) test(`${name} fails before context acquisition`, async () => {
  const x = fixture({ extra: { payload }, argv: ["--file", "payload.json"], ...options,
    load: () => ({ default: payloadRead({ decode: options.decode ?? identitySchema, run: async () => ({ ok: true, data: {} }) }) }) });
  const completed = await execute(x.resolution.invocation, x.request, x.contexts, async () => { throw new Error("hook touched"); });
  assert.equal(completed?.execution.result.error.code, "KERNEL_INPUT", "local refusal must be reported by execute");
  assert.equal(completed.postOperation, "skipped");
  assert.equal(x.acquired(), 0);
  if (name === "schema refusal") assert.deepEqual(completed.execution.result.error.issues[0].path, ["items", 0, "name"]);
  assert.doesNotMatch(JSON.stringify(completed), /sensitive input/);
});
test("raw argument, flag, derived source and global file inputs resolve to text", async () => {
  const x = fixture({ extra: { args: [{ name: "document", description: "Raw", value: { kind: "file", maxBytes: bytes(64) } }], flags: { text: { description: "Text", value: { kind: "string", minLength: 2 }, fileSource: { maxBytes: bytes(64) } }, raw: { description: "Raw", value: { kind: "file", maxBytes: bytes(64) } } } },
    globals: { config: { description: "Config", value: { kind: "file", maxBytes: bytes(64) } } },
    example: { args: { document: "doc" } }, argv: ["doc", "--text-file", "-", "--raw", "doc", "--config", "doc"], files: { doc: "not JSON\n" }, stdin: "hello\n" });
  const result = await local(x);
  assert.equal(result.ok, true);
  assert.equal(result.input.args.document, "not JSON\n");
  assert.equal(result.input.flags.raw, "not JSON\n");
  assert.equal(result.input.flags.text, "hello\n");
  assert.equal(result.input.globals.config, "not JSON\n");
  assert.equal(x.host.calls.filter(c => c.kind === "stdin").length, 1);
});
test("payload stdin uses mandatory async decoder and retains transformed payload", async () => {
  const x = fixture({ extra: { payload }, argv: ["--file", "-"], stdin: '{"name":"a"}', load: () => ({ default: payloadRead({ decode: schema(async value => ({ value: { name: value.name.toUpperCase() } })), run: async () => ({ ok: true, data: {} }) }) }) });
  assert.equal(x.loaded(), 0);
  const result = await local(x);
  assert.equal(result.ok, true);
  assert.deepEqual(result.input.payload, { name: "A" });
  assert.equal(x.loaded(), 1);
});
test("resolved derived strings and environment credentials obey their declarations", async () => {
  const flags = { text: { description: "Text", value: { kind: "string", minLength: 2 }, fileSource: { maxBytes: bytes(64) } }, token: { description: "Token", value: { kind: "string", minLength: 2 }, secret: true, required: true, credential: { env: "TOKEN" } } };
  for (const [argv, env, expected] of [[[], { TOKEN: "ok" }, true], [["--text-file", "short"], { TOKEN: "ok" }, false], [[], {}, false], [[], { TOKEN: "x" }, false]]) {
    const x = fixture({ extra: { flags }, argv, env, files: { short: "x" } });
    assert.equal((await local(x)).ok, expected);
  }
});
test("parser refuses exclusive alternatives and competing stdin before any reads", () => {
  const flags = { text: { description: "Text", value: { kind: "string" }, fileSource: { maxBytes: bytes(64) } } };
  for (const argv of [["--text", "inline", "--text-file", "file"], ["--text-file", "-", "--file", "-"]]) {
    const x = fixture({ extra: { flags, ...(argv.includes("--file") ? { payload } : {}) }, argv });
    assert.equal(x.resolution.kind, "invalid");
    assert.equal(x.host.calls.length, 0);
    assert.equal(x.loaded(), 0);
  }
});
for (const [name, load] of [
  ["missing decoder", () => ({ default: { run: async () => ({ ok: true, data: {} }) } })],
  ["wrong schema version", () => ({ default: payloadRead({ decode: { "~standard": { version: 2, vendor: "fixture", validate: value => ({ value }) } }, run: async () => ({ ok: true, data: {} }) }) })],
  ["malformed schema result", () => ({ default: payloadRead({ decode: schema(() => ({})), run: async () => ({ ok: true, data: {} }) }) })],
]) test(`untyped ${name} is a contract refusal before acquisition`, async () => {
  const x = fixture({ extra: { payload }, argv: ["--file", "payload.json"], files: { "payload.json": "{}" }, load });
  const result = await execute(x.resolution.invocation, x.request, x.contexts, async () => { throw new Error("hook touched"); });
  assert.equal(result.execution.result.error.code, "KERNEL_CONTRACT");
  assert.equal(x.acquired(), 0);
});
test("derived source byte limit also bounds inline UTF-8 text", async () => {
  const x = fixture({ extra: { flags: { text: { description: "Text", value: { kind: "string" }, fileSource: { maxBytes: bytes(4) } } } }, argv: ["--text", "😀x"] });
  assert.equal((await local(x)).ok, false);
  assert.equal(x.loaded(), 0);
});
test("cancelled local IO reports cancellation without loading or acquiring", async () => {
  const x = fixture({ extra: { payload }, argv: ["--file", "-"], stdin: "{}" });
  const controller = new AbortController(); controller.abort();
  const result = await execute(x.resolution.invocation, { ...x.request, signal: controller.signal }, x.contexts, async () => { throw new Error("hook touched"); });
  assert.equal(result.execution.result.error.code, "KERNEL_CANCELLED");
  assert.equal(x.loaded(), 0); assert.equal(x.acquired(), 0);
});
test("local boundary independently rejects a host returning more bytes than requested", async () => {
  const x = fixture({ extra: { payload }, argv: ["--file", "payload.json"] });
  const host = { ...x.host, files: { ...x.host.files, read: async () => new TextEncoder().encode('"' + "x".repeat(64) + '"') } };
  const result = await execute(x.resolution.invocation, { ...x.request, host }, x.contexts, async () => { throw new Error("hook touched"); });
  assert.equal(result.execution.result.error.code, "KERNEL_INPUT");
  assert.equal(x.loaded(), 0); assert.equal(x.acquired(), 0);
});

for (const validation of [false, true]) test(`payload mutation ${validation ? "twin" : "write"} decodes before acquisition`, async () => {
  const x = fixture({ extra: { effects: "write", payload: { ...payload, validatePath: "validate" } }, argv: ["--file", "payload.json"], files: { "payload.json": "{}" },
    load: () => ({ default: mutation({ decode: schema(() => ({ issues: [{ message: "Invalid mutation", path: [{ key: "name" }] }] })), prepare: async () => { throw new Error("prepare touched"); }, commit: async () => { throw new Error("commit touched"); } }) }) });
  const parsed = validation ? resolve(cliRegistry(x.cli), ["validate", "--file", "payload.json"]).invocation : x.resolution.invocation;
  const result = await execute(parsed, x.request, x.contexts, async () => { throw new Error("hook touched"); });
  assert.equal(result.execution.result.error.code, "KERNEL_INPUT");
  assert.equal(result.execution.operation.effect, validation ? "read" : "not_applied");
  assert.equal(x.acquired(), 0);
});
const emptyFacts = async () => ({ issues: [] });
const run = (x, contexts = x.contexts, hook = emptyFacts, request = x.request) => execute(x.resolution.invocation, request, contexts, hook);
test("requires none omits app and bypasses providers through the production execute seam", async () => {
  let input;
  const x = fixture({ extra: { requires: "none" }, load: () => ({ default: { run: async value => { input = value; return { ok: true, data: { count: 2 } }; } } }) });
  const result = await run(x);
  assert.equal(result.execution.result.ok, true);
  assert.equal(result.execution.operation.effect, "read");
  assert.equal(Object.hasOwn(input, "app"), false);
  assert.equal(input.ctx.command, x.command);
  assert.equal(x.acquired(), 0);
  assert.equal(result.execution.renderPrimary(), '{\n  "count": 2\n}');
});
test("keyed provider and handler receive declared globals, env, host, signal and deterministic clock", async () => {
  const app = { live: true }; let provided; let handled; let releases = 0;
  const x = fixture({ globals: { region: { description: "Region", value: { kind: "string" }, default: "west" } }, env: { MODE: "test" },
    load: () => ({ default: { run: async input => { handled = input; return { ok: true, data: { now: input.ctx.clock.now() } }; } } }) });
  const result = await run(x, { unused: () => { throw new Error("wrong provider"); }, remote: async input => { provided = input; return { ok: true, app, release() { releases++; } }; } });
  assert.equal(result.execution.result.ok, true);
  assert.equal(handled.app, app); assert.equal(handled.ctx.errors, x.family.errors);
  assert.deepEqual(provided.globals, { region: "west" });
  assert.equal(provided.env, x.request.env); assert.equal(provided.host, x.host); assert.equal(provided.signal, x.request.signal);
  assert.equal(handled.ctx.host, x.host); assert.equal(handled.ctx.signal, x.request.signal);
  assert.equal(handled.ctx.clock.sleep, x.host.sleep); assert.equal(releases, 1);
});
for (const outcome of ["success", "failure", "throw", "cancel"]) test(`context finalizes exactly once after ${outcome}`, async () => {
  let releases = 0; const controller = new AbortController();
  const x = fixture({ load: () => ({ default: { run: async () => {
    if (outcome === "throw") throw new Error("handler exception");
    if (outcome === "cancel") { controller.abort(); controller.signal.throwIfAborted(); }
    return outcome === "failure" ? { ok: false, error: x.family.errors.error("REFUSED", { message: "Cannot inspect" }) } : { ok: true, data: {} };
  } } }) });
  const result = await run(x, { remote: async () => ({ ok: true, app: {}, release: () => { releases++; } }) }, emptyFacts, { ...x.request, signal: controller.signal });
  assert.equal(releases, 1); assert.equal(result.postOperation, "completed");
  assert.equal(result.execution.result.ok, outcome === "success");
  if (outcome !== "success") assert.equal(result.execution.result.error.code, { failure: "REFUSED", throw: "KERNEL_HANDLER", cancel: "KERNEL_CANCELLED" }[outcome]);
  assert.deepEqual(result.execution.result.error?.details, outcome === "throw" ? { thrown: { name: "Error", message: "handler exception" } } : undefined);
});
test("release waits for a bounded post-operation hook and retains detached facts", async () => {
  const events = []; const app = { open: true }; let enter; let finish;
  const entered = new Promise(resolve => { enter = resolve; }); const barrier = new Promise(resolve => { finish = resolve; });
  const x = fixture();
  const pending = run(x, { remote: async () => ({ ok: true, app, release: () => { events.push("release"); app.open = false; } }) }, async input => {
    assert.equal(input.app, app); assert.equal(input.outcome.result.ok, true);
    events.push("hook"); enter(); await barrier;
    assert.equal(app.open, true); events.push("settled"); return { issues: [] };
  });
  await entered; assert.deepEqual(events, ["hook"]); finish();
  const result = await pending;
  assert.deepEqual(events, ["hook", "settled", "release"]); assert.equal(result.postOperation, "completed");
  assert.ok(Object.isFrozen(result.facts));
});
for (const hookFailure of ["throw", "cancel"]) test(`hook ${hookFailure} retains outcome and still releases once`, async () => {
  let releases = 0; const controller = new AbortController(); const x = fixture();
  const result = await run(x, { remote: async () => ({ ok: true, app: {}, release() { releases++; } }) }, async () => {
    if (hookFailure === "cancel") controller.abort();
    throw new Error("hook exception");
  }, { ...x.request, signal: controller.signal });
  assert.equal(releases, 1); assert.equal(result.execution.result.ok, true); assert.equal(result.postOperation, "failed");
  assert.equal(result.secondary[0].code, hookFailure === "cancel" ? "KERNEL_CANCELLED" : "KERNEL_GUIDANCE");
});
test("release failure is secondary to the acknowledged operation", async () => {
  const x = fixture();
  const result = await run(x, { remote: async () => ({ ok: true, app: {}, release() { throw new Error("release exception"); } }) });
  assert.equal(result.execution.result.ok, true); assert.equal(result.secondary[0].code, "KERNEL_RELEASE");
});
for (const kind of ["throw", "refuse", "foreign"]) test(`provider ${kind} uses catalog classification and skips post-operation`, async () => {
  const x = fixture();
  const result = await run(x, { remote: async () => {
    if (kind === "throw") throw new Error("connect exception");
    return { ok: false, error: kind === "refuse" ? x.family.errors.error("REFUSED", { message: "No access" }) : { code: "FOREIGN", exitClass: "failed", message: "Foreign" } };
  } });
  assert.equal(result.postOperation, "skipped");
  assert.equal(result.execution.result.error.code, { throw: "KERNEL_CONTEXT", refuse: "REFUSED", foreign: "KERNEL_CONTRACT" }[kind]);
});
test("cancellation during acquisition waits for returned context and releases without running", async () => {
  let called = 0; let released = 0; const controller = new AbortController();
  const x = fixture({ load: () => ({ default: { run: async () => { called++; return { ok: true, data: {} }; } } }) });
  const result = await run(x, { remote: async () => { controller.abort(); return { ok: true, app: {}, release() { released++; } }; } }, emptyFacts, { ...x.request, signal: controller.signal });
  assert.equal(called, 0); assert.equal(released, 1); assert.equal(result.execution.result.error.code, "KERNEL_CANCELLED");
});
test("direct, level and payload runners retain their exact typed renderer after release", async () => {
  for (const mode of ["direct", "level", "payload"]) {
    let alive = true;
    const render = runner({ run: async input => ({ ok: true, data: { label: mode, ...(mode === "payload" ? { decoded: input.payload.name } : {}) } }), text: data => { assert.equal(alive, false); return data.label; } });
    const x = fixture({ extra: { ...(mode === "level" ? { levels: { full: { output: "bounded" } } } : {}), ...(mode === "payload" ? { payload } : {}) },
      argv: mode === "level" ? ["--full"] : mode === "payload" ? ["--file", "payload.json"] : [], files: { "payload.json": '{"name":"decoded"}' },
      load: () => ({ default: mode === "payload" ? payloadRead({ decode: identitySchema, run: render }) : { run: mode === "level" ? async () => { throw new Error("wrong runner"); } : render, ...(mode === "level" ? { levels: { full: render } } : {}) } }) });
    const result = await run(x, { remote: async () => ({ ok: true, app: {}, release() { alive = false; } }) });
    assert.equal(result.execution.renderPrimary(), mode);
    if (mode === "payload") assert.equal(result.execution.result.data.decoded, "decoded");
  }
});
for (const write of [false, true]) test(`foreign ${write ? "commit" : "handler"} code becomes contract failure`, async () => {
  const x = fixture({ extra: { effects: write ? "write" : "read" }, load: () => ({ default: { run: async () => {
    const result = { ok: false, error: { code: "FOREIGN", exitClass: "failed", message: "Foreign" } };
    return write ? { effect: "not_applied", result } : result;
  } } }) });
  const result = await run(x, { remote: async () => ({ ok: true, app: {} }) });
  assert.equal(result.execution.result.error.code, "KERNEL_CONTRACT");
});
test("scalar writes run directly, preserve applied recovery, and retain write renderer", async () => {
  const recovery = recoveryFacts([{ kind: "revision", id: "r1" }]);
  const x = fixture({ extra: { effects: "write" }, load: () => ({ default: { run: writeRunner({ run: async () => ({ effect: "applied", recovery, result: { ok: true, data: { saved: true } } }), text: data => data.saved ? "Saved" : "Missing" }) } }) });
  const result = await run(x, { remote: async () => ({ ok: true, app: {} }) });
  assert.equal(result.execution.operation.effect, "applied"); assert.deepEqual(result.execution.operation.recovery, recovery);
  assert.equal(result.execution.renderPrimary(), "Saved");
});
test("throwing scalar writes report unknown acknowledgment without input secrets", async () => {
  const x = fixture({ extra: { effects: "write", flags: { token: { description: "Token", value: { kind: "string" }, secret: true } } }, argv: ["--token", "private-token"], load: () => ({ default: { run: async () => { throw new Error("private-token"); } } }) });
  const result = await run(x, { remote: async () => ({ ok: true, app: {} }) });
  assert.equal(result.execution.operation.effect, "unknown");
  assert.deepEqual(result.execution.operation.recovery, { kind: "unknown_acknowledgment", commandPath: "inspect", advice: "inspect_before_retry" });
  assert.doesNotMatch(JSON.stringify(result), /private-token/);
});
const commitFixture = commit => fixture({ extra: { effects: "write", payload: { ...payload, validatePath: "validate" } }, argv: ["--file", "payload.json"], files: { "payload.json": "{}" },
  load: () => ({ default: mutation({ decode: identitySchema, prepare: async () => ({ ok: true, value: {} }), commit }) }) });
const acquired = { remote: async () => ({ ok: true, app: {} }) };
test("a commit that throws reports the thrown class and message with an unknown effect", async () => {
  const result = await run(commitFixture(async () => { throw new TypeError("x"); }), acquired);
  assert.equal(result.execution.result.error.code, "KERNEL_HANDLER");
  assert.deepEqual(result.execution.result.error.details, { thrown: { name: "TypeError", message: "x" } });
  assert.equal(result.execution.operation.effect, "unknown");
  assert.equal(result.execution.operation.recovery.kind, "unknown_acknowledgment");
});
test("an application TypeError such as a failed fetch stays a handler failure and names one level of cause", async () => {
  const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1", { cause: new Error("deeper") }), { code: "ECONNREFUSED" });
  const result = await run(commitFixture(async () => { throw new TypeError("fetch failed", { cause }); }), acquired);
  assert.equal(result.execution.result.error.code, "KERNEL_HANDLER");
  assert.deepEqual(result.execution.result.error.details, { thrown: { name: "TypeError", message: "fetch failed", cause: { name: "Error", message: "connect ECONNREFUSED 127.0.0.1:1" } } });
  assert.equal(result.execution.operation.effect, "unknown");
});
for (const [name, refuse] of [
  ["recoveryFacts", () => recoveryFacts([{ kind: "attempt", id: "two words" }])],
  ["page", () => page({ items: [], total: { kind: "unknown" }, more: true })],
  ["elide", x => elide("x".repeat(20), { maxBytes: bytes(1), reveal: { ...invocation(x.command, { file: "payload.json" }), effects: "write" } })],
  ["binaryArtifact", () => binaryArtifact({ bytes: new Uint8Array(), mediaType: "not a type", basename: "x.bin", summary: {} })],
  ["bytes", () => bytes(-1)], ["count", () => count(1.5)], ["milliseconds", () => milliseconds(-1)], ["id", () => id("item", "two words")],
  ["catalog error", x => x.family.errors.error("ABSENT", { message: "Missing" })],
  ["invocation", x => invocation(x.command, { file: 7 })],
  ["validationInvocation", x => validationInvocation(x.command, { file: 7 })],
  ["hint", x => hint({ ...invocation(x.command, { file: "payload.json" }), effects: "maybe" }, "Retry")],
  ["instruction", () => instruction("owner id", "Stop")],
]) test(`a handler that lets a ${name} refusal escape is a contract failure with the effect it already had`, async () => {
  let x;
  x = commitFixture(async () => { refuse(x); throw new Error("refusal did not throw"); });
  const result = await run(x, acquired);
  assert.equal(result.execution.result.error.code, "KERNEL_CONTRACT");
  assert.equal(result.execution.result.error.details.thrown.name, "ContractError");
  assert.equal(result.execution.operation.effect, "unknown");
});
test("a library refusal is a TypeError named ContractError that keeps its message", () => {
  assert.throws(() => recoveryFacts([{ kind: "attempt", id: "two words" }]), error => error instanceof TypeError && error.name === "ContractError" && error.message === "Identifiers cannot contain whitespace.");
});
test("a recoveryFacts refusal names its cause", async () => {
  const result = await run(commitFixture(async () => ({ effect: "applied", recovery: recoveryFacts([{ kind: "attempt", id: "two words" }]), result: { ok: true, data: {} } })), acquired);
  assert.deepEqual(result.execution.result.error.details, { thrown: { name: "ContractError", message: "Identifiers cannot contain whitespace." } });
});
test("a thrown message is bounded, single-line and never repeats a secret input", async () => {
  const x = fixture({ extra: { effects: "write", flags: { token: { description: "Token", value: { kind: "string" }, secret: true } } }, argv: ["--token", "private-token"],
    load: () => ({ default: { run: async () => { throw new Error(`rejected private-token\n${"é".repeat(600)}`); } } }) });
  const result = await run(x, acquired);
  const { message } = result.execution.result.error.details.thrown;
  assert.match(message, /^rejected <redacted> é+…$/);
  assert.ok(new TextEncoder().encode(JSON.stringify(message)).byteLength <= 512);
});
const prepareFixture = prepare => fixture({ extra: { effects: "write", payload: { ...payload, validatePath: "validate" } }, argv: ["--file", "payload.json"], files: { "payload.json": "{}" },
  load: () => ({ default: mutation({ decode: identitySchema, prepare, commit: async () => { throw new Error("commit touched"); } }) }) });
for (const [name, prepare, code, thrown] of [
  ["throws", async () => { throw new RangeError("lookup failed"); }, "KERNEL_HANDLER", { name: "RangeError", message: "lookup failed" }],
  ["returns a malformed preparation", async () => ({ ok: true }), "KERNEL_CONTRACT", { name: "ContractError", message: "Record fields do not match the contract." }],
  ["throws a non-Error value", async () => { throw "plain"; }, "KERNEL_HANDLER", { name: "non-Error value" }],
]) test(`a prepare that ${name} keeps the not_applied effect and reports its cause`, async () => {
  const result = await run(prepareFixture(prepare), acquired);
  assert.equal(result.execution.result.error.code, code);
  assert.deepEqual(result.execution.result.error.details, { thrown });
  assert.equal(result.execution.operation.effect, "not_applied");
});
test("a cancelled handler reports no thrown cause", async () => {
  const controller = new AbortController();
  const x = commitFixture(async () => { controller.abort(); throw new Error("aborted transport"); });
  const result = await run(x, acquired, emptyFacts, { ...x.request, signal: controller.signal });
  assert.equal(result.execution.result.error.code, "KERNEL_CANCELLED");
  assert.equal(result.execution.result.error.details, undefined);
});
test("redaction also covers the trimmed form of a secret read from a file and a secret global", async () => {
  const x = fixture({ extra: { effects: "write", flags: { credential: { description: "Credential file", value: { kind: "file", maxBytes: bytes(64) }, secret: true } } },
    globals: { key: { description: "Key", value: { kind: "string" }, secret: true } }, argv: ["--credential", "token.txt", "--key", "global-key-1"], files: { "token.txt": "s3cr3t-value\n" },
    load: () => ({ default: { run: async ({ ctx }) => { throw new Error(`401 for ${ctx.flags.credential.trim()} with ${ctx.globals.key}`); } } }) });
  const result = await run(x, acquired);
  assert.deepEqual(result.execution.result.error.details, { thrown: { name: "Error", message: "401 for <redacted> with <redacted>" } });
});
test("a handler module that cannot load reports its cause", async () => {
  const x = fixture({ load: () => { throw new Error("Cannot find module './transport.js'"); } });
  const result = await run(x, acquired);
  assert.equal(result.execution.result.error.code, "KERNEL_CONTRACT");
  assert.deepEqual(result.execution.result.error.details, { thrown: { name: "Error", message: "Cannot find module './transport.js'" } });
  assert.equal(x.acquired(), 0);
});
test("a reported recovery the library refuses is named instead of the effect mismatch it causes", async () => {
  const result = await run(commitFixture(async () => ({ effect: "applied", recovery: { kind: "reported", references: [{ kind: "attempt", id: "two words" }] }, result: { ok: true, data: {} } })), acquired);
  assert.equal(result.execution.result.error.code, "KERNEL_CONTRACT");
  assert.deepEqual(result.execution.result.error.details, { thrown: { name: "ContractError", message: "Identifiers cannot contain whitespace." } });
  assert.equal(result.execution.operation.effect, "unknown");
});
test("a context provider that throws reports its cause", async () => {
  const result = await run(fixture(), { remote: async () => { throw new RangeError("connect refused"); } });
  assert.equal(result.execution.result.error.code, "KERNEL_CONTEXT");
  assert.deepEqual(result.execution.result.error.details, { thrown: { name: "RangeError", message: "connect refused" } });
});
test("level inventory is checked before provider acquisition", async () => {
  const x = fixture({ extra: { levels: { full: { output: "bounded" } } }, load: () => ({ default: { run: async () => ({ ok: true, data: {} }) } }) });
  const result = await run(x);
  assert.equal(result.execution.result.error.code, "KERNEL_CONTRACT"); assert.equal(x.acquired(), 0);
});
test("malformed applied result retains already observed recovery through hook and release failures", async () => {
  const recovery = recoveryFacts([{ kind: "revision", id: "r-known" }]);
  const x = fixture({ extra: { effects: "write" }, load: () => ({ default: { run: async () => ({ effect: "applied", recovery, result: { ok: false, error: { code: "FOREIGN", exitClass: "failed", message: "Invalid" } } }) } }) });
  const result = await run(x, { remote: async () => ({ ok: true, app: {}, release() { throw new Error("release"); } }) }, async input => {
    assert.deepEqual(input.outcome.operation.recovery, recovery); throw new Error("hook");
  });
  assert.equal(result.execution.result.error.code, "KERNEL_CONTRACT");
  assert.equal(result.execution.operation.effect, "applied"); assert.deepEqual(result.execution.operation.recovery, recovery);
  assert.deepEqual(result.secondary.map(x => x.code), ["KERNEL_GUIDANCE", "KERNEL_RELEASE"]);
});
test("cancellation during hook settlement does not release the app early", { timeout: 2000 }, async () => {
  const controller = new AbortController(); const x = fixture(); let releases = 0; let entered; let settle;
  const entry = new Promise(resolve => { entered = resolve; }); const barrier = new Promise(resolve => { settle = resolve; });
  const pending = run(x, { remote: async () => ({ ok: true, app: {}, release() { releases++; } }) }, async () => {
    entered(); await barrier; controller.signal.throwIfAborted(); return { issues: [] };
  }, { ...x.request, signal: controller.signal });
  await entry; controller.abort(); await Promise.resolve(); assert.equal(releases, 0);
  settle(); const result = await pending;
  assert.equal(releases, 1); assert.equal(result.execution.result.ok, true); assert.equal(result.secondary[0].code, "KERNEL_CANCELLED");
});
test("handler clock sleep uses the injected fake clock", async () => {
  const x = fixture({ extra: { requires: "none" }, load: () => ({ default: { run: async input => {
    const before = input.ctx.clock.now(); const wait = input.ctx.clock.sleep(milliseconds(5), input.ctx.signal);
    x.host.advance(milliseconds(5)); await wait;
    return { ok: true, data: { elapsed: input.ctx.clock.now() - before } };
  } } }) });
  assert.equal((await run(x)).execution.result.data.elapsed, 5);
});
function mutationFixture({ prepare, commit, decode = identitySchema, text = '{"name":"new"}' } = {}) {
  const state = { names: [], prepared: 0, committed: 0, released: 0, decoded: 0 };
  const x = fixture({ extra: { effects: "write", payload: { maxBytes: bytes(128), validatePath: "validate", examples: [{ payload: {}, why: "Example payload" }] } }, argv: ["--file", "payload.json"], files: { "payload.json": text },
    load: () => ({ default: mutation({ decode: schema(async value => { state.decoded++; return decode["~standard"].validate(value); }),
      prepare: async input => { state.prepared++; return prepare ? prepare(input, x, state) : { ok: true, value: { name: input.payload.name } }; },
      commit: async input => { state.committed++; if (commit) return commit(input, x, state);
        state.names.push(input.prepared.value.name);
        return { effect: "applied", recovery: recoveryFacts([{ kind: "item", id: `item-${state.names.length}` }]), result: { ok: true, data: { names: [...state.names] } } };
      } }) }) });
  const contexts = { remote: async () => ({ ok: true, app: state, release() { state.released++; } }) };
  return { ...x, contexts, state };
}
test("payload write and validation twin share decode/prepare, only write commits bounded service state", async () => {
  const x = mutationFixture({ decode: schema(value => ({ value: { name: value.name.toUpperCase() } })) });
  const twin = resolve(cliRegistry(x.cli), ["validate", "--file", "payload.json"]).invocation;
  const validation = await execute(twin, x.request, x.contexts, emptyFacts);
  assert.equal(validation.execution.result.ok, true);
  assert.equal(validation.execution.operation.effect, "read"); assert.equal(validation.execution.result.data.valid, true);
  assert.deepEqual(x.state.names, []); assert.equal(x.state.prepared, 1); assert.equal(x.state.committed, 0);
  const applied = await run(x);
  assert.equal(applied.execution.operation.effect, "applied");
  assert.deepEqual(x.state.names, ["NEW"]); assert.equal(x.state.prepared, 2); assert.equal(x.state.decoded, 2); assert.equal(x.state.committed, 1); assert.equal(x.state.released, 2);
});
for (const stage of ["prepare", "commit"]) test(`${stage} refusal changes no bounded service state and releases`, async () => {
  const x = mutationFixture({ [stage]: async (_input, x) => stage === "prepare" ? { ok: false, error: x.family.errors.error("REFUSED", { message: "Cannot prepare" }) }
    : { effect: "not_applied", result: { ok: false, error: x.family.errors.error("REFUSED", { message: "Cannot commit" }) } } });
  const result = await run(x);
  assert.equal(result.execution.result.error.code, "REFUSED"); assert.equal(result.execution.operation.effect, "not_applied");
  assert.deepEqual(x.state.names, []); assert.equal(x.state.committed, stage === "prepare" ? 0 : 1); assert.equal(x.state.released, 1);
});
for (const ack of ["throw", "malformed", "unknown"]) test(`unacknowledged payload commit (${ack}) preserves honest recovery after service change`, async () => {
  let hash;
  const x = mutationFixture({ commit: async (input, x, state) => {
    hash = input.prepared.payloadHash; state.names.push(input.prepared.value.name);
    if (ack === "throw") throw new Error("lost acknowledgment");
    if (ack === "malformed") return undefined;
    return { effect: "unknown", recovery: recoveryFacts([{ kind: "item", id: "known-item" }]), result: { ok: false, error: x.family.errors.error("REFUSED", { message: "Inspect before retry" }) } };
  } });
  const result = await run(x);
  assert.deepEqual(x.state.names, ["new"]); assert.equal(x.state.released, 1);
  assert.equal(result.execution.operation.effect, "unknown");
  if (ack === "unknown") assert.deepEqual(result.execution.operation.recovery.references, [{ kind: "item", id: "known-item" }]);
  else {
    assert.match(hash, /^[a-f0-9]{64}$/); assert.equal(result.execution.operation.recovery.payloadHash, hash);
    assert.deepEqual(Object.keys(result.execution.operation.recovery).sort(), ["advice", "commandPath", "kind", "payloadHash"]);
  }
});
test("payload hash records exact bounded file bytes and recovery survives hook and release failures", async () => {
  let token;
  const x = mutationFixture({ commit: async input => { token = input.prepared; return { effect: "applied", recovery: recoveryFacts([{ kind: "item", id: "one" }]), result: { ok: true, data: { saved: true } } }; } });
  const result = await run(x, { remote: async () => ({ ok: true, app: x.state, release() { x.state.released++; throw new Error("release failure"); } }) }, async () => { throw new Error("hook failure"); });
  assert.equal(token.payloadHash, await x.host.sha256(new TextEncoder().encode('{"name":"new"}')));
  assert.equal(result.execution.operation.effect, "applied"); assert.deepEqual(result.execution.operation.recovery.references, [{ kind: "item", id: "one" }]);
  assert.equal(x.state.released, 1); assert.deepEqual(result.secondary.map(x => x.code), ["KERNEL_GUIDANCE", "KERNEL_RELEASE"]);
});
test("cancellation after preparation prevents commit and releases", async () => {
  const controller = new AbortController();
  const x = mutationFixture({ prepare: async () => { controller.abort(); return { ok: true, value: {} }; } });
  const result = await run(x, x.contexts, emptyFacts, { ...x.request, signal: controller.signal });
  assert.equal(result.execution.result.error.code, "KERNEL_CANCELLED"); assert.equal(result.execution.operation.effect, "not_applied");
  assert.equal(x.state.committed, 0); assert.equal(x.state.released, 1);
});
test("foreign prepare error never reaches commit", async () => {
  const x = mutationFixture({ prepare: async () => ({ ok: false, error: { code: "FOREIGN", exitClass: "failed", message: "Foreign" } }) });
  const result = await run(x); assert.equal(result.execution.result.error.code, "KERNEL_CONTRACT"); assert.equal(x.state.committed, 0); assert.equal(x.state.released, 1);
});
test("invalid injected hash fails locally before context acquisition", async () => {
  const x = mutationFixture();
  const result = await run(x, x.contexts, emptyFacts, { ...x.request, host: { ...x.host, sha256: async () => "invalid" } });
  assert.equal(result.execution.result.error.code, "KERNEL_CONTRACT"); assert.equal(x.state.prepared, 0); assert.equal(x.state.released, 0);
});
test("payload commit renderer is paired with its checked result and invoked after release", async () => {
  let released = false;
  const x = fixture({ extra: { effects: "write", payload: { maxBytes: bytes(128), validatePath: "validate", examples: [{ payload: {}, why: "Example payload" }] } }, argv: ["--file", "payload.json"], files: { "payload.json": "{}" },
    load: () => ({ default: mutation({ decode: identitySchema, prepare: async () => ({ ok: true, value: {} }),
      commit: writeRunner({ run: async () => ({ effect: "applied", recovery: recoveryFacts([{ kind: "revision", id: "saved" }]), result: { ok: true, data: { saved: true } } }), text: data => {
        assert.equal(released, true); assert.equal(data.saved, true); throw new Error("renderer failed");
      } }) }) }) });
  const result = await run(x, { remote: async () => ({ ok: true, app: {}, release() { released = true; } }) });
  assert.throws(() => result.execution.renderPrimary(), /renderer failed/);
  assert.equal(result.execution.operation.effect, "applied"); assert.equal(result.execution.operation.recovery.references[0].id, "saved");
});
test("oversized mandatory unknown-acknowledgment path is refused before context or mutation", async () => {
  const x = fixture({ extra: { effects: "write", path: "x".repeat(1100) } });
  const result = await run(x);
  assert.equal(result.execution.result.error.code, "KERNEL_CONTRACT"); assert.equal(x.acquired(), 0);
});
test("payload cancellation after service write is unknown and retains payload hash", async () => {
  const controller = new AbortController();
  const x = mutationFixture({ commit: async (input, _x, state) => { state.names.push(input.prepared.value.name); controller.abort(); controller.signal.throwIfAborted(); } });
  const result = await run(x, x.contexts, emptyFacts, { ...x.request, signal: controller.signal });
  assert.equal(result.execution.result.error.code, "KERNEL_CANCELLED"); assert.equal(result.execution.operation.effect, "unknown");
  assert.match(result.execution.operation.recovery.payloadHash, /^[a-f0-9]{64}$/); assert.deepEqual(x.state.names, ["new"]); assert.equal(x.state.released, 1);
});
test("malformed payload commit code preserves known app IDs but never passes its foreign code", async () => {
  const x = mutationFixture({ commit: async () => ({ effect: "applied", recovery: recoveryFacts([{ kind: "item", id: "known" }]), result: { ok: false, error: { code: "FOREIGN", exitClass: "failed", message: "Unbound" } } }) });
  const result = await run(x); assert.equal(result.execution.result.error.code, "KERNEL_CONTRACT");
  assert.equal(result.execution.operation.effect, "applied"); assert.equal(result.execution.operation.recovery.references[0].id, "known");
});
test("Standard Schema implementations may expose their protocol through prototype getters", async () => {
  let calls = 0;
  class Decoder {
    get "~standard"() { return { version: 1, vendor: "class-schema", validate(value) { calls++; assert.equal(this.vendor, "class-schema"); return { value }; } }; }
    get unrelated() { throw new Error("unrelated schema property touched"); }
  }
  const x = fixture({ extra: { payload }, argv: ["--file", "payload.json"], files: { "payload.json": '{"valid":true}' },
    load: () => ({ default: payloadRead({ decode: new Decoder(), run: async input => ({ ok: true, data: input.payload }) }) }) });
  const result = await run(x, { remote: async () => ({ ok: true, app: {} }) });
  assert.equal(result.execution.result.ok, true); assert.equal(calls, 1); assert.deepEqual(result.execution.result.data, { valid: true });
});
test("lazy bindings accept real ESM import namespaces with named exports", async () => {
  const x = fixture({ extra: { requires: "none" }, load: () => import('data:text/javascript,export const helper = 1; export default { run: async () => ({ ok: true, data: { source: "esm" } }) };') });
  assert.equal(x.loaded(), 0);
  const result = await run(x);
  assert.equal(result.execution.result.ok, true);
  assert.deepEqual(result.execution.result.data, { source: "esm" });
  assert.equal(x.loaded(), 1);
});

function acquiredWithRelease(app, placement, finalize) {
  class Acquired {
    ok = true;
    app = app;
    release() { return finalize(this); }
  }
  const acquired = new Acquired();
  if (placement !== "prototype") Object.defineProperty(acquired, "release", {
    value() { return finalize(this); }, enumerable: placement === "enumerable", configurable: true,
  });
  return acquired;
}
for (const placement of ["prototype", "non-enumerable"]) {
  for (const outcome of ["success", "failure", "cancel"]) test(`${placement} finalizer runs once after ${outcome} and hook settlement`, async () => {
    const events = []; const app = { open: true }; const controller = new AbortController();
    const x = fixture({ load: () => ({ default: { run: async input => {
      assert.equal(input.app, app); events.push("handler");
      if (outcome === "cancel") { controller.abort(); controller.signal.throwIfAborted(); }
      return outcome === "failure" ? { ok: false, error: x.family.errors.error("REFUSED", { message: "Refused" }) } : { ok: true, data: {} };
    } } }) });
    const acquired = acquiredWithRelease(app, placement, async receiver => {
      assert.equal(receiver, acquired); assert.equal(receiver.app, app);
      await Promise.resolve(); app.open = false; events.push("release");
    });
    const result = await run(x, { remote: async () => acquired }, async () => {
      assert.equal(app.open, true); events.push("hook"); await Promise.resolve(); events.push("hook settled"); return { issues: [] };
    }, { ...x.request, signal: controller.signal });
    assert.deepEqual(events, ["handler", "hook", "hook settled", "release"]);
    assert.equal(result.execution.result.ok, outcome === "success");
    if (outcome !== "success") assert.equal(result.execution.result.error.code, outcome === "failure" ? "REFUSED" : "KERNEL_CANCELLED");
    assert.deepEqual(result.secondary, []); assert.equal(app.open, false);
  });
}
test("malformed acquisition cleanup rejection remains secondary and is awaited", async () => {
  const x = fixture(); let releases = 0;
  const acquired = acquiredWithRelease({}, "prototype", async () => { await Promise.resolve(); releases++; throw new Error("cleanup failure"); });
  delete acquired.app;
  const result = await run(x, { remote: async () => acquired });
  assert.equal(releases, 1); assert.equal(result.execution.result.error.code, "KERNEL_CONTRACT");
  assert.deepEqual(result.secondary.map(failure => failure.code), ["KERNEL_RELEASE"]);
});
