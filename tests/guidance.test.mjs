import assert from "node:assert/strict";
import test from "node:test";
import { commandsFor, defineErrors, invocation } from "cli-for-agents";
import { createCli } from "cli-for-agents/runtime";
import { hint, instruction, defineReminderRule, defineSteering, evaluateGuidance, decodeEvaluatedGuidance } from "cli-for-agents/guidance";
import { checkRuleReferences, cliRegistry } from "../dist/internal/registry.js";

function fixture() {
  const family = commandsFor()({ errors: defineErrors({}), globalFlags: {} });
  const command = path => family.defineCommand({ path, summary: path, description: `Run ${path}`,
    requires: "none", effects: "read", args: [], flags: {} }, {
    examples: [{ why: "Inspect state" }], handler: async () => { throw new Error("Must stay lazy"); },
  });
  const doctor = command("doctor");
  const other = command("other");
  const cli = createCli({ name: "test", version: "1", family, commands: [doctor, other], contexts: {},
    doctor: invocation(doctor, {}), output: { artifacts: { directory: "/unused" } } });
  return { doctor, other, command, registry: cliRegistry(cli) };
}
const reminder = (command, extra = {}) => ({ id: "lease.active", appliesTo: [command],
  when: state => state.active, priority: 1, text: () => "Keep the lease valid.", ...extra });
const steering = (command, extra = {}) => ({ id: "protocol.stop", appliesTo: [command],
  when: state => state.active, tier: "instruction", render: () => instruction("lease", "Stop now."), ...extra });

test("constructors keep advice, required protocol and state-dependent reminder rules distinct", () => {
  const { doctor } = fixture();
  const advice = hint(invocation(doctor, {}), "Inspect state");
  const required = instruction("lease", "Stop now.");
  const keep = defineReminderRule(reminder(doctor));
  const stop = defineSteering(steering(doctor));
  const next = defineSteering(steering(doctor, { id: "inspect", tier: "hint", render: () => advice }));
  assert.equal(keep.tier, "reminder");
  assert.equal(keep.id, "lease.active");
  assert.equal(keep.when({ active: false }), false);
  assert.equal(typeof keep.text, "function");
  assert.equal(Object.hasOwn(keep, "ruleId"), false);
  assert.deepEqual(stop.render({ active: true }), required);
  assert.deepEqual(next.render({ active: true }), advice);
  assert.equal(Object.hasOwn(advice, "text"), false);
  assert.equal(Object.hasOwn(required, "invocation"), false);
  assert.equal(Object.hasOwn(keep, "evidence"), false);
});

test("admission is lazy and retains immutable command identities and optional evidence", () => {
  const { doctor, other, registry } = fixture();
  let calls = 0;
  const definition = reminder(doctor, { appliesTo: [doctor, other], evidence: "Lease state is active.",
    when() { calls++; return true; }, text() { calls++; return "Keep lease valid."; } });
  const rule = defineReminderRule(definition);
  definition.id = "changed";
  definition.appliesTo.pop();
  assert.equal(calls, 0);
  assert.equal(rule.id, "lease.active");
  assert.equal(rule.evidence, "Lease state is active.");
  assert.deepEqual(rule.appliesTo, [doctor, other]);
  assert.equal(rule.appliesTo[0], doctor);
  assert.throws(() => rule.appliesTo.pop(), TypeError);
  assert.throws(() => rule.priority = 2, TypeError);
  assert.doesNotThrow(() => checkRuleReferences(registry, [rule]));
  assert.throws(() => checkRuleReferences(registry, [rule, rule]), /duplicate/i);
  assert.throws(() => checkRuleReferences(registry, [defineReminderRule(reminder(fixture().doctor))]), /member|foreign/i);
});

// Hostile JavaScript definitions exercise runtime admission, without type casts.
test("rule admission rejects malformed IDs, scopes, callbacks, priorities, evidence and tiers", () => {
  const { doctor, other } = fixture();
  for (const extra of [ { id: "" }, { id: "two words" }, { id: "x".repeat(511) },
    { appliesTo: [] }, { appliesTo: [doctor, doctor] }, { appliesTo: [{ ...doctor }] },
    { appliesTo: [doctor, fixture().doctor] }, { appliesTo: Array(1) },
    { when: true }, { when: async () => true }, { when: function* () { yield true; } },
    { text: "Keep valid" }, { text: async () => "Keep valid" },
    { priority: NaN }, { priority: Infinity }, { priority: "1" },
    { evidence: "" }, { evidence: "x".repeat(511) }, { evidence: undefined }, { tier: "reminder" }, { extra: true } ]) {
    assert.throws(() => defineReminderRule(reminder(doctor, extra)), TypeError);
  }
  for (const extra of [ { tier: "reminder" }, { tier: "unknown" }, { render: "Stop" },
    { render: async () => instruction("lease", "Stop") }, { priority: 1 }, { evidence: "Proof" } ]) {
    assert.throws(() => defineSteering(steering(doctor, extra)), TypeError);
  }
  for (const bad of [null, [], {}, 1]) {
    assert.throws(() => defineReminderRule(bad), TypeError);
    assert.throws(() => defineSteering(bad), TypeError);
  }
  assert.doesNotThrow(() => defineReminderRule(reminder(other, { priority: -1.5 })));
});

