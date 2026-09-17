import assert from "node:assert/strict";
import test from "node:test";
import { commandsFor, defineErrors, defineGroup, defineFlow, invocation, validationInvocation, bytes } from "cli-for-agents";
import { createCli } from "cli-for-agents/runtime";

const spec = (path, extra = {}) => ({ path, summary: path, description: `Run ${path}.`, requires: "none", effects: "read", args: [], flags: {}, ...extra });
const binding = { examples: [{ why: "Inspect status" }], handler: async () => { throw new Error("lazy handler evaluated"); } };
const family = (globals = {}) => commandsFor()({ errors: defineErrors({ OFFLINE: { exitClass: "connection", description: "Connection unavailable" } }), globalFlags: globals });

test("family declarations and createCli construct an offline graph without calling lazy code", () => {
  assert.doesNotThrow(() => {
    const f = family();
    const doctor = f.defineCommand(spec("system doctor"), binding);
    createCli({ name: "tool", version: "1", family: f, commands: [doctor],
      groups: [defineGroup({ path: "system", summary: "System", description: "Inspect system" })],
      contexts: {}, doctor: invocation(doctor, {}),
      output: { artifacts: { resolve() { throw new Error("policy evaluated"); } } },
      guidance: { load() { throw new Error("guidance evaluated"); }, conflictSink() {} },
    });
  }, "declaration and synchronous registry construction must be executable without lazy acquisition");
});

function fixture(globals = {}) {
  const f = family(globals);
  const doctor = f.defineCommand(spec("doctor"), binding);
  const options = { name: "tool", version: "1", family: f, commands: [doctor], contexts: {},
    doctor: invocation(doctor, {}), output: { artifacts: { resolve() { throw new Error("policy evaluated"); } } } };
  return { f, doctor, options, command: (path, extra) => f.defineCommand(spec(path, extra), binding) };
}
const valueFlag = (value, extra = {}) => ({ description: "Value", value, ...extra });
const stringFlag = (extra) => valueFlag({ kind: "string" }, extra);

// Deliberately invalid JavaScript fixtures exercise the real erased public boundary.
for (const [name, configure, error] of [
  ["duplicate paths", x => ({ commands: [x.doctor, x.command("doctor")] }), /duplicate/i],
  ["missing parent", x => ({ commands: [x.doctor, x.command("missing leaf")] }), /parent/i],
  ["dangling related edge", x => ({ commands: [x.doctor, x.command("list", { related: [{ path: "absent", description: "Missing" }] })] }), /related|edge/i],
  ["foreign family", x => ({ commands: [x.doctor, family().defineCommand(spec("other"), binding)] }), /family/i],
  ["forged command", x => ({ commands: [x.doctor, { ...x.command("other") }] }), /command|family/i],
  ["missing doctor", () => ({ doctor: undefined }), /doctor/i],
  ["foreign doctor", () => { const x = fixture(); return { doctor: invocation(x.doctor, {}) }; }, /doctor|member/i],
  ["write doctor", x => { const c = x.command("write", { effects: "write" }); return { commands: [x.doctor, c], doctor: invocation(c, {}) }; }, /doctor|read/i],
  ["forged doctor", x => ({ doctor: { ...x.options.doctor } }), /doctor|invocation/i],
  ["missing provider", x => ({ commands: [x.doctor, x.command("remote", { requires: "remote" })] }), /context|provider/i],
  ["reserved route", x => ({ commands: [x.doctor, x.command("exit-codes")] }), /reserved/i],
  ["duplicate twin", x => ({ commands: [x.doctor, x.f.defineCommand(spec("write", { effects: "write", payload: { maxBytes: bytes(10), validatePath: "doctor" } }), { ...binding, examples: [{ file: "payload.json", why: "Write" }] })] }), /duplicate/i],
  ["unsafe skill path", x => ({ documentation: { directory: "docs" }, commands: [x.doctor, x.command("list", { skills: [{ path: "../secret", readWhen: "Always" }] })] }), /reference|skill/i],
  ["missing documentation root", x => ({ commands: [x.doctor, x.command("list", { skills: [{ path: "guide.md", readWhen: "Always" }] })] }), /documentation/i],
  ["foreign flow step", () => ({ flows: [defineFlow({ id: "flow", steps: [{ command: fixture().doctor, description: "Inspect" }] })] }), /flow|member/i],
]) {
  test(`registration rejects ${name}`, () => {
    const x = fixture();
    assert.throws(() => createCli({ ...x.options, ...configure(x) }), error);
  });
}

