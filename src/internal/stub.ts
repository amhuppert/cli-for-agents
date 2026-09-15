/** Every runtime entry point deliberately fails until contract review is complete. */
export function notImplemented(): never {
  throw new Error("cli-for-agents: contract scaffold only; runtime is not implemented");
}
