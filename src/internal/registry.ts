import type { Command, CommandSpec } from "../commands.js";
import type { Brand } from "./brand.js";
import type { Flag } from "../input.js";
import type { ContractViolation, ErrorDefinitions, FamilyCode } from "../results.js";
import type { CliOptions } from "../runtime/index.js";
import { parseTokens } from "./parser.js";
import type { CheckedInput } from "./input-model.js";
import { commandData, checkFamily, checkGroup, flowSteps } from "./declarations.js";
import { invocationTarget, invocationArgv, markRegistered, makeInvocation, referenceTokens, hasInvocationProvenance } from "./invocations.js";
import { assertIdentifier, assertInvocation, assertSerializedLimit, assertText, frozenJson, serializedJson } from "./validation.js";
import { protocolLimits } from "../results.js";
import type { InputModel } from "./input-model.js";
import { scalar } from "./input-model.js";

/** Owns the graph, family identity, doctor, input inventories and reference shapes. */
export type Registry<Contexts = never, Code extends string = string, G extends Readonly<Record<string, Flag>> = {}> = Brand<"Registry", {
  readonly contexts: (contexts: Contexts) => void; readonly codes: Code; readonly globals: G;
}>;
/** Parsing stamps the command/input pair together; execution cannot accept unchecked argv. */
export type ParsedInvocation<Contexts = never, Code extends string = string, G extends Readonly<Record<string, Flag>> = {}> = Brand<"ParsedInvocation"> & {
  readonly command: Command<CommandSpec, Contexts, Code, G>;
  readonly input: CheckedInput;
  readonly path: string;
  readonly validation: boolean;
  readonly json: boolean;
};
export type Resolution<Contexts = never, Code extends string = string, G extends Readonly<Record<string, Flag>> = {}> =
  | { readonly kind: "offline"; readonly route: "help" | "version" | "exit-codes"; readonly path: string; readonly json: boolean }
  | { readonly kind: "leaf"; readonly invocation: ParsedInvocation<Contexts, Code, G> }
  | { readonly kind: "invalid"; readonly issues: readonly ContractViolation[]; readonly json: boolean };