for (const [name, extra] of [
  ["empty enum", { flags: { mode: valueFlag({ kind: "enum", values: [] }) } }],
  ["duplicate enum", { flags: { mode: valueFlag({ kind: "enum", values: ["a", "a"] }) } }],
  ["wrong enum default", { flags: { mode: valueFlag({ kind: "enum", values: ["a"] }, { default: "b" }) } }],
  ["required default", { flags: { mode: stringFlag({ required: true, default: "a" }) } }],
  ["repeat default", { flags: { mode: stringFlag({ repeatable: true, default: "a" }) } }],
  ["boolean repeat", { flags: { mode: valueFlag({ kind: "boolean" }, { repeatable: true }) } }],
  ["file repeat", { flags: { mode: valueFlag({ kind: "file", maxBytes: 1 }, { repeatable: true }) } }],
  ["file default", { flags: { mode: valueFlag({ kind: "file", maxBytes: 1 }, { default: "a" }) } }],
  ["secret default", { flags: { mode: stringFlag({ secret: true, default: "a" }) } }],
  ["bad credential", { flags: { mode: stringFlag({ credential: { env: "TOKEN" } }) } }],
  ["derived secret", { flags: { mode: stringFlag({ secret: true, fileSource: { maxBytes: 1 } }) } }],
  ["reserved flag", { flags: { json: stringFlag() } }],
  ["bad flag spelling", { flags: { "bad=name": stringFlag() } }],
  ["bad pattern", { flags: { mode: valueFlag({ kind: "pattern", pattern: "[", description: "Pattern" }) } }],
  ["invalid integer bounds", { flags: { mode: valueFlag({ kind: "integer", min: 4, max: 1 }) } }],
  ["duplicate args", { args: [{ name: "x", description: "X", value: { kind: "string" } }, { name: "x", description: "X", value: { kind: "string" } }] }],
  ["positional required ordering", { args: [{ name: "x", description: "X", value: { kind: "string" }, required: false }, { name: "y", description: "Y", value: { kind: "string" } }] }],
  ["nonfinal variadic", { args: [{ name: "x", description: "X", value: { kind: "string" }, variadic: true }, { name: "y", description: "Y", value: { kind: "string" } }] }],
  ["empty selector", { levels: { full: { output: "bounded", selectors: [] } } }],
  ["equal selector sets", { levels: { a: { output: "bounded", selectors: ["x", "y"] }, b: { output: "bounded", selectors: ["y", "x"] } } }],
  ["incomparable overlapping selectors", { levels: { a: { output: "bounded", selectors: ["x", "y"] }, b: { output: "bounded", selectors: ["x", "z"] } } }],
  ["selector collision", { flags: { full: stringFlag() }, levels: { full: { output: "bounded" } } }],
]) {
  test(`declarations reject ${name}`, () => assert.throws(() => fixture().command("list", extra), TypeError));
}

test("required bare secrets cannot construct a runnable doctor reference", () => {
  const x = fixture();
  const c = x.f.defineCommand(spec("auth", { flags: { token: stringFlag({ secret: true, required: true }) } }), { ...binding, examples: [{ flags: { token: "example" }, why: "Auth" }] });
  assert.throws(() => invocation(c, {}), /required|secret/i);
});

test("binding snapshots metadata and retains lazy references", () => {
  const x = fixture();
  const s = spec("list", { flags: { mode: valueFlag({ kind: "enum", values: ["a", "b"] }) } });
  const c = x.f.defineCommand(s, binding);
  s.path = "changed";
  s.flags.mode.value.values.push("c");
  assert.equal(c.spec.path, "list");
  assert.deepEqual(c.spec.flags.mode.value.values, ["a", "b"]);
  assert.ok(Object.isFrozen(c.spec.flags.mode.value.values));
});

// Internal owners may be exercised directly before public runtime composition exists.
const { cliRegistry, registryState, checkRuleReferences } = await import("../dist/internal/registry.js");
test("one graph derives groups, payload twins, selector and file help inputs", () => {
  const x = fixture({ region: valueFlag({ kind: "enum", values: ["us", "eu"] }, { default: "us" }) });
  const write = x.f.defineCommand(spec("items write", { effects: "write", payload: { maxBytes: bytes(100), validatePath: "items validate" }, flags: { text: stringFlag({ fileSource: { maxBytes: bytes(20) } }) } }), { ...binding, examples: [{ file: "data.json", why: "Write" }] });
  const read = x.command("items list", { levels: { context: { output: "bounded" }, full: { selectors: ["context", "full"], output: "artifact-eligible" } } });
  const group = defineGroup({ path: "items", summary: "Items", description: "Manage items" });
  const cli = createCli({ ...x.options, commands: [x.doctor, write, read], groups: [group], flows: [defineFlow({ id: "inspect", steps: [{ command: read, description: "Inspect items" }] })] });
  const graph = registryState(cliRegistry(cli));
  assert.deepEqual(Object.keys(graph.nodes), ["", "items", "doctor", "items write", "items validate", "items list"]);
  assert.equal(graph.nodes["items validate"].command, write);
  const flags = graph.nodes["items write"].model.flags;
  assert.equal(flags["text-file"].help.source, "file");
  assert.equal(flags.file.help.source, "payload");
  assert.equal(flags.region.help.source, "global");
  assert.deepEqual(flags.region.help.choices, ["us", "eu"]);
  assert.equal(flags.region.help.default, "us");
  assert.deepEqual(graph.nodes["items list"].model.selectors.full, ["context", "full"]);
  assert.ok(Object.isFrozen(graph.nodes));
});

test("lazy rule references validate membership and identifiers against the same registry", () => {
  const x = fixture(); const registry = cliRegistry(createCli(x.options));
  assert.doesNotThrow(() => checkRuleReferences(registry, [{ id: "inspect", appliesTo: [x.doctor] }]));
  assert.throws(() => checkRuleReferences(registry, [{ id: "inspect", appliesTo: [fixture().doctor] }]), /member/i);
  assert.throws(() => checkRuleReferences(registry, [{ id: "inspect", appliesTo: [] }]), /reference/i);
  assert.throws(() => checkRuleReferences(registry, [{ id: "inspect", appliesTo: [x.doctor] }, { id: "inspect", appliesTo: [x.doctor] }]), /duplicate/i);
});

test("createCli retains configuration without exposing caller mutations", async () => {
  const { cliConfiguration } = await import("../dist/internal/registry.js");
  const x = fixture();
  const provider = async () => { throw new Error("provider called"); };
  const options = { ...x.options, contexts: { remote: provider } };
  const cli = createCli(options);
  options.commands.length = 0;
  options.contexts.remote = () => {};
  const saved = cliConfiguration(cli);
  assert.equal(saved.commands.length, 1);
  assert.equal(saved.contexts.remote, provider);
  assert.equal(saved.family, x.f);
  assert.equal(saved.doctor, x.options.doctor);
});

