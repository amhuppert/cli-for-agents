/// <reference path="./node-builtins.d.ts" />
import { bytes, milliseconds } from "../values.js";

export function checkLimit(limit: number): void { bytes(limit); }
export function checkDuration(duration: number): void { milliseconds(duration); }
export function overflow(): RangeError { return new RangeError("Input exceeds byte limit"); }
export function collisionError(): Error { return new Error("Atomic write collision: existing file differs"); }
export function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
export async function hashBytes(data: Uint8Array): Promise<string> {
  const snapshot = new Uint8Array(data);
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(snapshot).digest("hex");
}
export function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
