import type { Prepared } from "../results.js";
import type { Sha256 } from "../values.js";
import { checkedSha256 } from "../values.js";
import { commandData } from "./declarations.js";

type Scope = { readonly command: object; readonly hash: Sha256 };
type Provenance = Scope & { readonly scope: object; consumed: boolean };
const scopes = new WeakMap<object, Scope>();
const preparations = new WeakMap<object, Provenance>();
/** Execution creates one scope per run; neither the scope nor its mint is public. */
export function preparationScope(command: object, hash: Sha256): object {
  const data = commandData(command);
  if (data.model.spec.effects !== "write" || !data.model.spec.payload) throw new TypeError("Preparation requires a payload mutation.");
  const scope = Object.freeze({});
  scopes.set(scope, { command, hash: checkedSha256(hash) });
  return scope;
}
export function mintPreparation(scope: object, value: unknown): Prepared<string, unknown> {
  const identity = scopes.get(scope);
  if (!identity) throw new TypeError("Unknown preparation scope.");
  const token = Object.freeze({ value, payloadHash: identity.hash }) as Prepared<string, unknown>;
  preparations.set(token, { ...identity, scope, consumed: false });
  return token;
}
/** Validate all provenance and consume before calling application commit, even if it throws. */
export async function usePreparation<T>(scope: object, token: Prepared<string, unknown>, hash: Sha256,
  commit: (token: Prepared<string, unknown>) => Promise<T>): Promise<T> {
  const identity = scopes.get(scope); const prepared = preparations.get(token);
  if (!identity || !prepared || prepared.scope !== scope || prepared.command !== identity.command
    || prepared.hash !== identity.hash || hash !== prepared.hash || token.payloadHash !== prepared.hash || prepared.consumed) {
    throw new TypeError("Invalid or consumed preparation provenance.");
  }
  prepared.consumed = true;
  return commit(token);
}
