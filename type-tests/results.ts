import { page, type Result, type ReadHandler, type AnyEnvelope, type AnyPayload, type ArtifactManifest, type ArtifactPath, type Bytes, type Count, type Id } from "cli-for-agents";
import type { App } from "../examples/notebook/app.js";
import type { showSpec } from "../examples/notebook/commands.js";

// Ordinary interfaces work as DTOs; no JSON index signature or cast is required.
interface Receipt { readonly id: Id<"node">; readonly nested: { readonly title: string } }
declare const receipt: Receipt;
export const success: Result<Receipt> = { ok: true, data: receipt };
export const pageOfInterfaces = page<Receipt>({ items: [receipt], total: { kind: "unknown" }, more: false });
export const pageResult: Result<typeof pageOfInterfaces> = { ok: true, data: pageOfInterfaces };
export const handler: ReadHandler<typeof showSpec, App> = {
  run: async () => success,
  levels: { full: async () => success },
};

// @ts-expect-error Functions are not JSON payloads.
export const callableData: Result<{ readonly callback: () => void }> = { ok: true, data: { callback: () => {} } };
// @ts-expect-error Bigint has no JSON representation.
export const bigintData: Result<{ readonly count: bigint }> = { ok: true, data: { count: 1n } };
// @ts-expect-error Undefined cannot stand in for an explicit JSON value.
export const undefinedData: Result<{ readonly value: undefined }> = { ok: true, data: { value: undefined } };

declare const successEnvelope: Extract<AnyEnvelope, { readonly ok: true }>;
// @ts-expect-error Successful delivery cannot report uncertain operation effects.
export const uncertainSuccess: AnyEnvelope = { ...successEnvelope, effect: "unknown", recovery: {} };
declare const manifest: ArtifactManifest;
// @ts-expect-error Inline payload cannot also claim an artifact.
export const mixedPayload: AnyPayload = { kind: "inline", data: null, artifact: manifest };
// @ts-expect-error A path string is not proof of a policy-checked artifact write.
export const forgedPath: ArtifactPath = "/tmp/unchecked.json";
declare const bytes: Bytes;
// @ts-expect-error Serialized bytes do not count records.
export const records: Count = bytes;
