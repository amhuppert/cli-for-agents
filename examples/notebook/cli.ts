import { bytes, id, invocation } from "cli-for-agents";
import { hint } from "cli-for-agents/guidance";
import { createCli, type ContextProvider } from "cli-for-agents/runtime";
import type { App } from "./app.js";
import { apply, doctor, claimGroup, family, nodeGroup, show } from "./commands.js";

const application: ContextProvider<App, {}, keyof typeof family.errors.definitions> = async (_input) => { throw new Error("Application provider is a stub"); };
export const cli = createCli({
  name: "notebook",
  version: "0.0.0",
  commands: [show, apply, doctor],
  doctor: invocation(doctor, {}),
  groups: [nodeGroup, claimGroup],
  family,
  contexts: { app: application },
  output: { maxBytes: bytes(32768), artifacts: { directory: ".cache/notebook/out", forbiddenRoots: ["data"] } },
});

export const inspectNode = invocation(show, { args: { id: id("node", "n_9f3a") }, flags: {} });
export const nextStep = hint(inspectNode, "Inspect the updated node");
