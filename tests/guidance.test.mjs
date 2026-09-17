import assert from "node:assert/strict";
import test from "node:test";
import { commandsFor, defineErrors, invocation } from "cli-for-agents";
import { createCli } from "cli-for-agents/runtime";
import { hint, instruction, defineReminderRule, defineSteering, evaluateGuidance } from "cli-for-agents/guidance";

function fixture() {
  const family = commandsFor()({ errors: defineErrors({}), globalFlags: {} });
  const command = path => family.defineCommand({ path, summary: path, description: `Run ${path}`,
    requires: "none", effects: "read", args: [], flags: {} }, {
    examples: [{ why: "Inspect state" }], handler: async () => { throw new Error("Must stay lazy"); },
  });
  const doctor = command("doctor");
  const other = command("other");
  createCli({ name: "test", version: "1", family, commands: [doctor, other], contexts: {},
    doctor: invocation(doctor, {}), output: { artifacts: { directory: "/unused" } } });
  return { doctor, other, command };
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
  const { doctor, other } = fixture();
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

const evaluate = (command, rules, extra = {}) => evaluateGuidance({ command, state: { active: true }, rules, eventSink() {}, ...extra });
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
  assert.deepEqual(await evaluateGuidance({ command: doctor, state: null }),
    { commandPath: "doctor", candidates: [], firings: [], issues: [] });
});

test("evaluation admission rejects handler guidance, missing sinks, duplicate or forged rules and foreign family scopes before callbacks", async () => {
  const { doctor } = fixture();
  let calls = 0;
  const rule = defineReminderRule(reminder(doctor, { when() { calls++; return false; } }));
  for (const extra of [{ handler: {} }, { handler: undefined }, { eventSink: undefined },
    { command: { ...doctor } }, { rules: [rule, rule] }, { rules: [{ id: "raw", appliesTo: [doctor] }] },
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
  assert.throws(() => batch.candidates[0].provenance.ruleId = "changed", TypeError);
});

function fillSerialized(build, limit, token) {
  let text = token;
  while (Buffer.byteLength(JSON.stringify(build(text + token))) <= limit) text += token;
  while (Buffer.byteLength(JSON.stringify(build(text + "x"))) < limit) text += "x";
  if (Buffer.byteLength(JSON.stringify(build(text))) < limit) text += "x";
  assert.equal(Buffer.byteLength(JSON.stringify(build(text))), limit);
  return text;
}

test("local evaluation enforces exact serialized Unicode instruction/reminder thresholds", async () => {
  const { doctor } = fixture();
  for (const token of ["x", "é", "😀", '"', "\\"]) {
    const instructionText = fillSerialized(text => ({ ownerId: "lease", text }), 1024, token);
    const rule = defineSteering(steering(doctor, { render: () => ({ ownerId: "lease", text: instructionText }) }));
    assert.equal((await evaluate(doctor, [rule])).candidates[0].value.text, instructionText);
    await assert.rejects(evaluate(doctor, [defineSteering(steering(doctor, {
      render: () => ({ ownerId: "lease", text: instructionText + "x" }),
    }))]), /byte limit/i);

    const reminderText = fillSerialized(text => [{ ruleId: "keep", text }], 1024, token);
    const keep = defineReminderRule(reminder(doctor, { id: "keep", text: () => reminderText }));
    assert.equal((await evaluate(doctor, [keep])).candidates[0].value.text, reminderText);
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
  const batch = await evaluate(doctor, rules, { eventSink: event => {
    seen.push(event.ruleId);
    if (event.ruleId !== "stop.2") throw new Error("Unavailable");
  } });
  assert.deepEqual(seen, ["stop.1", "stop.2", "stop.3"]);
  assert.equal(batch.candidates.length, 3);
  assert.deepEqual(batch.issues.map(i => i.path), [["rules", "stop.1"], ["rules", "stop.3"]]);
});
