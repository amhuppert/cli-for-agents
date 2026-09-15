import { bytes, commandsFor, defineErrors, defineGroup, type CommandSpec } from "cli-for-agents";
import type { App } from "./app.js";

export const errors = defineErrors({
  INVALID_CLAIM: { exitClass: "usage", description: "The claim payload is invalid." },
  APPLY_FAILED: { exitClass: "failed", description: "The claim could not be persisted." },
});
export const family = commandsFor<{ app: App }>()({ errors, globalFlags: {} });
const command = family.defineCommand;
export const nodeGroup = defineGroup({ path: "node", summary: "Inspect nodes.", description: "Read bounded node summaries and detail." });
export const claimGroup = defineGroup({ path: "claim", summary: "Manage claims.", description: "Validate payloads before applying claims." });

// Exporting the inert spec lets handler types refer to input without an inference cycle.
export const showSpec = {
  path: "node show",
  effects: "read", requires: "app",
  summary: "Inspect a node.",
  description: "Read its summary, or request its full body explicitly.",
  args: [{ name: "id", description: "Stable node ID.", value: { kind: "id", domain: "node" }, required: true }],
  flags: { context: { description: "Include context in the summary.", value: { kind: "boolean" }, required: false } },
  levels: { full: { output: "artifact-eligible" } },
} as const satisfies CommandSpec;
export const show = command(showSpec, {
  examples: [{ args: { id: "n_9f3a" }, flags: {}, why: "Inspect the stable handle before applying a claim." }],
  handler: () => import("./show.handler.js"),
});

export const applySpec = {
  path: "claim apply",
  effects: "write", requires: "app",
  summary: "Apply claims from a payload file.",
  description: "Validate a structured file, then commit it in one operation.",
  args: [],
  flags: {},
  payload: { maxBytes: bytes(2 * 1024 * 1024), validatePath: "claim validate" },
} as const satisfies CommandSpec;
export const apply = command(applySpec, {
  examples: [{ args: {}, flags: {}, file: ".cache/claims.json", why: "Run claim validate with this file first." }],
  handler: () => import("./apply.handler.js"),
});

export const doctorSpec = {
  path: "doctor", effects: "read", requires: "none", summary: "Diagnose notebook access.",
  description: "Inspect local configuration before retrying a mutation.", args: [], flags: {},
} as const satisfies CommandSpec;
export const doctor = command(doctorSpec, {
  examples: [{ why: "Diagnose access before another mutation." }],
  handler: () => import("./doctor.handler.js"),
});