/** Synchronous graph/shape validation only, including docs root/reference syntax. */
export function register<Contexts, D extends ErrorDefinitions, G extends Readonly<Record<string, Flag>>>(
  options: CliOptions<Contexts, D, G>,
): Registry<Contexts, FamilyCode<D>, G> {
  checkFamily(options.family);
  assertText(options.name); assertText(options.version);
  if (options.errors !== undefined || options.application !== undefined) throw new TypeError("Obsolete CLI configuration.");
  if (!options.contexts || typeof options.contexts !== "object" || Object.hasOwn(options.contexts, "none")) throw new TypeError("Invalid context providers.");
  for (const provider of Object.values(options.contexts)) if (typeof provider !== "function") throw new TypeError("Invalid context provider.");
  if (!options.output || !options.output.artifacts) throw new TypeError("Explicit artifact policy is required.");
  if (options.documentation) assertText(options.documentation.directory);
  if (options.guidance && (typeof options.guidance.load !== "function" || typeof options.guidance.conflictSink !== "function")) throw new TypeError("Guidance requires a lazy source and conflict sink.");
  const nodes: Record<string, RegistryNode> = Object.create(null);
  nodes[""] = Object.freeze({ path: "", kind: "root", summary: options.name, description: options.name });
  const add = (node: RegistryNode): void => {
    if (Object.hasOwn(nodes, node.path)) throw new TypeError("Duplicate registry path.");
    nodes[node.path] = Object.freeze(node);
  };
  for (const group of options.groups ?? []) {
    checkGroup(group); add({ path: group.path, kind: "group", summary: group.summary, description: group.description, group });
  }
  const tokens = new Set<object>();
  for (const command of options.commands) {
    const data = commandData(command);
    if (data.family !== options.family) throw new TypeError("Command belongs to a foreign family.");
    const spec = data.model.spec;
    if (spec.requires !== "none" && !Object.hasOwn(options.contexts, spec.requires)) throw new TypeError("Missing context provider.");
    tokens.add(command);
    add({ path: spec.path, kind: "command", summary: spec.summary, description: spec.description, command, model: data.model });
    if (spec.effects === "write" && spec.payload) add({ path: spec.payload.validatePath, kind: "validation", summary: `Validate: ${spec.summary}`, description: spec.description, command, model: data.model });
  }
  for (const node of Object.values(nodes)) {
    if (!node.path) continue;
    const parent = node.path.split(" ").slice(0, -1).join(" ");
    if (!nodes[parent] || !["root", "group"].includes(nodes[parent].kind)) throw new TypeError("Missing parent group.");
    const metadata = node.group ?? node.model?.spec;
    for (const edge of metadata?.related ?? []) if (!Object.hasOwn(nodes, edge.path)) throw new TypeError("Dangling related edge.");
    if (metadata?.skills?.length && !options.documentation) throw new TypeError("Skill references require a documentation root.");
  }
  const flowIds = new Set<string>();
  for (const flow of options.flows ?? []) {
    if (flowIds.has(flow.id)) throw new TypeError("Duplicate flow id."); flowIds.add(flow.id);
    for (const step of flowSteps(flow)) if (!tokens.has(step.command)) throw new TypeError("Flow references nonmember command.");
  }
  if (!options.doctor) throw new TypeError("Missing runnable read doctor invocation.");
  const doctorTarget = invocationTarget(options.doctor);
  if (!tokens.has(doctorTarget.command) || options.doctor.effects !== "read" || !nodes[options.doctor.path]) throw new TypeError("Doctor must be a member read invocation.");
  const parsedDoctor = parseTokens(nodes, invocationArgv(options.doctor));
  if (parsedDoctor.kind !== "leaf" || parsedDoctor.node !== nodes[options.doctor.path]
    || parsedDoctor.node.command !== doctorTarget.command
    || (parsedDoctor.node.kind === "validation") !== doctorTarget.validation) {
    throw new TypeError("Doctor invocation does not resolve to its registered target.");
  }
  assertSerializedLimit({ doctor: options.doctor }, protocolLimits.references);
  const registry = Object.freeze({}) as Registry<Contexts, FamilyCode<D>, G>;
  for (const command of tokens) markRegistered(command);
  registryStates.set(registry, Object.freeze({ name: options.name, version: options.version, nodes: Object.freeze(nodes), tokens }));
  return registry;
}
export function resolve<Contexts, Code extends string, G extends Readonly<Record<string, Flag>>>(
  registry: Registry<Contexts, Code, G>, argv: readonly string[],
): Resolution<Contexts, Code, G> {
  const state = registryState(registry);
  let json = false;
  try {
    const resolved = parseTokens(state.nodes, argv, format => { json = format; });
    if (resolved.kind === "offline") return resolved;
    const command = resolved.node.command!;
    checkMembership(registry, command);
    const invocation = Object.freeze({ command, input: resolved.input,
      path: resolved.node.path, validation: resolved.node.kind === "validation", json: resolved.json,
    }) as ParsedInvocation<Contexts, Code, G>;
    parsedTokens.add(invocation);
    return { kind: "leaf", invocation };
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return { kind: "invalid", json, issues: [{ code: "invalid_value", message: error.message, paths: [""] }] };
  }
}
const parsedTokens = new WeakSet<object>();
export function checkParsedInvocation(invocation: object): void {
  if (!parsedTokens.has(invocation)) throw new TypeError("Unknown parsed invocation token.");
}