const { resolve } = await import("../dist/internal/registry.js");
function parseFixture(extra = {}, example = {}, globals = {}) {
  const x = fixture(globals);
  const command = x.f.defineCommand(spec("items list", extra), { ...binding, examples: [{ ...example, why: "List" }] });
  const cli = createCli({ ...x.options, commands: [x.doctor, command], groups: [defineGroup({ path: "items", summary: "Items", description: "Items" })] });
  return { ...x, command, cli, parse: tokens => resolve(cliRegistry(cli), tokens) };
}
function leaf(result) {
  assert.equal(result.kind, "leaf", JSON.stringify(result));
  return result.invocation;
}
const arg = (name, value = { kind: "string" }, extra = {}) => ({ name, description: name, value, ...extra });

test("generated file and selector names belong to their leaf without cross-command owner collisions", async () => {
  const x = fixture();
  const generated = x.command("generated", { flags: { text: stringFlag({ fileSource: { maxBytes: bytes(20) } }) }, levels: { full: { output: "bounded" } } });
  const ordinary = x.command("ordinary", { flags: { "text-file": stringFlag(), full: valueFlag({ kind: "boolean" }) } });
  const { helpNode } = await import("cli-for-agents/runtime");
  const { rebindInvocation } = await import("../dist/internal/registry.js");
  const { invocationArgv } = await import("../dist/internal/invocations.js");
  for (const commands of [[x.doctor, generated, ordinary], [ordinary, generated, x.doctor]]) {
    const cli = createCli({ ...x.options, commands });
    const registry = cliRegistry(cli);
    const first = leaf(resolve(registry, ["generated", "--text-file", "note.md", "--full"]));
    assert.deepEqual(first.input.flags, {});
    assert.equal(first.input.sources[0].kind, "flag");
    assert.equal(first.input.sources[0].name, "text");
    assert.equal(first.input.sources[0].path, "note.md");
    assert.equal(first.input.level, "full");
    const second = leaf(resolve(registry, ["ordinary", "--text-file", "literal text", "--full=false"]));
    assert.deepEqual(second.input.flags, { "text-file": "literal text", full: false });
    assert.deepEqual(second.input.sources, []);
    assert.equal(second.input.level, undefined);
    assert.equal(helpNode(cli, "generated").flags.find(flag => flag.name === "full").source, "selector");
    assert.equal(helpNode(cli, "ordinary").flags.find(flag => flag.name === "full").source, "domain");
    for (const ref of [invocation(generated, { flags: { "text-file": "note.md" }, level: "full" }), invocation(ordinary, { flags: { "text-file": "literal text", full: false } })]) {
      const rebound = rebindInvocation(registry, JSON.parse(JSON.stringify(ref)));
      assert.deepEqual(leaf(resolve(registry, invocationArgv(rebound))).input, leaf(resolve(registry, invocationArgv(ref))).input);
    }
  }
});

test("global, reserved and generated names still cannot collide within a leaf", () => {
  for (const [globals, extra] of [
    [{ profile: stringFlag() }, { flags: { profile: valueFlag({ kind: "boolean" }) } }],
    [{ message: stringFlag({ fileSource: { maxBytes: bytes(20) } }) }, { flags: { "message-file": stringFlag() } }],
    [{ full: valueFlag({ kind: "boolean" }) }, { levels: { full: { output: "bounded" } } }],
    [{}, { flags: { text: stringFlag({ fileSource: { maxBytes: bytes(20) } }), "text-file": stringFlag() } }],
    ...["file", "out", "json"].map(name => [{}, { flags: { [name]: stringFlag() } }]),
  ]) assert.throws(() => fixture(globals).command("inspect", extra), /collision|reserved/i);
});

test("globals keep their meaning before, between and after path and positional tokens", () => {
  const x = parseFixture({ args: [arg("name")] }, { args: { name: "one" } }, { profile: stringFlag() });
  for (const argv of [
    ["--profile", "dev", "items", "list", "one"],
    ["items", "--profile=dev", "list", "one"],
    ["items", "list", "--profile", "dev", "one"],
    ["items", "list", "one", "--profile=dev"],
  ]) {
    const parsed = leaf(x.parse(argv));
    assert.deepEqual(parsed.input.globals, { profile: "dev" });
    assert.deepEqual(parsed.input.args, { name: "one" });
  }
});

test("all command-specific generated inputs require the full leaf path", () => {
  const x = parseFixture({ payload: { maxBytes: bytes(50) }, flags: { text: stringFlag({ fileSource: { maxBytes: bytes(20) } }) }, levels: { full: { output: "artifact-eligible" } } }, { file: "data.json" });
  for (const flags of [["--text=value"], ["--text-file", "note.md"], ["--file=data.json"], ["--full"], ["--out", "result.json"]]) {
    for (const argv of [[...flags, "items", "list", "--help"], ["items", ...flags, "list", "--help"]]) {
      const refused = x.parse(argv);
      assert.equal(refused.kind, "invalid", JSON.stringify(argv));
      assert.match(refused.issues[0].message, /after the complete command path/);
    }
  }
  assert.equal(x.parse(["items", "list", "--file", "data.json", "--full", "--out", "result.json"]).kind, "leaf");
});

test("scalar parser preserves negative integers, equals strings and explicit booleans", () => {
  const x = parseFixture({ args: [arg("offset", { kind: "integer", min: -10 })], flags: { limit: valueFlag({ kind: "integer" }), text: stringFlag(), quiet: valueFlag({ kind: "boolean" }) } }, { args: { offset: 0 } });
  const parsed = leaf(x.parse(["items", "list", "-3", "--limit", "-5", "--text=a=b c", "--quiet=false"]));
  assert.equal(parsed.command, x.command);
  assert.deepEqual(parsed.input.args, { offset: -3 });
  assert.deepEqual(parsed.input.flags, { limit: -5, text: "a=b c", quiet: false });
  assert.equal(parsed.path, "items list");
  assert.equal(parsed.validation, false);
});

