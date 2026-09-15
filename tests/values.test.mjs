import assert from "node:assert/strict";
import test from "node:test";
import { bytes, count, milliseconds, id } from "cli-for-agents";

for (const constructor of [bytes, count, milliseconds]) {
  test(`${constructor.name} accepts nonnegative safe integer boundaries`, () => {
    for (const value of [0, 1, Number.MAX_SAFE_INTEGER]) {
      assert.equal(constructor(value), value);
    }
    assert.equal(constructor(-0), 0);
  });
  test(`${constructor.name} rejects invalid numbers and hostile JavaScript inputs`, () => {
    for (const value of [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1,
      "1", null, undefined, true, 1n, new Number(1)]) {
      assert.throws(() => constructor(value), TypeError);
    }
  });
}

test("IDs validate domain and text while preserving the application identifier", () => {
  assert.equal(id("ticket", "abc-123"), "abc-123");
  assert.equal(id("user", "abc-123"), "abc-123");
  assert.equal(id("document", "日本語:123"), "日本語:123");
});

test("IDs reject malformed domains/text through the hostile JavaScript boundary", () => {
  for (const value of ["", " ", "a b", " a", "a\n", "a\0b", "\u007f", "\u001b", "\ud800", "\udfff", 1, null, undefined]) {
    assert.throws(() => id("ticket", value), TypeError);
    assert.throws(() => id(value, "123"), TypeError);
  }
});
