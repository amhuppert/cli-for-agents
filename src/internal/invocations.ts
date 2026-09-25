import type { Command, Invocation } from "../commands.js";
import type { Hint } from "../guidance/index.js";
import { hint } from "../guidance/index.js";
import { commandData } from "./declarations.js";
import { checkCaller, scalar } from "./input-model.js";
import type { Flag } from "../input.js";
import type { ParsedInvocation, Registry } from "./registry.js";
import { rebindInvocation, resolve } from "./registry.js";
import { assertInvocation, assertText, frozenJson, serializedJson } from "./validation.js";

/** An invocation is plain JSON. The registry resolves it by path when it is used,
 * so references survive JSON transport unchanged. Also used for createCli's doctor. */
export function makeInvocation(command: Pick<Command, "spec" | "globalFlags">, input: object, validation: boolean): Invocation {
  const data = commandData(command);
  const spec = data.model.spec;
  if (validation && (spec.effects !== "write" || !spec.payload)) throw new TypeError("Command has no validation twin.");
  const caller = frozenJson(input);
  const checked = checkCaller(data.model, caller, true);
  const flags: Record<string, string | number | boolean | readonly (string | number)[]> = { ...(caller as { flags?: Invocation["flags"] }).flags };
  if (checked.file !== undefined) flags["file"] = checked.file;
  if (checked.out !== undefined) flags["out"] = checked.out;
  if (checked.level !== undefined) for (const selector of data.model.selectors[checked.level]!) flags[selector] = true;
  const args: string[] = [];
  const suppliedArgs = (caller as { readonly args?: object }).args ?? {};
  let omitted = false;
  for (const arg of spec.args) {
    const value = Object.hasOwn(checked.args, arg.name) ? checked.args[arg.name] : undefined;
    if (value === undefined || Array.isArray(value) && value.length === 0) {
      omitted = true;
      continue;
    }
    if (omitted) {
      if (Object.hasOwn(suppliedArgs, arg.name)) throw new TypeError("Cannot supply a positional after an omitted positional.");
      // Leave later defaults omitted so parsing assigns them to their own names.
      continue;
    }
    args.push(...(Array.isArray(value) ? value : [value]).map(String));
  }
  checkPositionalTokens(args, spec.passthrough === true);
  const value = frozenJson<Pick<Invocation, "path" | "effects" | "args" | "flags" | "passthrough">>({ path: validation && spec.effects === "write" && spec.payload ? spec.payload.validatePath : spec.path,
    effects: validation ? "read" : spec.effects, args, flags,
    ...(checked.passthrough !== undefined ? { passthrough: checked.passthrough } : {}) });
  assertInvocation(value);
  return value as Invocation;
}

/** Advisory write suggested after a successful validation twin. It replays the parsed
 * inputs, never decoded file contents or environment values, and is omitted whenever
 * stdin, a supplied secret, passthrough tokens or the reference bound prevents a
 * faithful replay. Rebinding and reparsing prove the write parses to the same inputs. */
export function validationWriteHint<Contexts, Code extends string, G extends Readonly<Record<string, Flag>>>(
  registry: Registry<Contexts, Code, G>, parsed: ParsedInvocation<Contexts, Code, G>): Hint | undefined {
  try {
    const { model } = commandData(parsed.command);
    const { spec } = model;
    const { out: _out, ...input } = parsed.input;
    if (!parsed.validation || input.sources.some(source => source.path === "-") || input.passthrough?.length) return undefined;
    const flags: Record<string, unknown> = Object.create(null);
    for (const [name, entry] of Object.entries(model.flags)) {
      const values = entry.global ? input.globals : input.flags;
      if (!["domain", "global"].includes(entry.help.source) || !Object.hasOwn(values, name)) continue;
      if (entry.definition.secret) return undefined;
      const value = values[name]!;
      // The parser restores defaults and empty repeats, so they need no tokens.
      const defaulted = entry.definition.default !== undefined && value === scalar(entry.definition.value, entry.definition.default);
      if (!defaulted && !(Array.isArray(value) && value.length === 0)) flags[name] = value;
    }
    for (const source of input.sources) {
      if (source.kind !== "argument" && source.kind !== "payload" && model.flags[source.name]?.definition.fileSource) flags[`${source.name}-file`] = source.path;
    }
    // Stop at the first omitted positional slot; parsing restores any later defaults.
    const args: Record<string, unknown> = Object.create(null);
    for (const arg of spec.args) {
      const value = Object.hasOwn(input.args, arg.name) ? input.args[arg.name] : undefined;
      if (value === undefined || Array.isArray(value) && value.length === 0) break;
      args[arg.name] = value;
    }
    const caller = { args, flags, file: input.file, ...(spec.passthrough ? { passthrough: [] } : {}) };
    const write = rebindInvocation(registry, makeInvocation(parsed.command, caller, false));
    const replayed = resolve(registry, invocationArgv(write));
    if (replayed.kind !== "leaf" || serializedJson(replayed.invocation.input) !== serializedJson(input)) return undefined;
    return hint(write, "Apply the validated payload");
  } catch { return undefined; }
}

/** argv construction and shell rendering share exactly these token boundaries.
 * A passthrough command always carries its passthrough tokens, possibly empty. */
export function invocationArgv(reference: Invocation): readonly string[] {
  return referenceTokens(reference, reference.passthrough !== undefined);
}
/** Also used after detached reference shape validation at the registry boundary. */
export function referenceTokens(reference: Pick<Invocation, "path" | "args" | "flags" | "passthrough">, passthrough: boolean): readonly string[] {
  checkPositionalTokens(reference.args, passthrough);
  const tokens = reference.path.split(" ");
  for (const [name, value] of Object.entries(reference.flags)) {
    for (const item of Array.isArray(value) ? value : [value]) tokens.push(item === true ? `--${name}` : `--${name}=${String(item)}`);
  }
  if (reference.args.length) {
    if (!passthrough) tokens.push("--");
    tokens.push(...reference.args);
  }
  if (reference.passthrough?.length) tokens.push("--", ...reference.passthrough);
  return Object.freeze(tokens);
}

/** Shape-checked rendering; current-registry rebinding is caller-owned. */
export function renderReference(reference: Invocation, executable: string): import("../values.js").ShellSafe {
  assertInvocation(reference);
  return renderTokens(referenceTokens(reference, reference.passthrough !== undefined), executable);
}

function renderTokens(tokens: readonly string[], executable: string): import("../values.js").ShellSafe {
  assertText(executable);
  const quote = (token: string, force = false): string => !force && /^[a-zA-Z0-9_@%+=:,./-]+$/.test(token) ? token : `'${token.replaceAll("'", "'\\''")}'`;
  // Brand only the result assembled from individually quoted, checked tokens.
  const reserved = ["if", "then", "else", "elif", "fi", "do", "done", "case", "esac", "while", "until", "for", "in", "time", "function", "select", "coproc"];
  return [quote(executable, executable.includes("=") || reserved.includes(executable)),
    ...tokens.map(token => quote(token))].join(" ") as import("../values.js").ShellSafe;
}

/** Protect the positional/passthrough boundary before tokens enter the parser. */
function checkPositionalTokens(args: readonly string[], passthrough: boolean): void {
  if (passthrough && args.some(token => token.startsWith("-") && token !== "-" && !/^-[0-9]+$/.test(token))) {
    throw new TypeError("Leading-dash positional cannot be rendered with passthrough enabled.");
  }
}