test("scalar parser separates globals and applies declared defaults", () => {
  const x = parseFixture({ args: [arg("name", { kind: "string" }, { default: "all" })], flags: { limit: valueFlag({ kind: "integer" }, { default: 10 }) } }, {}, { region: valueFlag({ kind: "enum", values: ["us", "eu"] }, { default: "us" }) });
  const a = leaf(x.parse(["--region=eu", "items", "--json", "list"]));
  assert.deepEqual(a.input.args, { name: "all" });
  assert.deepEqual(a.input.flags, { limit: 10 });
  assert.deepEqual(a.input.globals, { region: "eu" });
  assert.equal(a.json, true);
  assert.equal(leaf(x.parse(["items", "list"])).input.globals.region, "us");
});

test("required and optional positionals map in declaration order", () => {
  const x = parseFixture({ args: [arg("first"), arg("second", { kind: "integer" }, { required: false })], flags: { mode: stringFlag({ required: true }) } }, { args: { first: "a" }, flags: { mode: "m" } });
  assert.deepEqual(leaf(x.parse(["items", "list", "a", "4", "--mode", "m"])).input.args, { first: "a", second: 4 });
  for (const tokens of [["items", "list", "--mode=m"], ["items", "list", "a"], ["items", "list", "a", "4", "extra", "--mode=m"]]) assert.equal(x.parse(tokens).kind, "invalid");
});

for (const tokens of [
  ["--limit=2", "--limit", "3"], ["--quiet", "--quiet"], ["--region=us", "--region=eu"],
  ["--limit=1.5"], ["--limit=Infinity"], ["--limit=1e2"], ["--limit=0x10"], ["--limit=9007199254740992"],
  ["--limit"], ["--limit", "--quiet"], ["--quiet=yes"], ["--unknown"], ["-q"], ["--text"], ["--region=other"],
]) {
  test(`scalar token refusal: ${JSON.stringify(tokens)}`, () => {
    const x = parseFixture({ flags: { limit: valueFlag({ kind: "integer" }), quiet: valueFlag({ kind: "boolean" }), text: stringFlag() } }, {}, { region: valueFlag({ kind: "enum", values: ["us", "eu"] }) });
    assert.equal(x.parse(["items", "list", ...tokens]).kind, "invalid");
  });
}

test("scalar values enforce declared URL, pattern, string, ID and numeric constraints", () => {
  const x = parseFixture({ flags: { url: valueFlag({ kind: "url" }), code: valueFlag({ kind: "pattern", pattern: "^[A-Z]{2}$", description: "Two capitals" }), label: valueFlag({ kind: "string", minLength: 1, maxLength: 3 }), item: valueFlag({ kind: "id", domain: "item" }), n: valueFlag({ kind: "integer", min: -2, max: 2 }) } });
  const parsed = leaf(x.parse(["items", "list", "--url=https://example.test/a", "--code=AB", "--label=ok", "--item=item-1", "--n=-2"]));
  assert.equal(parsed.input.flags.item, "item-1");
  for (const token of ["--url=relative", "--code=ab", "--label=", "--label=long", "--item=two words", "--n=3"]) assert.equal(x.parse(["items", "list", token]).kind, "invalid", token);
});

test("offline routes and unknown paths resolve without lazy acquisition", () => {
  const x = parseFixture({ args: [arg("required")] }, { args: { required: "x" } });
  for (const [tokens, route, path] of [
    [[], "help", ""], [["--help"], "help", ""], [["items", "--help", "--json"], "help", "items"],
    [["items", "list", "--help"], "help", "items list"], [["--version"], "version", ""], [["version"], "version", ""], [["exit-codes"], "exit-codes", ""],
  ]) assert.deepEqual(x.parse(tokens), { kind: "offline", route, path, json: tokens.includes("--json") });
  for (const tokens of [["items"], ["items", "missing"], ["missing", "--help"], ["items", "missing", "--version"], ["items", "list", "--bogus", "--help"]]) assert.equal(x.parse(tokens).kind, "invalid");
});

test("parsed invocations retain provenance and immutable input", async () => {
  const { checkParsedInvocation } = await import("../dist/internal/registry.js");
  const x = parseFixture({ flags: { constructor: stringFlag(), text: stringFlag() } });
  const parsed = leaf(x.parse(["items", "list", "--text=checked"]));
  assert.deepEqual(parsed.input.flags, { text: "checked" });
  assert.doesNotThrow(() => checkParsedInvocation(parsed));
  assert.throws(() => checkParsedInvocation({ ...parsed }), /parsed invocation/i);
  assert.ok(Object.isFrozen(parsed.input.flags));
});

test("required global flags are checked before an invocation can execute", () => {
  const f = family({ region: stringFlag({ required: true }) });
  const doctor = f.defineCommand(spec("doctor"), { ...binding, examples: [{ flags: { region: "us" }, why: "Inspect" }] });
  const cli = createCli({ name: "tool", version: "1", family: f, commands: [doctor], contexts: {}, doctor: invocation(doctor, { flags: { region: "us" } }), output: { artifacts: { directory: "/tmp/output", forbiddenRoots: [] } } });
  assert.equal(resolve(cliRegistry(cli), ["doctor"]).kind, "invalid");
  assert.equal(leaf(resolve(cliRegistry(cli), ["doctor", "--region=eu"])).input.globals.region, "eu");
  assert.equal(resolve(cliRegistry(cli), ["doctor", "--help"]).kind, "offline");
});

