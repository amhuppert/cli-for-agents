import assert from "node:assert/strict";
import test from "node:test";
import { defineErrors, kernelErrors, protocolLimits, recoveryFacts } from "cli-for-agents";
import { hint, instruction } from "cli-for-agents/guidance";
import { assertJsonValue, serializedJson, assertSerializedLimit, assertInvocation, frozenJson } from "../dist/internal/validation.js";

const definitions = {
  DENIED: { exitClass: "failed", description: "The record is locked." },
  INVALID: { exitClass: "usage", description: "The request is invalid." },
  OFFLINE: { exitClass: "connection", description: "The service is unavailable." },
  OLD: { exitClass: "version", description: "The client is outdated." },
};
// Hostile/untyped invocation fixtures test shape only. Registry owns membership/credentials.
const read = { path: "service doctor", effects: "read", args: [], flags: {} };

test("catalog maps codes/classes, defaults rationale, and permits contextual rationale", () => {
  const catalog = defineErrors(definitions);
  for (const [code, definition] of Object.entries(definitions)) {
    assert.deepEqual(catalog.error(code, { message: "Unavailable" }), {
      code, exitClass: definition.exitClass, message: "Unavailable", why: definition.description,
    });
  }
  assert.equal(catalog.error("DENIED", { message: "Locked", why: "An active lease owns this record." }).why,
    "An active lease owns this record.");
  assert.deepEqual(defineErrors({}).definitions, {});
  const error = catalog.error("OFFLINE", { message: "Offline", continuation: read,
    issues: [{ code: "DNS", message: "Name lookup failed", path: ["host", 0] }], details: { retryable: true } });
  assert.deepEqual(error.continuation, read);
  assert.equal(Object.hasOwn(error, "doctor"), false);
  assert.equal(Object.hasOwn(error, "recovery"), false);
});

test("catalog rejects invalid definitions and reserved kernel collisions at the JavaScript boundary", () => {
  for (const code of Object.keys(kernelErrors)) {
    assert.throws(() => defineErrors({ [code]: definitions.DENIED }), TypeError);
  }
  for (const value of [null, [], 1, { BAD: null }, { BAD: { exitClass: "other", description: "No" } },
    { BAD: { exitClass: "failed", description: "" } }, { "bad code": definitions.DENIED },
    { BAD: { ...definitions.DENIED, extra: true } }, { BAD: { ...definitions.DENIED, description: "x".repeat(511) } }]) {
    assert.throws(() => defineErrors(value), TypeError);
  }
  assert.equal(defineErrors({ denied: definitions.DENIED }).error("denied", { message: "No" }).code, "denied");
});

test("catalog errors reject foreign codes, invalid fields and misplaced recovery/doctor", () => {
  const catalog = defineErrors(definitions);
  for (const code of ["MISSING", "toString", "__proto__", "KERNEL_INPUT", null]) {
    assert.throws(() => catalog.error(code, { message: "No" }), TypeError);
  }
  for (const options of [null, {}, { message: "" }, { message: "No", why: "" },
    { message: "No", exitClass: "version" }, { message: "No", code: "FOREIGN" },
    { message: "No", recovery: {} }, { message: "No", doctor: read },
    { message: "No", details: { bad: NaN } }, { message: "No", issues: [{ code: "BAD", message: "" }] },
    { message: "No", issues: [{ code: "BAD", message: "No", path: [-1] }] },
    { message: "No", continuation: { ...read, effects: "write" } },
    { message: "x".repeat(511) }, { message: "No", why: "x".repeat(511) }]) {
    assert.throws(() => catalog.error("DENIED", options), TypeError);
  }
});

test("checked catalog and error facts are detached and deeply immutable", () => {
  const input = structuredClone(definitions);
  const catalog = defineErrors(input);
  input.DENIED.exitClass = "usage";
  const details = { nested: [1] };
  const error = catalog.error("DENIED", { message: "No", details });
  details.nested.push(2);
  assert.equal(error.exitClass, "failed");
  assert.deepEqual(error.details, { nested: [1] });
  assert.throws(() => catalog.definitions.DENIED.exitClass = "usage", TypeError);
  assert.throws(() => error.details.nested.push(2), TypeError);
  assert.throws(() => kernelErrors.KERNEL_INPUT.exitClass = "failed", TypeError);
  assert.throws(() => protocolLimits.recovery = 999999, TypeError);
});

test("JSON accepts finite plain DTOs, null-prototype records and shared noncyclic children", () => {
  const shared = { value: 1 };
  for (const value of [null, true, 1.25, Number.MAX_VALUE, "\n\ud800", [], {},
    Object.assign(Object.create(null), { x: 1 }), { a: shared, b: shared }, [false, { nested: ["é"] }],
    JSON.parse('{"__proto__":{"kept":true},"toJSON":"data","constructor":"field"}')]) {
    assert.doesNotThrow(() => assertJsonValue(value));
    assert.equal(serializedJson(value), JSON.stringify(value));
  }
});

test("JSON rejects data that would otherwise serialize silently as something else", () => {
  const cycle = {}; cycle.self = cycle;
  const decorated = Object.assign([], { extra: 1 });
  for (const value of [undefined, NaN, Infinity, -Infinity, 1n, Symbol("x"), () => 1,
    new Date(), new Map(), new Set(), new Uint8Array([1]), new Number(1), /x/, cycle,
    { nested: [undefined] }, { x: NaN }, { f() {} }, Array(1), decorated, Object.create({ inherited: 1 })]) {
    assert.throws(() => assertJsonValue(value), TypeError);
    assert.throws(() => serializedJson(value), TypeError);
  }
});