test("rule definitions reject accessors without calling them and capture descriptor facts once", () => {
  const { doctor } = fixture();
  let calls = 0;
  const definition = reminder(doctor);
  Object.defineProperty(definition, "when", { enumerable: true, get() { calls++; return () => true; } });
  assert.throws(() => defineReminderRule(definition), TypeError);
  assert.equal(calls, 0);
  const proxy = new Proxy(reminder(doctor), { get(target, key) { return key === "id" ? "bad id" : target[key]; } });
  assert.equal(defineReminderRule(proxy).id, "lease.active");
});

const evaluate = (command, rules, extra = {}) => evaluateGuidance({ command, authority: "server", state: { active: true }, rules, eventSink() {}, ...extra });
const transport = (extra = {}) => ({ authority: "server", commandPath: "doctor", candidates: [{
  tier: "instruction", value: { ownerId: "lease", text: "Stop now." },
  provenance: { authority: "server", commandPath: "doctor", ruleId: "protocol.stop" },
}], firings: [{ type: "guidance.rule_fired", commandPath: "doctor", ruleId: "protocol.stop", tier: "instruction" }], issues: [], ...extra });

test("evaluation keeps conflicting instructions, hints and more than two reminders for the sole downstream arbiter", async () => {
  const { doctor } = fixture();
  const rules = [
    defineSteering(steering(doctor)),
    defineSteering(steering(doctor, { id: "protocol.continue", render: () => instruction("lease", "Continue now.") })),
    defineSteering(steering(doctor, { id: "advice", tier: "hint", render: () => hint(invocation(doctor, {}), "Inspect") })),
    ...[1, 2, 3].map(n => defineReminderRule(reminder(doctor, { id: `keep.${n}`, priority: n,
      ...(n === 1 ? { evidence: "Observed lease expiration." } : {}) }))),
  ];
  const events = [];
  const batch = await evaluate(doctor, rules, { eventSink: event => { events.push(event); } });
  assert.equal(batch.candidates.length, 6);
  assert.deepEqual(batch.candidates.map(c => c.tier), ["instruction", "instruction", "hint", "reminder", "reminder", "reminder"]);
  assert.deepEqual(batch.candidates.map(c => c.provenance.ruleId), rules.map(r => r.id));
  assert.deepEqual(events, batch.firings);
  assert.equal(events.every(e => e.type === "guidance.rule_fired" && e.commandPath === "doctor"), true);
  assert.equal(batch.candidates[3].provenance.evidence, "Observed lease expiration.");
  assert.equal(batch.candidates[3].value.ruleId, "keep.1");
  assert.equal(batch.candidates[3].priority, 1);
  assert.deepEqual(batch.issues, []);
  assert.deepEqual(decodeEvaluatedGuidance(JSON.parse(JSON.stringify(batch))), batch);
  assert.equal(Object.hasOwn(batch, "guidance"), false);
});

test("scope and exact predicate boundaries prevent inactive rendering and firing", async () => {
  const { doctor, other } = fixture();
  let renders = 0;
  const rule = defineReminderRule(reminder(doctor, { when: s => s.remaining <= 2, text() { renders++; return "Keep the lease valid."; } }));
  const foreignScope = defineReminderRule(reminder(other, { id: "elsewhere", when() { throw new Error("Wrong scope"); } }));
  for (const remaining of [3, 2, 1]) {
    const events = [];
    const batch = await evaluate(doctor, [rule, foreignScope], { state: { remaining }, eventSink: e => { events.push(e); } });
    assert.equal(batch.candidates.length, remaining <= 2 ? 1 : 0);
    assert.equal(events.length, batch.candidates.length);
  }
  assert.equal(renders, 2);
  assert.deepEqual(await evaluateGuidance({ command: doctor, authority: "local", state: null }),
    { authority: "local", commandPath: "doctor", candidates: [], firings: [], issues: [] });
});