test("repeatable flags and final variadic preserve occurrence order and empty arrays", () => {
  const x = parseFixture({ args: [arg("first"), arg("rest", { kind: "integer" }, { variadic: true, required: false })], flags: { tag: stringFlag({ repeatable: true }), n: valueFlag({ kind: "integer" }, { repeatable: true, required: true }) } }, { args: { first: "a" }, flags: { n: [1] } }, { region: stringFlag({ repeatable: true }) });
  const parsed = leaf(x.parse(["--region=us", "items", "list", "a", "-2", "3", "--tag=one", "--tag", "two", "--n=-1", "--n=2", "--region=eu"]));
  assert.deepEqual(parsed.input.args, { first: "a", rest: [-2, 3] });
  assert.deepEqual(parsed.input.flags, { tag: ["one", "two"], n: [-1, 2] });
  assert.deepEqual(parsed.input.globals, { region: ["us", "eu"] });
  assert.deepEqual(leaf(x.parse(["items", "list", "a", "--n=1"])).input.flags, { tag: [], n: [1] });
  assert.deepEqual(leaf(x.parse(["items", "list", "a", "--n=1"])).input.args.rest, []);
  assert.equal(x.parse(["items", "list", "a"]).kind, "invalid");
});

test("required variadics require at least one item", () => {
  const x = parseFixture({ args: [arg("items", { kind: "string" }, { variadic: true })] }, { args: { items: ["one"] } });
  assert.deepEqual(leaf(x.parse(["items", "list", "one", "two"])).input.args.items, ["one", "two"]);
  assert.equal(x.parse(["items", "list"]).kind, "invalid");
});

test("file inputs retain paths and bounds for execution; inline and derived alternatives are exclusive", () => {
  const x = parseFixture({ args: [arg("document", { kind: "file", maxBytes: bytes(10) })], flags: { note: stringFlag({ required: true, fileSource: { maxBytes: bytes(20) } }), raw: valueFlag({ kind: "file", maxBytes: bytes(30) }) } }, { args: { document: "doc.txt" }, flags: { note: "hello" } });
  const parsed = leaf(x.parse(["items", "list", "doc.txt", "--note-file", "-", "--raw=raw.txt"]));
  assert.deepEqual(parsed.input.sources, [
    { kind: "argument", name: "document", path: "doc.txt", maxBytes: 10 },
    { kind: "flag", name: "note", path: "-", maxBytes: 20 },
    { kind: "flag", name: "raw", path: "raw.txt", maxBytes: 30 },
  ]);
  assert.equal(parsed.input.flags.note, undefined);
  assert.equal(leaf(x.parse(["items", "list", "doc.txt", "--note=inline"])).input.flags.note, "inline");
  for (const tokens of [["doc.txt"], ["doc.txt", "--note=x", "--note-file=n.txt"], ["doc.txt", "--note-file="]]) assert.equal(x.parse(["items", "list", ...tokens]).kind, "invalid");
});

test("structured reads and write validation twins accept the same file declaration", () => {
  for (const effects of ["read", "write"]) {
    const payload = effects === "read" ? { maxBytes: bytes(64) } : { maxBytes: bytes(64), validatePath: "items validate" };
    const x = parseFixture({ effects, payload }, { file: "data.json" });
    const parsed = leaf(x.parse(["items", effects === "read" ? "list" : "validate", "--file=-"]));
    assert.equal(parsed.command, x.command);
    assert.equal(parsed.validation, effects === "write");
    assert.equal(parsed.input.file, "-");
    assert.deepEqual(parsed.input.sources, [{ kind: "payload", name: "file", path: "-", maxBytes: 64 }]);
    assert.equal(x.parse(["items", "list"]).kind, "invalid");
    if (effects === "read") assert.equal(x.parse(["items", "validate", "--file=data.json"]).kind, "invalid");
  }
});

test("every combination of two selected stdin consumers is refused before a read", () => {
  const x = parseFixture({ args: [arg("document", { kind: "file", maxBytes: bytes(10) })], flags: { note: stringFlag({ fileSource: { maxBytes: bytes(20) } }), raw: valueFlag({ kind: "file", maxBytes: bytes(30) }) }, payload: { maxBytes: bytes(40) } }, { args: { document: "doc.txt" }, file: "data.json" }, { config: valueFlag({ kind: "file", maxBytes: bytes(50) }) });
  const selected = ["argument", "note-file", "raw", "file", "config"];
  for (let i = 0; i < selected.length; i++) for (let j = i + 1; j < selected.length; j++) {
    const stdin = new Set([selected[i], selected[j]]);
    const tokens = ["items", "list", stdin.has("argument") ? "-" : "doc.txt", ...selected.slice(1).map(name => `--${name}=${stdin.has(name) ? "-" : "data.txt"}`)];
    const result = x.parse(tokens);
    assert.equal(result.kind, "invalid", tokens.join(" "));
    assert.match(result.issues[0].message, /multiple stdin/i);
  }
});

test("composite detail selectors choose the unique most-specific exact set", () => {
  const x = parseFixture({ flags: { state: stringFlag() }, levels: { context: { output: "bounded" }, full: { selectors: ["context", "full"], output: "artifact-eligible" }, summary: { output: "bounded" } } });
  assert.equal(leaf(x.parse(["items", "list", "--context"])).input.level, "context");
  const full = leaf(x.parse(["items", "list", "--full", "--state=open", "--context", "--out=out.json"]));
  assert.equal(full.input.level, "full"); assert.equal(full.input.out, "out.json"); assert.deepEqual(full.input.flags, { state: "open" });
  assert.equal(leaf(x.parse(["items", "list"])).input.level, undefined);
  for (const tail of [["--full"], ["--summary", "--context"], ["--context", "--full", "--summary"], ["--context=false"], ["--context", "--out=a.json"], ["--out=a.json"]]) assert.equal(x.parse(["items", "list", ...tail]).kind, "invalid");
});

test("binary output accepts out without a level", () => {
  const x = parseFixture({ output: "binary" });
  assert.equal(leaf(x.parse(["items", "list", "--out=report.bin"])).input.out, "report.bin");
});

test("passthrough opt-in preserves every token after the delimiter without reparsing", () => {
  const x = parseFixture({ passthrough: true, args: [arg("name")] }, { args: { name: "one" } });
  const tokens = ["", "two words", "--unknown", "--help", "--", "-3"];
  const parsed = leaf(x.parse(["items", "list", "one", "--", ...tokens]));
  assert.deepEqual(parsed.input.passthrough, tokens);
  assert.deepEqual(leaf(x.parse(["items", "list", "one"])).input.passthrough, []);
  assert.equal(x.parse(["items", "list", "--", "one"]).kind, "invalid");
});

