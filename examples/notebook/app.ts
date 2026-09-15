import type { Id } from "cli-for-agents";

/** Consumer-owned service surface; no framework dependency on storage or transport. */
export interface App {
  readonly nodes: {
    readonly show: (id: Id<"node">) => Promise<NodeSummary>;
    readonly apply: (input: ClaimInput) => Promise<{ readonly nodeId: Id<"node"> }>;
  };
}
export type NodeSummary = { readonly id: Id<"node">; readonly title: string };
export type ClaimInput = { readonly nodeId: Id<"node">; readonly text: string };