test("evaluation admission rejects handler guidance, missing sinks, duplicate or forged rules and foreign family scopes before callbacks", async () => {
  const { doctor } = fixture();
  let calls = 0;
  const rule = defineReminderRule(reminder(doctor, { when() { calls++; return false; } }));
  for (const extra of [{ handler: {} }, { handler: undefined }, { eventSink: undefined }, { authority: "bad authority" },
    { command: { ...doctor } }, { rules: [rule, rule] }, { rules: [{ ...rule }] },
    { rules: [rule, defineReminderRule(reminder(fixture().doctor, { id: "foreign" }))] },
    { rules: null }, { eventSink: true }, { extra: true }]) {
    await assert.rejects(evaluate(doctor, [rule], extra), TypeError);
  }
  assert.equal(calls, 0);
});

test("evaluation validates actual synchronous predicate/render returns and mandatory text", async () => {
  const { doctor } = fixture();
  for (const result of [undefined, null, 1, "true", Promise.resolve(true), { then() {} }]) {
    await assert.rejects(evaluate(doctor, [defineReminderRule(reminder(doctor, { when: () => result }))]), TypeError);
  }
  for (const result of ["", "x".repeat(1024), "bad\ntext", Promise.resolve("Keep valid.")]) {
    await assert.rejects(evaluate(doctor, [defineReminderRule(reminder(doctor, { text: () => result }))]), TypeError);
  }
  for (const result of [hint(invocation(doctor, {}), "Inspect"), { ownerId: "lease", text: "Stop", extra: true },
    { ownerId: "lease", text: "x".repeat(1024) }, Promise.resolve(instruction("lease", "Stop"))]) {
    await assert.rejects(evaluate(doctor, [defineSteering(steering(doctor, { render: () => result }))]), TypeError);
  }
});

test("synchronous and asynchronous sink failures retain required candidates and attributable diagnostics", async () => {
  const { doctor } = fixture();
  for (const eventSink of [() => { throw new Error("private sink detail"); }, async () => { throw new Error("private sink detail"); }]) {
    const batch = await evaluate(doctor, [defineSteering(steering(doctor))], { eventSink });
    assert.equal(batch.candidates[0].value.text, "Stop now.");
    assert.equal(batch.firings.length, 1);
    assert.equal(batch.issues[0].code, "KERNEL_GUIDANCE");
    assert.deepEqual(batch.issues[0].path, ["rules", "protocol.stop"]);
    assert.match(batch.issues[0].message, /sink/i);
    assert.equal(JSON.stringify(batch).includes("private sink detail"), false);
    assert.deepEqual(decodeEvaluatedGuidance(batch), batch);
  }
});