/** Static projections and lazy binding lookup for help, execution and composition. */
export type RegistryNode = {
  readonly path: string; readonly kind: "root" | "group" | "command" | "validation";
  readonly summary: string; readonly description: string;
  readonly command?: object;
  readonly model?: InputModel;
  readonly group?: import("../commands.js").Group;
};
type RegistryState = { readonly name: string; readonly version: string; readonly nodes: Readonly<Record<string, RegistryNode>>; readonly tokens: ReadonlySet<object> };
const registryStates = new WeakMap<object, RegistryState>();
export function registryState(registry: object): Omit<RegistryState, "tokens"> {
  const state = registryStates.get(registry);
  if (!state) throw new TypeError("Unknown registry token.");
  return Object.freeze({ name: state.name, version: state.version, nodes: state.nodes });
}
export function checkMembership(registry: object, command: object): void {
  if (!registryStates.get(registry)?.tokens.has(command)) throw new TypeError("Command is not a registry member.");
}
const commandClis = new WeakMap<object, object>();
/** Most recent registration is the default owner for the command-only lazy helper. */
export function commandCli<Contexts>(command: object): import("../runtime/index.js").Cli<Contexts> {
  const cli = commandClis.get(command);
  if (!cli) throw new TypeError("expectLazy requires a registered command.");
  return cli as import("../runtime/index.js").Cli<Contexts>;
}
const cliRegistries = new WeakMap<object, object>();
const cliConfigurations = new WeakMap<object, unknown>();
export function retainCli<Contexts, D extends ErrorDefinitions, G extends Readonly<Record<string, Flag>>>(options: CliOptions<Contexts, D, G>): import("../runtime/index.js").Cli<Contexts> {
  const registry = register(options);
  const cli = Object.freeze({}) as import("../runtime/index.js").Cli<Contexts>;
  cliRegistries.set(cli, registry);
  for (const command of options.commands) commandClis.set(command, cli);
  cliConfigurations.set(cli, Object.freeze({ ...options,
    commands: Object.freeze([...options.commands]),
    ...(options.groups ? { groups: Object.freeze([...options.groups]) } : {}),
    ...(options.flows ? { flows: Object.freeze([...options.flows]) } : {}),
    contexts: Object.freeze({ ...options.contexts }),
    output: Object.freeze({ ...options.output, artifacts: "resolve" in options.output.artifacts
      ? Object.freeze({ resolve: options.output.artifacts.resolve }) : frozenJson(options.output.artifacts) }),
    ...(options.documentation ? { documentation: frozenJson(options.documentation) } : {}),
    ...(options.guidance ? { guidance: Object.freeze({ ...options.guidance }) } : {}),
    ...(options.helpContext ? { helpContext: Object.freeze({ ...options.helpContext }) } : {}),
  }));
  return cli;
}
export function cliRegistry<Contexts>(cli: import("../runtime/index.js").Cli<Contexts>): Registry<Contexts> {
  const registry = cliRegistries.get(cli);
  if (!registry) throw new TypeError("Unknown CLI token.");
  return registry as Registry<Contexts>;
}

/** Lazy guidance calls this after loading rules; registration never imports them. */
export function checkRuleReferences(registry: object, rules: readonly { readonly id: string; readonly appliesTo: readonly object[] }[]): void {
  registryState(registry);
  if (!Array.isArray(rules)) throw new TypeError("Expected rule reference inventory.");
  const ids = new Set<string>();
  for (const rule of rules) {
    assertIdentifier(rule.id);
    if (ids.has(rule.id)) throw new TypeError("Duplicate rule id."); ids.add(rule.id);
    if (!Array.isArray(rule.appliesTo) || !rule.appliesTo.length) throw new TypeError("Missing rule references.");
    for (const command of rule.appliesTo) checkMembership(registry, command);
  }
}

/** Composition retrieves retained configuration only after checking the CLI token. */
export function cliConfiguration<Contexts>(cli: import("../runtime/index.js").Cli<Contexts>): CliOptions<Contexts, ErrorDefinitions, Readonly<Record<string, Flag>>> {
  const options = cliConfigurations.get(cli);
  if (!options) throw new TypeError("Unknown CLI token.");
  // Erase only the catalog/global generics lost by public Cli<Contexts>, after
  // checking identity. Runtime uses the retained family's validated input model.
  return options as CliOptions<Contexts, ErrorDefinitions, Readonly<Record<string, Flag>>>;
}