for (const name of ["instruction", "reminders", "recovery", "references", "manifest", "diagnosticSummary"]) {
  test(`${name} limit counts serialized UTF-8 including escapes and rejects overflow`, () => {
    const limit = protocolLimits[name];
    for (const unit of ["x", "é", "😀", '"', "\\"]) {
      const unitBytes = Buffer.byteLength(JSON.stringify(unit)) - 2;
      const length = Math.floor((limit - 2) / unitBytes);
      const value = unit.repeat(length) + "x".repeat(limit - 2 - length * unitBytes);
      assert.equal(Buffer.byteLength(JSON.stringify(value)), limit);
      assert.doesNotThrow(() => assertSerializedLimit(value, limit));
      assert.throws(() => assertSerializedLimit(value + "x", limit), TypeError);
    }
  });
}

test("recovery validates full serialized facts and preserves only supplied references", () => {
  const refs = [{ kind: "receipt", id: "r1" }];
  const facts = recoveryFacts(refs);
  assert.deepEqual(facts, { kind: "reported", references: refs });
  refs[0].id = "changed";
  assert.equal(facts.references[0].id, "r1");
  assert.throws(() => facts.references.push({ kind: "fake", id: "2" }), TypeError);
  const overhead = Buffer.byteLength(JSON.stringify({ kind: "reported", references: [{ kind: "r", id: "" }] }));
  const id = "x".repeat(protocolLimits.recovery - overhead);
  assert.equal(Buffer.byteLength(JSON.stringify(recoveryFacts([{ kind: "r", id }]))), 1024);
  assert.throws(() => recoveryFacts([{ kind: "r", id: id + "x" }]), TypeError);
  for (const value of [[], null, [{ kind: "", id: "1" }], [{ kind: "r", id: "" }],
    [{ kind: "r", id: 1 }], [{ kind: "r", id: "a\n" }], [{ kind: "r", id: "1", extra: true }]]) {
    assert.throws(() => recoveryFacts(value), TypeError);
  }
});

test("instruction constructor enforces owned, immutable serialized protocol", () => {
  const overhead = Buffer.byteLength(JSON.stringify({ ownerId: "policy", text: "" }));
  const text = "x".repeat(protocolLimits.instruction - overhead);
  const result = instruction("policy", text);
  assert.deepEqual(result, { ownerId: "policy", text });
  assert.throws(() => result.text = "changed", TypeError);
  assert.throws(() => instruction("policy", text + "x"), TypeError);
  for (const [owner, text] of [["", "Stop"], ["bad owner", "Stop"], ["policy", ""], ["policy", "\u001b[0m"]]) {
    assert.throws(() => instruction(owner, text), TypeError);
  }
});

test("invocation shape and hint/continuation sizes are checked before retaining facts", () => {
  assert.doesNotThrow(() => assertInvocation(read, "read"));
  const target = { ...read, args: ["two words", ""], flags: { all: true, page: 1, ids: ["a", 2] }, passthrough: ["--x"] };
  assert.deepEqual(hint(target, "Inspect the service"), { invocation: target, action: "Inspect the service" });
  for (const value of [null, {}, { ...read, path: "" }, { ...read, args: [1] },
    { ...read, flags: { bad: null } }, { ...read, flags: { bad: [true] } },
    { ...read, effects: "other" }, { ...read, passthrough: [1] }, { ...read, extra: true }]) {
    assert.throws(() => assertInvocation(value), TypeError);
    assert.throws(() => hint(value, "Inspect"), TypeError);
  }
  const oversized = { ...read, args: ["é".repeat(1024)] };
  assert.throws(() => hint(oversized, "Inspect"), TypeError);
  assert.throws(() => defineErrors(definitions).error("OFFLINE", { message: "No", continuation: oversized }), TypeError);
  assert.throws(() => hint(read, ""), TypeError);
  assert.throws(() => hint(read, "x".repeat(511)), TypeError);
});

test("mandatory error codes are bounded before a catalog can create responses", () => {
  assert.throws(() => defineErrors({ ["x".repeat(511)]: definitions.DENIED }), TypeError);
  const code = "x".repeat(510);
  assert.equal(defineErrors({ [code]: definitions.DENIED }).error(code, { message: "No" }).code, code);
});

test("mandatory aggregate limits include list/object overhead and all selected fields", () => {
  for (const [limit, make] of [
    [protocolLimits.reminders, text => ["First reminder", text]],
    [protocolLimits.references, text => ({ doctor: read, continuation: { ...read, args: [text] } })],
    [protocolLimits.manifest, text => ({ path: text, bytes: 1, format: "json" })],
  ]) {
    const overhead = Buffer.byteLength(JSON.stringify(make("")));
    const exact = make("x".repeat(limit - overhead));
    assert.equal(Buffer.byteLength(JSON.stringify(exact)), limit);
    assert.doesNotThrow(() => assertSerializedLimit(exact, limit));
    assert.throws(() => assertSerializedLimit(make("x".repeat(limit - overhead + 1)), limit), TypeError);
  }
});

test("valid large optional JSON details remain available for downstream spill policy", () => {
  const details = Array.from({ length: 150000 }, (_, index) => index);
  const error = defineErrors(definitions).error("DENIED", { message: "No", details });
  assert.equal(error.details.length, details.length);
  assert.equal(error.details[149999], 149999);
  assert.ok(Object.isFrozen(error.details));
});