test("without passthrough -- only terminates options for declared positionals", () => {
  const x = parseFixture({ args: [arg("name")] }, { args: { name: "one" } });
  assert.equal(leaf(x.parse(["items", "list", "--", "--help"])).input.args.name, "--help");
  assert.equal(x.parse(["items", "list", "--", "one", "two"]).kind, "invalid");
});

const { renderInvocation } = await import("cli-for-agents/runtime");
const { execFileSync } = await import("node:child_process");
function shellTokens(rendered) {
  // Execute only printf, supplied as the renderer's executable by these tests.
  // NUL separators expose actual POSIX shell token boundaries without reinterpretation.
  return execFileSync("/bin/sh", ["-c", rendered], { encoding: "utf8" }).split("\0").slice(0, -1);
}

test("invocation renderer quotes shell syntax and preserves empty, Unicode and apostrophe tokens", () => {
  const x = parseFixture({ args: [arg("values", { kind: "string" }, { variadic: true })], flags: { text: stringFlag(), n: valueFlag({ kind: "integer" }, { repeatable: true }) } }, { args: { values: ["example"] } });
  const values = ["", "two words", "a'b", "$(printf INJECTED)", "`printf INJECTED`", "; printf INJECTED", "雪", "--help"];
  const ref = invocation(x.command, { args: { values }, flags: { text: "x=y'$(printf INJECTED)" } });
  const shell = renderInvocation(ref, "printf");
  // printf's first argument is the command path, so replace only the known safe
  // prefix with a fixed format. Everything under test remains renderer-produced.
  const output = shellTokens(shell.replace(/^printf /, "printf '%s\\0' "));
  assert.deepEqual(output, ["items", "list", "--text=x=y'$(printf INJECTED)", "--", ...values]);
  const parsed = leaf(x.parse(output));
  assert.deepEqual(parsed.input.args.values, values);
  assert.equal(parsed.input.flags.text, "x=y'$(printf INJECTED)");
});

test("rendering requires a registered target and rejects forged invocation and executable controls", () => {
  const f = family(); const c = f.defineCommand(spec("inspect"), binding); const ref = invocation(c, {});
  assert.throws(() => renderInvocation(ref, "tool"), /registered|member/i);
  const cli = createCli({ name: "tool", version: "1", family: f, commands: [c], contexts: {}, doctor: ref, output: { artifacts: { directory: "/tmp/out", forbiddenRoots: [] } } });
  assert.ok(cli);
  assert.equal(renderInvocation(ref, "tool"), "tool inspect");
  assert.throws(() => renderInvocation({ ...ref }, "tool"), /invocation/i);
  for (const executable of ["", "tool\nmalicious", "tool\0suffix", "tool\ud800"]) assert.throws(() => renderInvocation(ref, executable), TypeError);
});

test("invocations encode file alternatives, levels, repeated globals and validation twins", () => {
  const x = parseFixture({ flags: { note: stringFlag({ fileSource: { maxBytes: bytes(20) } }) }, levels: { context: { output: "bounded" }, full: { selectors: ["context", "full"], output: "artifact-eligible" } } }, {}, { tag: stringFlag({ repeatable: true }) });
  const ref = invocation(x.command, { flags: { "note-file": "two words.txt", tag: ["first", "second"] }, level: "full", out: "out.json" });
  assert.deepEqual(ref.flags, { "note-file": "two words.txt", tag: ["first", "second"], context: true, full: true, out: "out.json" });
  const output = shellTokens(renderInvocation(ref, "printf").replace(/^printf /, "printf '%s\\0' "));
  const parsed = leaf(x.parse(output));
  assert.equal(parsed.input.level, "full"); assert.equal(parsed.input.out, "out.json");
  assert.deepEqual(parsed.input.globals.tag, ["first", "second"]);
  const write = parseFixture({ effects: "write", payload: { maxBytes: bytes(30), validatePath: "items validate" } }, { file: "data.json" });
  const validation = validationInvocation(write.command, { file: "data.json" });
  assert.equal(validation.effects, "read"); assert.equal(validation.path, "items validate");
  const tokens = shellTokens(renderInvocation(validation, "printf").replace(/^printf /, "printf '%s\\0' "));
  assert.equal(leaf(write.parse(tokens)).validation, true);
  assert.throws(() => validationInvocation(x.command, {}), /validation/i);
});

test("secret fallbacks permit omission but never embedding secrets", () => {
  const x = parseFixture({ flags: { token: stringFlag({ secret: true, required: true, credential: { env: "TOKEN" } }) } }, {}, { api: stringFlag({ secret: true, credential: { env: "API_TOKEN" } }) });
  const ref = invocation(x.command, {});
  assert.equal(renderInvocation(ref, "tool"), "tool items list");
  for (const flags of [{ token: "secret-value" }, { api: "secret-value" }]) assert.throws(() => invocation(x.command, { flags }), /secret/i);
  const parsed = leaf(x.parse(["items", "list"]));
  assert.deepEqual(parsed.input.credentials, [{ name: "api", env: "API_TOKEN", global: true, required: false }, { name: "token", env: "TOKEN", global: false, required: true }]);
});

test("invocations refuse unknown/mismatched caller fields and control characters", () => {
  const x = parseFixture({ args: [arg("text", { kind: "string" }, { required: false })], flags: { note: stringFlag() } });
  for (const input of [{ extra: true }, { flags: { other: "x" } }, { args: { other: "x" } }, { flags: { note: 3 } }, { args: { text: "line\ncontrol" } }, { flags: { note: "\u001b[31m" } }, { args: { text: "\ud800" } }, { passthrough: [] }, { level: "unknown" }, { file: "file.json" }, { out: "out.json" }]) assert.throws(() => invocation(x.command, input), TypeError);
  assert.throws(() => invocation({ ...x.command }, {}), /command/i);
});

