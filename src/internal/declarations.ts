import type { Command, CommandBuilder, CommandFamily, CommandSpec, Flow, Group } from "../commands.js";
import type { ErrorCatalog, ErrorDefinitions, FamilyCode } from "../results.js";
import type { Flag } from "../input.js";
import { checkCaller, checkFlags, checkPath, inputModel } from "./input-model.js";
import type { InputModel } from "./input-model.js";
import { assertFields, assertIdentifier, assertRecord, assertText, frozenJson } from "./validation.js";

type Metadata = Pick<CommandSpec, "path" | "summary" | "description" | "related" | "skills" | "sections" | "dynamicHelp">;
export type CommandData = { readonly family: object; readonly model: InputModel; readonly examples: readonly object[]; readonly handler: () => Promise<unknown> };
const commands = new WeakMap<object, CommandData>();
const flows = new WeakMap<object, readonly { readonly command: Command; readonly description: string }[]>();

export function commandData(command: object): CommandData {
  const data = commands.get(command);
  if (!data) throw new TypeError("Unknown command token.");
  return data;
}
/** Family identity is checked before erasing its compile-time catalog keys. */
export function commandErrors(command: object): ErrorCatalog<ErrorDefinitions> {
  const family = commandData(command).family;
  checkFamily(family);
  return (family as CommandFamily<unknown, ErrorDefinitions, Readonly<Record<string, Flag>>>).errors;
}
export function checkFamily(family: object): void {
  if (!("defineCommand" in family) || typeof family.defineCommand !== "function" || !("errors" in family)) throw new TypeError("Unknown command family.");
}
export function checkGroup(group: object): void {
  if (!("kind" in group) || group.kind !== "group") throw new TypeError("Unknown group token.");
}
export function flowSteps(flow: object): readonly { readonly command: Command; readonly description: string }[] {
  const steps = flows.get(flow);
  if (!steps) throw new TypeError("Unknown flow token.");
  return steps;
}
export function checkMetadata(value: Metadata): void {
  checkPath(value.path); assertText(value.summary); assertText(value.description);
  if (value.dynamicHelp !== undefined && value.dynamicHelp !== true) throw new TypeError("Invalid dynamic help marker.");
  if (value.related !== undefined) {
    if (!Array.isArray(value.related)) throw new TypeError("Invalid related edges.");
    for (const edge of value.related) { assertRecord(edge); assertFields(edge, ["path", "description"]); assertText(edge["path"]); checkPath(edge["path"]); assertText(edge["description"]); }
  }
  if (value.skills !== undefined) {
    if (!Array.isArray(value.skills)) throw new TypeError("Invalid skill references.");
    for (const skill of value.skills) {
      assertRecord(skill); assertFields(skill, ["path", "readWhen"]); assertText(skill["path"]); assertText(skill["readWhen"]);
      if (skill["path"].includes("\\") || skill["path"].includes(":") || skill["path"].split("/").some(p => !p || p === "." || p === "..")) throw new TypeError("Invalid skill reference path.");
    }
  }
  if (value.sections !== undefined) {
    if (!Array.isArray(value.sections)) throw new TypeError("Invalid help sections.");
    for (const section of value.sections) {
      assertRecord(section); assertText(section["title"]);
      if (section["kind"] !== "paragraphs" && section["kind"] !== "list") throw new TypeError("Invalid help section kind.");
      assertFields(section, ["kind", "title", section["kind"] === "list" ? "items" : "paragraphs"]);
      const contents = section["kind"] === "list" ? section["items"] : section["paragraphs"];
      if (!Array.isArray(contents) || !contents.length) throw new TypeError("Empty help section.");
      contents.forEach(assertText);
    }
  }
}

export function makeFamily<Contexts, D extends ErrorDefinitions, G extends Readonly<Record<string, Flag>>>(options: { readonly errors: ErrorCatalog<D>; readonly globalFlags: G }): CommandFamily<Contexts, D, G> {
  // The catalog remains owned by defineErrors; this boundary retains its identity.
  if (!options.errors || !Object.isFrozen(options.errors) || typeof options.errors.error !== "function") throw new TypeError("Expected a checked error catalog.");
  const globalFlags = frozenJson(options.globalFlags); checkFlags(globalFlags);
  const defineCommand: CommandBuilder<Contexts, D, G> = (spec, binding) => {
    const snapshot = frozenJson(spec); assertRecord(snapshot);
    assertFields(snapshot, ["path", "summary", "description", "requires", "effects", "args", "flags"], ["related", "skills", "sections", "dynamicHelp", "passthrough", "output", "payload", "levels"]);
    checkMetadata(snapshot);
    if (snapshot.requires !== "none") checkPath(snapshot.requires);
    if (!["read", "write"].includes(snapshot.effects)) throw new TypeError("Invalid command effects.");
    if (snapshot.output !== undefined && snapshot.output !== "binary") throw new TypeError("Invalid output kind.");
    if (snapshot.passthrough !== undefined && snapshot.passthrough !== true) throw new TypeError("Invalid passthrough marker.");
    if (typeof binding.handler !== "function") throw new TypeError("Expected lazy handler function.");
    const model = inputModel(snapshot, globalFlags);
    const examples = frozenJson(binding.examples);
    if (!Array.isArray(examples) || examples.length === 0) throw new TypeError("Commands require examples.");
    for (const example of examples) {
      assertRecord(example); assertText(example["why"]);
      const { why: _why, ...input } = example; checkCaller(model, input, false);
    }
    const command = Object.freeze({ spec: snapshot, globalFlags }) as Command<typeof spec, Contexts, FamilyCode<D>, G>;
    commands.set(command, Object.freeze({ family, model, examples, handler: binding.handler }));
    return command;
  };
  const family = Object.freeze({ errors: options.errors, globalFlags, defineCommand }) as CommandFamily<Contexts, D, G>;
  return family;
}
export function makeGroup(definition: Metadata): Group {
  const snapshot = frozenJson(definition); assertRecord(snapshot);
  assertFields(snapshot, ["path", "summary", "description"], ["related", "skills", "sections", "dynamicHelp"]); checkMetadata(snapshot);
  return Object.freeze({ ...snapshot, kind: "group" }) as Group;
}
export function makeFlow(definition: { readonly id: string; readonly steps: readonly { readonly command: Command; readonly description: string }[] }): Flow {
  assertIdentifier(definition.id);
  if (!Array.isArray(definition.steps) || !definition.steps.length) throw new TypeError("Flow requires steps.");
  const steps = Object.freeze(definition.steps.map(step => {
    commandData(step.command); assertText(step.description);
    return Object.freeze({ command: step.command, description: step.description });
  }));
  const flow = Object.freeze({ id: definition.id }) as Flow;
  flows.set(flow, steps); return flow;
}
