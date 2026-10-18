import assert from "node:assert/strict";
import test from "node:test";
import { bytes, commandsFor, count, defineErrors, elide, invocation, page } from "cli-for-agents";
import { createCli, renderInvocation } from "cli-for-agents/runtime";

const family = commandsFor()({ errors: defineErrors({}), globalFlags: {} });
const spec = {
  path: "list", summary: "List records", description: "Inspect a page of records.",
  requires: "none", effects: "read", args: [],
  flags: {
    cursor: { description: "Cursor", value: { kind: "string" } },
    filter: { description: "Filter", value: { kind: "string" }, repeatable: true },
    limit: { description: "Page size", value: { kind: "integer", min: 1 } },
  },
  levels: { full: { output: "bounded" } },
};
const binding = { examples: [{ why: "Inspect records" }], handler: async () => { throw new Error("Page construction must not load a handler"); } };
const read = family.defineCommand(spec, binding);
const { levels: _levels, ...writeSpec } = spec;
const write = family.defineCommand({ ...writeSpec, path: "delete", effects: "write" }, binding);
const reveal = invocation(read, { flags: { cursor: "next ' page", filter: ["open", "owner:a b"], limit: 2 }, level: "full" });
createCli({ name: "records", version: "1", family, commands: [read, write], contexts: {}, doctor: invocation(read, {}),
  output: { artifacts: { resolve() { throw new Error("Page construction must not resolve artifact policy"); } } },
});
const unknown = { kind: "unknown" };
const known = value => ({ kind: "known", count: count(value) });

for (const [name, items, total, more] of [
  ["complete known result", [{ id: "a" }, { id: "b" }], known(2), false],
  ["truncated known result", [{ id: "a" }, { id: "b" }], known(8), true],
  ["complete unknown result", [{ id: "a" }], unknown, false],
  ["truncated unknown result", [{ id: "a" }], unknown, true],
  ["empty known result", [], known(0), false],
  ["empty unknown result", [], unknown, false],
  ["empty truncated known page", [], known(8), true],
  ["empty truncated unknown page", [], unknown, true],
  ["final partial page", [{ id: "last" }], known(8), false],
  ["empty page past the end", [], known(8), false],
]) {
  test(`public page describes ${name} with exact returned count`, () => {
    const result = page({ items, total, more, ...(more ? { reveal } : {}) });
    assert.deepEqual(result, { items, omission: { returned: count(items.length), total, truncated: more, ...(more ? { reveal } : {}) } });
    assert.equal(Object.hasOwn(result.omission.total, "count"), total.kind === "known");
    assert.equal(Object.hasOwn(result.omission, "reveal"), more);
  });
}

test("continuation retains filters, cursor and selected view as plain JSON", () => {
  const result = page({ items: [{ id: "a" }], total: known(8), more: true, reveal });
  assert.deepEqual(result.omission.reveal, reveal);
  assert.deepEqual(result.omission.reveal.flags, {
    cursor: "next ' page", filter: ["open", "owner:a b"], limit: 2, full: true,
  });
  assert.equal(renderInvocation(result.omission.reveal, "records"), renderInvocation(reveal, "records"));
});

test("page snapshots only supplied JSON data so later mutation cannot invalidate counts", () => {
  const source = { items: [{ id: "a", tags: ["open"] }], total: known(8), more: true, reveal };
  const result = page(source);
  source.items.push({ id: "b" });
  source.items[0].tags.push("changed");
  source.total.count = 0;
  source.reveal = invocation(write, {});
  assert.deepEqual(result.items, [{ id: "a", tags: ["open"] }]);
  assert.deepEqual(result.omission, { returned: 1, total: known(8), truncated: true, reveal });
  assert.throws(() => result.items.push({ id: "c" }), TypeError);
  assert.throws(() => { result.items[0].id = "changed"; }, TypeError);
  assert.throws(() => { result.omission.returned = 9; }, TypeError);
  assert.throws(() => { result.omission.total.count = 0; }, TypeError);
});

// Intentionally malformed JavaScript values exercise the public erased boundary.
for (const [name, source, pattern] of [
  ["total below returned", { items: [1, 2], total: known(1), more: false }, /total|count/i],
  ["more with exhausted total", { items: [1], total: known(1), more: true, reveal }, /total|count/i],
  ["more with zero total", { items: [], total: known(0), more: true, reveal }, /total|count/i],
  ["caller-supplied returned count", { items: [1], total: known(1), more: false, returned: 9 }, /fields|count/i],
  ["missing continuation", { items: [], total: unknown, more: true }, /reveal|continuation|fields/i],
  ["mutating continuation", { items: [], total: unknown, more: true, reveal: invocation(write, {}) }, /read|effect/i],
  ["malformed continuation", { items: [], total: unknown, more: true, reveal: { ...reveal, args: "x" } }, /invocation|tokens/i],
  ["continuation on complete page", { items: [], total: unknown, more: false, reveal }, /reveal|continuation|fields/i],
  ["unknown total with count", { items: [], total: { kind: "unknown", count: 0 }, more: false }, /fields|total/i],
  ["known total without count", { items: [], total: { kind: "known" }, more: false }, /fields|total|integer/i],
  ["negative total", { items: [], total: { kind: "known", count: -1 }, more: false }, /integer|count/i],
  ["fractional total", { items: [], total: { kind: "known", count: 1.5 }, more: false }, /integer|count/i],
  ["unsafe total", { items: [], total: { kind: "known", count: Number.MAX_SAFE_INTEGER + 1 }, more: false }, /integer|count/i],
  ["invalid total kind", { items: [], total: { kind: "estimated", count: 8 }, more: false }, /total/i],
  ["nonboolean more", { items: [], total: unknown, more: "false" }, /more|boolean/i],
  ["nonarray items", { items: { length: 1 }, total: unknown, more: false }, /array|items/i],
  ["sparse items", { items: Array(2), total: unknown, more: false }, /dense|JSON/i],
  ["nonfinite item", { items: [NaN], total: unknown, more: false }, /JSON/i],
]) {
  test(`page rejects ${name}`, () => assert.throws(() => page(source), pattern));
}

test("elide keeps a value that fits and withholds a larger one behind its measured size and read", () => {
  const record = { id: "r1", notes: ["short"] };
  const kept = elide(record, { maxBytes: bytes(64), reveal });
  assert.deepEqual(kept, record);
  assert.notEqual(kept, record);
  assert.ok(Object.isFrozen(kept) && Object.isFrozen(kept.notes));
  const text = "é".repeat(40);
  assert.deepEqual(elide(text, { maxBytes: bytes(82), reveal }), text);
  const withheld = elide(text, { maxBytes: bytes(81), reveal });
  assert.deepEqual(withheld, { elided: true, bytes: 82, reveal });
  assert.ok(Object.isFrozen(withheld));
  assert.match(renderInvocation(withheld.reveal, "records"), /--cursor/);
});

test("elide refuses a write reveal, an invalid limit and non-JSON values", () => {
  const writeReveal = invocation(write, {});
  assert.throws(() => elide("x".repeat(10), { maxBytes: bytes(2), reveal: writeReveal }), TypeError);
  assert.throws(() => elide("x", { maxBytes: -1, reveal }), TypeError);
  assert.throws(() => elide({ value: undefined }, { maxBytes: bytes(64), reveal }), TypeError);
  assert.throws(() => elide("x", { maxBytes: bytes(64), reveal, extra: true }), TypeError);
});
