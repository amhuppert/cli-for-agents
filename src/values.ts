import type { Brand } from "./internal/brand.js";
import { assertIdentifier, assertNonnegativeInteger } from "./internal/validation.js";

/** JSON-safe application data. Runtime validation must still reject cycles and NaN. */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | {
  readonly [key: string]: JsonValue;
};
/**
 * Projects ordinary DTO interfaces while excluding functions, bigint and undefined values.
 * Framework boundaries use JsonValue directly: projecting its recursive union has no
 * finite DTO shape and can exhaust TypeScript's instantiation depth.
 */
export type JsonData<T> =
  T extends null | boolean | number | string ? T :
  T extends (...args: never[]) => unknown ? never :
  T extends readonly unknown[] ? { readonly [K in keyof T]: JsonData<T[K]> } :
  T extends object ? { readonly [K in keyof T as K extends string | number ? K : never]: JsonData<T[K]> } : never;
export type NonEmpty<T> = readonly [T, ...T[]];
/** IDs from different domains are not interchangeable. Parsing establishes validity. */
export type Id<Domain extends string> = string & Brand<"Id", Domain>;
export type Bytes = number & Brand<"Bytes">;
export type Count = number & Brand<"Count">;
export type Milliseconds = number & Brand<"Milliseconds">;
export type Sha256 = string & Brand<"Sha256">;
/** Established by the artifact writer after canonical-path location checks. */
export type ArtifactPath = string & Brand<"ArtifactPath">;
export type ShellSafe = string & Brand<"ShellSafe">;

/** Validate a nonnegative safe integer; these units cannot substitute for each other. */
export function bytes(value: number): Bytes {
  assertNonnegativeInteger(value);
  return (value === 0 ? 0 : value) as Bytes;
}
export function count(value: number): Count {
  assertNonnegativeInteger(value);
  return (value === 0 ? 0 : value) as Count;
}
export function milliseconds(value: number): Milliseconds {
  assertNonnegativeInteger(value);
  return (value === 0 ? 0 : value) as Milliseconds;
}
/** Nonempty domain/text without whitespace or controls; application syntax is caller-owned. */
export function id<const Domain extends string>(domain: Domain, value: string): Id<Domain> {
  assertIdentifier(domain);
  assertIdentifier(value);
  return value as Id<Domain>;
}

/** Source-private ingress for host digests; no caller cast can mint a valid hash. */
export function checkedSha256(value: unknown): Sha256 {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError("Expected a SHA-256 hex digest.");
  return value as Sha256;
}