/** Current-CLI validation is required even when a target is registered elsewhere. */
export function validateInvocation(registry: object, reference: import("../commands.js").Invocation): void {
  const target = invocationTarget(reference);
  checkMembership(registry, target.command);
  const node = registryState(registry).nodes[reference.path];
  if (!node || node.command !== target.command || (node.kind === "validation") !== target.validation) throw new TypeError("Invocation does not match its registry target.");
}
/** Detached JSON references regain provenance only through complete input validation. */
export function rebindInvocation(registry: object, value: unknown): import("../commands.js").Invocation {
  // Live references must retain their original family membership, even if another
  // registry happens to install an identically spelled command.
  if (typeof value === "object" && value !== null && hasInvocationProvenance(value)) {
    const reference = value as import("../commands.js").Invocation;
    validateInvocation(registry, reference); return reference;
  }
  const reference = frozenJson(value); assertInvocation(reference);
  const state = registryState(registry); const node = state.nodes[reference.path];
  if (!node?.model || !node.command) throw new TypeError("Unknown invocation target.");
  const model = node.model;
  if (reference.effects !== (node.kind === "validation" ? "read" : model.spec.effects)) throw new TypeError("Mismatched invocation effects.");
  if (reference.passthrough !== undefined && !model.spec.passthrough) throw new TypeError("Undeclared passthrough.");
  const flags: Record<string, string | number | boolean | readonly (string | number)[]> = Object.create(null);
  for (const [name, value] of Object.entries(reference.flags)) {
    const entry = model.flags[name];
    if (!entry || ["help", "version", "json"].includes(name)) throw new TypeError("Unknown invocation flag.");
    if (entry.definition.secret) throw new TypeError("Invocation cannot include secret flags.");
    if (entry.definition.repeatable ? !Array.isArray(value) : Array.isArray(value)) throw new TypeError("Mismatched invocation flag cardinality.");
    for (const item of Array.isArray(value) ? value : [value]) scalar(entry.definition.value, item);
    if (["domain", "global", "file"].includes(entry.help.source)) flags[name] = value;
  }
  const parsed = parseTokens(state.nodes, referenceTokens(reference, model.spec.passthrough === true));
  if (parsed.kind !== "leaf" || parsed.node !== node) throw new TypeError("Invocation does not resolve to its declared target.");
  const input = parsed.input;
  // Parsed defaults are resolved values, not evidence of supplied positional slots.
  const args: Record<string, CheckedInput["args"][string]> = Object.create(null);
  let offset = 0;
  for (const arg of model.spec.args) {
    if (offset >= reference.args.length) break;
    if (!Object.hasOwn(input.args, arg.name)) throw new TypeError("Missing parsed positional assignment.");
    args[arg.name] = input.args[arg.name]!;
    offset = arg.variadic ? reference.args.length : offset + 1;
  }
  const caller = { args, flags, ...(input.file !== undefined ? { file: input.file } : {}),
    ...(input.level !== undefined ? { level: input.level } : {}), ...(input.out !== undefined ? { out: input.out } : {}),
    ...(input.passthrough !== undefined ? { passthrough: input.passthrough } : {}) };
  // The node carries a command identity already verified by registration.
  const rebound = makeInvocation(node.command as Pick<Command, "spec" | "globalFlags">, caller, node.kind === "validation");
  const reparsed = parseTokens(state.nodes, invocationArgv(rebound));
  if (reparsed.kind !== "leaf" || reparsed.node !== node || serializedJson(reparsed.input) !== serializedJson(input)) {
    throw new TypeError("Rebound invocation changes its parsed inputs.");
  }
  return rebound;
}
