import type { Host, Environment } from 'cli-for-agents/runtime';
export type Node = { id: string; title: string; body: string; tags: string[] };
export type Claim = { nodeId: string; text: string };
export type Receipt = Claim & { id: string };
export type State = { nodes: Node[]; receipts: Receipt[] };
export interface Workspace {
  readonly root: string;
  readonly state: State;
  save(change: (current: State) => void): Promise<State>;
}
export type StoreInput = { host: Host; env: Environment; signal: AbortSignal };