test("passthrough rendering round-trips tokens and refuses ambiguous leading-dash positionals", () => {
  const x = parseFixture({ passthrough: true, args: [arg("name")] }, { args: { name: "one" } });
  const tokens = ["", "--help", "a'b", "$(printf INJECTED)"];
  const ref = invocation(x.command, { args: { name: "one" }, passthrough: tokens });
  const argv = shellTokens(renderInvocation(ref, "printf").replace(/^printf /, "printf '%s\\0' "));
  assert.deepEqual(leaf(x.parse(argv)).input.passthrough, tokens);
  assert.throws(() => invocation(x.command, { args: { name: "--help" } }), /positional|dash/i);
});

test("current-registry membership rejects foreign invocations even when registered elsewhere", async () => {
  const { validateInvocation } = await import("../dist/internal/registry.js");
  const a = parseFixture(); const b = parseFixture();
  const ref = invocation(a.command, {});
  assert.doesNotThrow(() => validateInvocation(cliRegistry(a.cli), ref));
  assert.throws(() => validateInvocation(cliRegistry(b.cli), ref), /member/i);
  assert.throws(() => validateInvocation(cliRegistry(a.cli), { ...ref, path: "doctor" }), /invocation/i);
});

test("local guidance keeps invocation identity while wire references require registry rebinding", async () => {
  const { rebindInvocation, validateInvocation } = await import("../dist/internal/registry.js");
  const { hint } = await import("cli-for-agents/guidance");
  const x = parseFixture({ flags: { token: stringFlag({ secret: true }), mode: valueFlag({ kind: "integer" }, { default: 2 }) } });
  const ref = invocation(x.command, { flags: { mode: 3 } });
  const guidance = hint(ref, "Inspect items");
  assert.equal(renderInvocation(guidance.invocation, "tool"), "tool items list --mode=3");
  const detached = JSON.parse(JSON.stringify(guidance)).invocation;
  assert.throws(() => renderInvocation(detached, "tool"), /invocation/i);
  const rebound = rebindInvocation(cliRegistry(x.cli), detached);
  assert.doesNotThrow(() => validateInvocation(cliRegistry(x.cli), rebound));
  assert.equal(renderInvocation(rebound, "tool"), "tool items list --mode=3");
  for (const invalid of [
    { ...ref, path: "unknown" }, { ...ref, effects: "write" }, { ...ref, flags: { mode: "3" } },
    { ...ref, flags: { token: "secret" } }, { ...ref, flags: { unknown: "value" } }, { ...ref, flags: { help: true } },
  ]) assert.throws(() => rebindInvocation(cliRegistry(x.cli), invalid), TypeError);
});

test("executable rendering treats shell keywords and assignments as literal command names", () => {
  const x = parseFixture(); const ref = invocation(x.command, {});
  assert.equal(renderInvocation(ref, "if"), "'if' items list");
  assert.equal(renderInvocation(ref, "NAME=value"), "'NAME=value' items list");
  assert.equal(renderInvocation(ref, "my tool"), "'my tool' items list");
});

test("detached reference validation covers files, compound selectors and twin membership", async () => {
  const { rebindInvocation } = await import("../dist/internal/registry.js");
  const x = parseFixture({ args: [arg("n", { kind: "integer" })], flags: { text: stringFlag({ fileSource: { maxBytes: bytes(10) } }), tag: stringFlag({ repeatable: true }) }, levels: { full: { selectors: ["context", "full"], output: "artifact-eligible" } } }, { args: { n: 1 } });
  const ref = invocation(x.command, { args: { n: -2 }, flags: { "text-file": "doc.txt", tag: ["a", "b"] }, level: "full", out: "out.json" });
  assert.deepEqual(rebindInvocation(cliRegistry(x.cli), JSON.parse(JSON.stringify(ref))), ref);
  for (const data of [{ ...ref, flags: { full: true } }, { ...ref, flags: { tag: "a" } }, { ...ref, flags: { "text-file": "-", text: "inline" } }, { ...ref, args: ["1.5"] }]) assert.throws(() => rebindInvocation(cliRegistry(x.cli), data), TypeError);
  const y = parseFixture({ effects: "write", payload: { maxBytes: bytes(30), validatePath: "items validate" } }, { file: "data.json" });
  const twin = validationInvocation(y.command, { file: "data.json" });
  assert.deepEqual(rebindInvocation(cliRegistry(y.cli), JSON.parse(JSON.stringify(twin))), twin);
  assert.throws(() => rebindInvocation(cliRegistry(x.cli), twin), /member/i);
});

test("explicit null caller records are not treated as omitted input", () => {
  const x = parseFixture({ passthrough: true });
  for (const input of [{ args: null }, { flags: null }, { passthrough: null }]) assert.throws(() => invocation(x.command, input), TypeError);
});

function doctorFixture(args) {
  const x = fixture();
  const doctor = x.f.defineCommand(spec("inspect", { args }), binding);
  return { ...x, doctor, install: input => {
    const reference = invocation(doctor, input);
    const cli = createCli({ ...x.options, commands: [doctor], doctor: reference });
    return { reference, cli };
  } };
}

test("doctor with an omitted positional before a default keeps both assignments", async () => {
  const { invocationArgv } = await import("../dist/internal/invocations.js");
  const x = doctorFixture([arg("n", { kind: "integer" }, { required: false }), arg("label", { kind: "string" }, { default: "all" })]);
  const { reference, cli } = x.install({});
  const parsed = leaf(resolve(cliRegistry(cli), invocationArgv(reference)));
  assert.deepEqual(parsed.input.args, { label: "all" });
  assert.deepEqual(reference.args, []);
});