test("evaluation computes detached candidates before sink side effects and awaits sink settlement", async () => {
  const { doctor } = fixture();
  const state = { active: true };
  const rules = [1, 2].map(n => defineSteering(steering(doctor, { id: `stop.${n}` })));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let settled = false;
  const pending = evaluate(doctor, rules, { state, eventSink: async event => {
    state.active = false;
    assert.throws(() => event.ruleId = "changed", TypeError);
    await gate;
  } }).then(value => { settled = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  release();
  const batch = await pending;
  assert.equal(batch.candidates.length, 2);
  assert.equal(batch.firings.length, 2);
  assert.throws(() => batch.candidates.pop(), TypeError);
  assert.throws(() => batch.candidates[0].provenance.authority = "forged", TypeError);
});

test("authoritative decode preserves conflicting values, provenance, priorities, optional evidence and diagnostics", () => {
  const input = transport();
  input.candidates.push({ tier: "reminder", priority: -1.5, value: { ruleId: "keep", text: "Keep the lease valid." },
    provenance: { authority: "server", commandPath: "doctor", ruleId: "keep", evidence: "Incident 1" } });
  input.firings.push({ type: "guidance.rule_fired", commandPath: "doctor", ruleId: "keep", tier: "reminder" });
  input.issues.push({ code: "KERNEL_GUIDANCE", message: "Firing sink failed.", path: ["rules", 0] });
  const batch = decodeEvaluatedGuidance(input);
  assert.deepEqual(batch, input);
  input.candidates[0].value.text = "Changed";
  assert.equal(batch.candidates[0].value.text, "Stop now.");
  assert.throws(() => batch.issues.push({}), TypeError);
});

// These hostile transport fixtures are plain untyped ingress, not claims of authenticity.
for (const [name, mutate] of [
  ["missing authority", x => { delete x.authority; }],
  ["invalid authority", x => { x.authority = " "; }],
  ["malformed path", x => { x.commandPath = "doctor  bad"; }],
  ["unsupported tier", x => { x.candidates[0].tier = "warning"; }],
  ["missing provenance", x => { delete x.candidates[0].provenance; }],
  ["authority mismatch", x => { x.candidates[0].provenance.authority = "local"; }],
  ["command mismatch", x => { x.candidates[0].provenance.commandPath = "other"; }],
  ["invalid rule ID", x => { x.candidates[0].provenance.ruleId = "bad id"; }],
  ["oversized evidence", x => { x.candidates[0].provenance.evidence = "x".repeat(511); }],
  ["missing firing", x => { x.firings = []; }],
  ["unsupported event", x => { x.firings[0].type = "guidance.conflict"; }],
  ["wrong event tier", x => { x.firings[0].tier = "hint"; }],
  ["wrong event ID", x => { x.firings[0].ruleId = "another"; }],
  ["wrong event path", x => { x.firings[0].commandPath = "other"; }],
  ["duplicate candidate ID", x => { x.candidates.push(structuredClone(x.candidates[0])); x.firings.push(structuredClone(x.firings[0])); }],
  ["extra firing", x => { x.firings.push({ ...x.firings[0], ruleId: "another" }); }],
  ["tier value mismatch", x => { x.candidates[0].value = { action: "Inspect", invocation: { path: "doctor", effects: "read", args: [], flags: {} } }; }],
  ["oversized instruction", x => { x.candidates[0].value.text = "é".repeat(512); }],
  ["invalid instruction owner", x => { x.candidates[0].value.ownerId = "two owners"; }],
  ["extra candidate field", x => { x.candidates[0].priority = 1; }],
  ["extra root field", x => { x.handler = {}; }],
  ["invalid diagnostic", x => { x.issues = [{ code: "X", message: "" }]; }],
  ["oversized diagnostic", x => { x.issues = [{ code: "X", message: "x".repeat(511) }]; }],
  ["invalid diagnostic path", x => { x.issues = [{ code: "X", message: "No", path: [-1] }]; }],
  ["sparse candidates", x => { x.candidates = Array(1); }],
]) {
  test(`authoritative decode rejects ${name}`, () => {
    const value = transport(); mutate(value);
    assert.throws(() => decodeEvaluatedGuidance(value), TypeError);
  });
}

test("reminder and hint ingress rejects mismatched IDs, nonfinite priorities and malformed invocations", () => {
  const reminderBatch = () => transport({ candidates: [{ tier: "reminder", priority: 1,
    provenance: { authority: "server", commandPath: "doctor", ruleId: "keep" }, value: { ruleId: "keep", text: "Keep valid." } }],
    firings: [{ type: "guidance.rule_fired", commandPath: "doctor", ruleId: "keep", tier: "reminder" }] });
  for (const mutate of [x => { x.candidates[0].value.ruleId = "other"; }, x => { x.candidates[0].priority = Infinity; },
    x => { x.candidates[0].value.text = "x".repeat(1024); }, x => { x.candidates[0].value.text = "bad\ntext"; }]) {
    const x = reminderBatch(); mutate(x); assert.throws(() => decodeEvaluatedGuidance(x), TypeError);
  }
  const { doctor } = fixture();
  const hintBatch = transport({ candidates: [{ tier: "hint", provenance: { authority: "server", commandPath: "doctor", ruleId: "next" },
    value: hint(invocation(doctor, {}), "Inspect") }], firings: [{ type: "guidance.rule_fired", commandPath: "doctor", ruleId: "next", tier: "hint" }] });
  assert.deepEqual(decodeEvaluatedGuidance(hintBatch), hintBatch);
  for (const mutate of [x => { x.candidates[0].value.action = "x".repeat(511); },
    x => { x.candidates[0].value.invocation.args = ["x".repeat(1024)]; },
    x => { x.candidates[0].value.invocation.effects = "job"; }]) {
    const x = structuredClone(hintBatch); mutate(x); assert.throws(() => decodeEvaluatedGuidance(x), TypeError);
  }
});

test("decoder uses captured descriptor facts, rejects getters and never invokes transport serialization hooks", () => {
  let hooks = 0;
  const input = transport();
  const proxy = new Proxy(input, { get(target, key) {
    if (key === "toJSON") return () => { hooks++; return transport({ authority: "forged" }); };
    return key === "authority" ? "forged" : target[key];
  } });
  assert.deepEqual(decodeEvaluatedGuidance(proxy), input);
  assert.equal(hooks, 0);
  const getter = transport();
  Object.defineProperty(getter.candidates[0].value, "text", { enumerable: true, get() { hooks++; return "Stop"; } });
  assert.throws(() => decodeEvaluatedGuidance(getter), TypeError);
  assert.equal(hooks, 0);
});

function fillSerialized(build, limit, token) {
  let text = token;
  while (Buffer.byteLength(JSON.stringify(build(text + token))) <= limit) text += token;
  while (Buffer.byteLength(JSON.stringify(build(text + "x"))) < limit) text += "x";
  if (Buffer.byteLength(JSON.stringify(build(text))) < limit) text += "x";
  assert.equal(Buffer.byteLength(JSON.stringify(build(text))), limit);
  return text;
}

test("local evaluation and authoritative ingress enforce exact serialized Unicode instruction/reminder thresholds", async () => {
  const { doctor } = fixture();
  for (const token of ["x", "é", "😀", '"', "\\"]) {
    const instructionText = fillSerialized(text => ({ ownerId: "lease", text }), 1024, token);
    const instructionBatch = transport();
    instructionBatch.candidates[0].value.text = instructionText;
    assert.equal(decodeEvaluatedGuidance(instructionBatch).candidates[0].value.text, instructionText);
    const rule = defineSteering(steering(doctor, { render: () => ({ ownerId: "lease", text: instructionText }) }));
    assert.equal((await evaluate(doctor, [rule])).candidates[0].value.text, instructionText);
    instructionBatch.candidates[0].value.text += "x";
    assert.throws(() => decodeEvaluatedGuidance(instructionBatch), /byte limit/i);
    await assert.rejects(evaluate(doctor, [defineSteering(steering(doctor, {
      render: () => instructionBatch.candidates[0].value,
    }))]), /byte limit/i);

    const reminderText = fillSerialized(text => [{ ruleId: "keep", text }], 1024, token);
    const keep = defineReminderRule(reminder(doctor, { id: "keep", text: () => reminderText }));
    const batch = await evaluate(doctor, [keep]);
    assert.equal(decodeEvaluatedGuidance(batch).candidates[0].value.text, reminderText);
    const overflow = structuredClone(batch);
    overflow.candidates[0].value.text += "x";
    assert.throws(() => decodeEvaluatedGuidance(overflow), /byte limit/i);
    await assert.rejects(evaluate(doctor, [defineReminderRule(reminder(doctor, {
      id: "keep", text: () => reminderText + "x",
    }))]), /byte limit/i);
  }
  // Combined candidate size is intentionally uncapped; selection owns that budget.
  const text = "é".repeat(300);
  const rules = ["keep.a", "keep.b"].map(id => defineReminderRule(reminder(doctor, { id, text: () => text })));
  assert.equal((await evaluate(doctor, rules)).candidates.length, 2);
});

test("rule callback exceptions and rejected promises become bounded contract failures", async () => {
  const { doctor } = fixture();
  const secret = "private rule detail";
  for (const extra of [
    { when() { throw new Error(secret); } },
    { when() { return Promise.reject(new Error(secret)); } },
    { text() { throw new Error(secret); } },
    { text() { return Promise.reject(new Error(secret)); } },
  ]) {
    await assert.rejects(evaluate(doctor, [defineReminderRule(reminder(doctor, extra))]), error =>
      error instanceof TypeError && !error.message.includes(secret) && error.message.length < 512);
  }
});

test("one failed firing sink does not skip subsequent firings or lose source attribution", async () => {
  const { doctor } = fixture();
  const rules = [1, 2, 3].map(n => defineSteering(steering(doctor, { id: `stop.${n}` })));
  const seen = [];
  const batch = await evaluate(doctor, rules, { authority: "remote-service", eventSink: event => {
    seen.push(event.ruleId);
    if (event.ruleId !== "stop.2") throw new Error("Unavailable");
  } });
  assert.deepEqual(seen, ["stop.1", "stop.2", "stop.3"]);
  assert.equal(batch.authority, "remote-service");
  assert.equal(batch.candidates.length, 3);
  assert.deepEqual(batch.issues.map(i => i.path), [["rules", "stop.1"], ["rules", "stop.3"]]);
});

test("decoder rejects non-JSON batches and inconsistent events while preserving declared event order", () => {
  for (const value of [null, [], undefined, 1, new Date(), { ...transport(), toJSON() { return transport(); } }]) {
    assert.throws(() => decodeEvaluatedGuidance(value), TypeError);
  }
  const input = transport();
  input.candidates.push({ ...input.candidates[0], provenance: { ...input.candidates[0].provenance, ruleId: "second" },
    value: { ownerId: "lease", text: "Continue now." } });
  input.firings.unshift({ ...input.firings[0], ruleId: "second" });
  assert.deepEqual(decodeEvaluatedGuidance(input), input);
  input.firings[1].ruleId = "second";
  assert.throws(() => decodeEvaluatedGuidance(input), TypeError);
});
