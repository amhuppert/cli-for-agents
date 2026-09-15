import type { AnyEnvelope } from "../results.js";
import type { TestEvent } from "../testing/index.js";

/** Request-local instrumentation. No callbacks run in production; concurrent tests
 * cannot intercept each other's events or mutate the response being delivered. */
export type Observation = { readonly events: TestEvent[]; envelope?: AnyEnvelope };
const observations = new WeakMap<AbortSignal, Observation>();
export function observeRun(signal: AbortSignal, observation: Observation): () => void {
  observations.set(signal, observation);
  return () => { observations.delete(signal); };
}
export function recordTestEvent(signal: AbortSignal, event: TestEvent): void {
  observations.get(signal)?.events.push(Object.freeze(event));
}
export function recordTestDelivery(signal: AbortSignal, envelope: AnyEnvelope): void {
  const observation = observations.get(signal);
  if (observation) observation.envelope = envelope;
}