test("doctor omitting an argument named constructor emits no inherited value", async () => {
  const { invocationArgv } = await import("../dist/internal/invocations.js");
  const x = doctorFixture([arg("constructor", { kind: "integer" }, { required: false })]);
  const { reference, cli } = x.install({});
  assert.deepEqual(leaf(resolve(cliRegistry(cli), invocationArgv(reference))).input.args, {});
  assert.deepEqual(reference.args, []);
});

for (const variadic of [false, true]) {
  test(`doctor rejects a supplied later ${variadic ? "variadic" : "scalar"} after an omitted positional`, () => {
    const x = doctorFixture([arg("n", { kind: "integer" }, { required: false }), arg("label", { kind: "string" }, { required: false, ...(variadic ? { variadic: true } : {}) })]);
    assert.throws(() => x.install({ args: { label: variadic ? ["all"] : "all" } }), TypeError);
  });
}

test("routing consumes one child segment per token, including offline help", () => {
  const x = fixture();
  const command = x.f.defineCommand(spec("items nested list", { args: [arg("label", { kind: "string" }, { required: false })] }), binding);
  const cli = createCli({ ...x.options, commands: [x.doctor, command], groups: [
    defineGroup({ path: "items", summary: "Items", description: "Items" }),
    defineGroup({ path: "items nested", summary: "Nested", description: "Nested" }),
  ] });
  const parse = argv => resolve(cliRegistry(cli), argv);
  for (const route of [["items nested list"], ["items", "nested list"], ["items nested", "list"]]) {
    for (const suffix of [[], ["--help"], ["--version"], ["--help", "--json"]]) assert.equal(parse([...route, ...suffix]).kind, "invalid", JSON.stringify([...route, ...suffix]));
  }
  assert.equal(parse(["items", "nested", "list", "--help"]).kind, "offline");
  assert.equal(leaf(parse(["items", "nested", "list", "two words"])).input.args.label, "two words");
});

for (const variant of ["read", "write", "validation"]) {
  test(`${variant} references and rebinding preserve omitted/defaulted positional assignments`, async () => {
    const { invocationArgv } = await import("../dist/internal/invocations.js");
    const { rebindInvocation } = await import("../dist/internal/registry.js");
    const extra = variant === "read" ? {} : { effects: "write", ...(variant === "validation" ? { payload: { maxBytes: bytes(100), validatePath: "items validate" } } : {}) };
    const payload = variant === "validation" ? { file: "data.json" } : {};
    const x = parseFixture({ ...extra, args: [arg("n", { kind: "integer" }, { required: false }), arg("label", { kind: "string" }, { default: "all" })] }, payload);
    const construct = variant === "validation" ? validationInvocation : invocation;
    const ref = construct(x.command, payload);
    assert.deepEqual(ref.args, []);
    const rebound = rebindInvocation(cliRegistry(x.cli), JSON.parse(JSON.stringify(ref)));
    assert.deepEqual(rebound.args, []);
    for (const value of [ref, rebound]) assert.deepEqual(leaf(x.parse(invocationArgv(value))).input.args, { label: "all" });
    assert.throws(() => construct(x.command, { ...payload, args: { label: "chosen" } }), /positional/i);
    const supplied = construct(x.command, { ...payload, args: { n: 2, label: "chosen" } });
    assert.deepEqual(leaf(x.parse(invocationArgv(supplied))).input.args, { n: 2, label: "chosen" });
  });

  test(`${variant} references reject same-kind positional shifts into omitted slots`, () => {
    const extra = variant === "read" ? {} : { effects: "write", ...(variant === "validation" ? { payload: { maxBytes: bytes(100), validatePath: "items validate" } } : {}) };
    const payload = variant === "validation" ? { file: "data.json" } : {};
    const x = parseFixture({ ...extra, args: [arg("first", { kind: "string" }, { required: false }), arg("second", { kind: "string" }, { required: false }), arg("rest", { kind: "string" }, { variadic: true, required: false })] }, payload);
    const construct = variant === "validation" ? validationInvocation : invocation;
    for (const args of [{ second: "shift" }, { rest: ["shift"] }, { first: "one", rest: ["shift"] }]) assert.throws(() => construct(x.command, { ...payload, args }), /positional/i);
    assert.deepEqual(construct(x.command, { ...payload, args: { first: "one", second: "two", rest: ["three"] } }).args, ["one", "two", "three"]);
  });
}

test("rebinding ignores inherited constructor and preserves an explicitly supplied one", async () => {
  const { rebindInvocation } = await import("../dist/internal/registry.js");
  const x = parseFixture({ args: [arg("constructor", { kind: "integer" }, { required: false })] });
  for (const args of [[], ["2"]]) {
    const rebound = rebindInvocation(cliRegistry(x.cli), { path: "items list", effects: "read", args, flags: {} });
    assert.deepEqual(rebound.args, args);
  }
});

test("detached passthrough arguments cannot become flags, offline options or delimiters", async () => {
  const { rebindInvocation } = await import("../dist/internal/registry.js");
  const x = parseFixture({ passthrough: true, args: [arg("name", { kind: "string" }, { required: false })], flags: { mode: valueFlag({ kind: "integer" }) } });
  for (const args of [["--mode=3"], ["--json=true"], ["--help"], ["--", "extra"], ["name", "--mode=3"]]) {
    assert.throws(() => rebindInvocation(cliRegistry(x.cli), { path: "items list", effects: "read", args, flags: {} }), TypeError, JSON.stringify(args));
  }
  for (const args of [[], ["two words"], ["-3"], ["-"]]) {
    const ref = { path: "items list", effects: "read", args, flags: { mode: 3 }, passthrough: ["--mode=4", "--", ""] };
    assert.deepEqual(rebindInvocation(cliRegistry(x.cli), ref), ref);
  }
});
