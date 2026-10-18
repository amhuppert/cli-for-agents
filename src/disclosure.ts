import type { Invocation } from "./commands.js";
import type { Brand } from "./internal/brand.js";
import { makeBinaryRequest } from "./internal/binary.js";
import { assertFields, assertInvocation, assertRecord, contractCheck, frozenJson, serializedJson } from "./internal/validation.js";
import { bytes, count } from "./values.js";
import type { ArtifactPath, Bytes, Count, JsonData, JsonValue, Sha256 } from "./values.js";

/** Dataset total, not the number remaining after a cursor. */
export type Total = { readonly kind: "known"; readonly count: Count } | { readonly kind: "unknown"; readonly count?: never };
/** A complete result cannot promise more; any truncation must carry a read-only route. */
export type Omission =
  | { readonly truncated: false; readonly returned: Count; readonly total: Total; readonly reveal?: never }
  | { readonly truncated: true; readonly returned: Count; readonly total: Total; readonly reveal: Invocation<"read"> };
export type Page<Item> = { readonly items: readonly JsonData<Item>[]; readonly omission: Omission };

/** Accepts an already-paged source; it never loads an entire dataset to slice it. */
export function page<Item>(source: {
  readonly items: readonly JsonData<Item>[];
  readonly total: Total;
} & (
  | { readonly more: false; readonly reveal?: never }
  | { readonly more: true; readonly reveal: Invocation<"read"> }
)): Page<Item> {
  return contractCheck(() => {
    const snapshot = frozenJson(source);
    assertRecord(snapshot);
    if (typeof snapshot.more !== "boolean") throw new TypeError("Page more must be boolean.");
    assertFields(snapshot, ["items", "total", "more", ...(snapshot.more ? ["reveal"] : [])]);
    if (!Array.isArray(snapshot.items)) throw new TypeError("Page items must be an already-paged array.");
    const returned = count(snapshot.items.length);
    assertRecord(snapshot.total);
    if (snapshot.total.kind === "known") {
      assertFields(snapshot.total, ["kind", "count"]);
      const total = count(snapshot.total.count);
      if (total < returned || snapshot.more && total === returned) {
        throw new TypeError("Page total contradicts the returned count or more marker.");
      }
    } else if (snapshot.total.kind === "unknown") {
      assertFields(snapshot.total, ["kind"]);
    } else {
      throw new TypeError("Invalid page total kind.");
    }
    let omission: Omission;
    if (snapshot.more) {
      assertInvocation(snapshot.reveal, "read");
      omission = { truncated: true, returned, total: snapshot.total, reveal: snapshot.reveal as Invocation<"read"> };
    } else {
      omission = { truncated: false, returned, total: snapshot.total };
    }
    return Object.freeze({ items: snapshot.items, omission: Object.freeze(omission) });
  });
}

/** A value withheld from a response because it exceeded the caller's limit. bytes is the
 * omitted value's serialized UTF-8 JSON size; reveal is the read that returns it. */
export type Elision = { readonly elided: true; readonly bytes: Bytes; readonly reveal: Invocation<"read"> };
/** Returns a detached frozen copy of value when its serialized JSON fits maxBytes, otherwise
 * an Elision. The kernel measures the size; a caller cannot claim one. */
export function elide<Value>(value: JsonData<Value>, options: { readonly maxBytes: Bytes; readonly reveal: Invocation<"read"> }): JsonData<Value> | Elision {
  return contractCheck(() => {
    const checked = frozenJson(options);
    assertRecord(checked);
    assertFields(checked, ["maxBytes", "reveal"]);
    const maxBytes = bytes(checked.maxBytes);
    assertInvocation(checked.reveal, "read");
    const size = bytes(new TextEncoder().encode(serializedJson(value)).byteLength);
    if (size <= maxBytes) return frozenJson(value);
    return Object.freeze({ elided: true as const, bytes: size, reveal: checked.reveal as Invocation<"read"> });
  });
}

/** Only delivery can create manifests after an atomic, policy-checked write. */
export type ArtifactManifest = Brand<"ArtifactManifest"> & {
  readonly path: ArtifactPath;
  readonly format: "json" | "text" | "binary";
  readonly mediaType: string;
  readonly bytes: Bytes;
  readonly sha256: Sha256;
  readonly reason: "stdout_budget_exceeded" | "explicit_out" | "binary_request";
  readonly contains: "response" | "data" | "binary";
};
type PayloadShape<Data> =
  | { readonly kind: "inline"; readonly data: Data; readonly artifact?: never; readonly summary?: never; readonly spill?: never }
  | { readonly kind: "artifact"; readonly summary: JsonValue; readonly artifact: ArtifactManifest; readonly data?: never;
      /** Present exactly for automatic spills: the attempted complete stdout plus stderr
       * in the requested format, and the run budget it exceeded. The manifest's bytes
       * describe the written artifact, which may use a different representation. */
      readonly spill?: { readonly format: "text" | "json"; readonly inlineBytes: Bytes; readonly maxBytes: Bytes } };
/** Preserves an application's DTO shape while excluding values JSON cannot represent. */
export type Payload<Data> = PayloadShape<JsonData<Data>>;
/** Framework payload with an anchored JSON value; no recursive DTO projection is needed. */
export type AnyPayload = PayloadShape<JsonValue>;

/** Applied to automatic spill and --out alike; canonical paths must avoid forbidden roots.
 * The kernel creates a missing directory and its ancestors when an artifact is needed. */
export type ArtifactPolicy = {
  readonly directory: string;
  /** Resolve roots and destination ancestors through symlinks before checking containment. */
  readonly forbiddenRoots: readonly string[];
};

/** Finite bytes are never JSON data or a streaming source. The constructor validates
 * media type/basename/JSON summary and snapshots bytes before retaining the request.
 */
type BinaryRequestShape<Summary> = Brand<"BinaryArtifactRequest"> & {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly basename: string;
  readonly summary: Summary;
};
export type BinaryArtifactRequest<Summary> = BinaryRequestShape<JsonData<Summary>>;
export type AnyBinaryArtifactRequest = BinaryRequestShape<JsonValue>;
export function binaryArtifact<Summary>(request: {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly basename: string;
  readonly summary: JsonData<Summary>;
}): BinaryArtifactRequest<Summary> { return contractCheck(() => makeBinaryRequest<Summary>(request)); }
/** Immutable, canonical, app-free value that delivery prepares from the policy captured
 * before release, only when an artifact is actually needed. */
export type ResolvedArtifactPolicy = Readonly<ArtifactPolicy> & Brand<"ResolvedArtifactPolicy">;
