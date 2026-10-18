import type { Cli, ReferenceHost, ReferenceOptions, ReferenceValidation, ReferenceIssue, ReferenceWriteResult } from "../runtime/index.js";
import { bytes } from "../values.js";
import { referencePaths, renderCommandReference } from "./help.js";
import { sameBytes } from "./host.js";
import { cliConfiguration, cliRegistry, registryState } from "./registry.js";
import { commandData } from "./declarations.js";
import { defaultExport, payloadModule, schemaResult } from "./runner-modules.js";
import { thrownName } from "./validation.js";
import type { Issue } from "../results.js";

export async function referenceHost(options: ReferenceOptions): Promise<ReferenceHost> {
  options.signal.throwIfAborted();
  if (options.host) return typeof options.host === "function" ? options.host() : options.host;
  const { createReferenceHost } = await import("./reference-host.js");
  return createReferenceHost();
}
export async function checkReferences<Contexts>(cli: Cli<Contexts>, options: ReferenceOptions): Promise<ReferenceValidation> {
  options.signal.throwIfAborted();
  const config = cliConfiguration(cli);
  const documented = new Set(referencePaths(cli, options));
  // A twin shares its command's skills and examples; check them once under the command's path.
  const owners = new Set<string>();
  const nodes = Object.values(registryState(cliRegistry(cli)).nodes).filter(node => {
    if (!documented.has(node.path)) return false;
    const owner = node.kind === "validation" ? node.model!.spec.path : node.path;
    if (owners.has(owner)) return false;
    owners.add(owner);
    return true;
  });
  const issues: ReferenceIssue[] = [];
  let checked = 0;
  for (const node of nodes) if (node.command && node.model!.spec.payload) {
    checked += node.model!.spec.payload.examples.length;
    issues.push(...await checkPayloadExamples(node.command, options.signal));
  }
  const refs = nodes.flatMap(node => (node.group ?? node.model?.spec)?.skills
    ?.map(skill => ({ commandPath: node.model?.spec.path ?? node.path, reference: skill.path })) ?? []);
  checked += refs.length;
  if (refs.length) issues.push(...await checkSkills(config.documentation?.directory, refs, options));
  options.signal.throwIfAborted();
  return issues.length ? { ok: false, checked, issues: [issues[0]!, ...issues.slice(1)] } : { ok: true, checked, issues: [] };
}

/** Decode each declared example with the command's own lazy decoder. Loading the handler
 * module is the point; no runner is called and no context is acquired. */
async function checkPayloadExamples(command: object, signal: AbortSignal): Promise<readonly ReferenceIssue[]> {
  const { model, handler } = commandData(command);
  const spec = model.spec;
  signal.throwIfAborted();
  const loaded: unknown = await handler();
  signal.throwIfAborted();
  const decoder = payloadModule(defaultExport(loaded), spec.effects);
  const issues: ReferenceIssue[] = [];
  for (const [index, example] of spec.payload!.examples.entries()) {
    signal.throwIfAborted();
    const invalid = (found: readonly Issue[]): void => {
      issues.push({ code: "invalid_payload_example", commandPath: spec.path, reference: `payload.examples[${index}]`, issues: found });
    };
    let result: unknown;
    try { result = await decoder.decode["~standard"].validate(example.payload); }
    catch (error) {
      signal.throwIfAborted();
      invalid([{ code: "decoder", message: `The payload decoder threw ${thrownName(error) ?? "a non-Error value"} instead of returning schema issues.` }]);
      continue;
    }
    let decoded: ReturnType<typeof schemaResult>;
    try { decoded = schemaResult(result); }
    catch { invalid([{ code: "decoder", message: "The payload decoder returned a malformed result." }]); continue; }
    if (!decoded.ok) invalid(decoded.issues);
  }
  return issues;
}

async function checkSkills(directory: string | undefined, refs: readonly { readonly commandPath: string; readonly reference: string }[], options: ReferenceOptions): Promise<readonly ReferenceIssue[]> {
  const host = await referenceHost(options);
  const path = await import("node:path");
  const issues: ReferenceIssue[] = [];
  let root: string | undefined;
  if (directory) {
    root = await host.files.canonicalPath(directory);
    if (await host.files.kind(root) !== "directory") root = undefined;
  }
  for (const ref of refs) {
    options.signal.throwIfAborted();
    if (!root) { issues.push({ ...ref, code: "missing_documentation_root" }); continue; }
    // Canonical paths use native separators; a POSIX backslash is a filename byte.
    const prefix = root.endsWith(path.sep) ? root : root + path.sep;
    try {
      const canonical = await host.files.canonicalPath(path.join(root, ref.reference));
      if (!canonical.startsWith(prefix)) issues.push({ ...ref, code: "outside_documentation_root" });
      else if (await host.files.kind(canonical) !== "file") issues.push({ ...ref, code: "missing_reference" });
    } catch {
      options.signal.throwIfAborted();
      issues.push({ ...ref, code: "invalid_reference" });
    }
  }
  return issues;
}

/** Only the selected, unique whole-line marker pair is replaceable. The block is the
 * inserted text after newline normalization, excluding the marker lines. */
export function replaceMarker(document: string, marker: string, generated: string): { readonly document: string; readonly block: string } {
  if (!/^[A-Z][A-Z0-9 _-]{0,63}$/.test(marker)) throw new TypeError("Invalid reference marker name.");
  let active: string | undefined;
  const seen = new Set<string>();
  for (const match of document.matchAll(/^<!-- (BEGIN|END) GENERATED ([A-Z][A-Z0-9 _-]{0,63}) -->\r?$/gm)) {
    const name = match[2]!;
    if (match[1] === "BEGIN") {
      if (active !== undefined || seen.has(name)) throw new TypeError("Nested or duplicate reference markers.");
      active = name; seen.add(name);
    } else {
      if (active !== name) throw new TypeError("Stale or mismatched reference markers.");
      active = undefined;
    }
  }
  if (active !== undefined) throw new TypeError("Unclosed reference marker.");
  const start = `<!-- BEGIN GENERATED ${marker} -->`;
  const end = `<!-- END GENERATED ${marker} -->`;
  const starts = [...document.matchAll(new RegExp(`^${start}\\r?$`, "gm"))];
  const ends = [...document.matchAll(new RegExp(`^${end}\\r?$`, "gm"))];
  if (starts.length !== 1 || ends.length !== 1 || starts[0]!.index >= ends[0]!.index) throw new TypeError("Missing, duplicate or stale reference markers.");
  const first = starts[0]!;
  const last = ends[0]!;
  const offset = first.index + first[0].length;
  if (document[offset] !== "\n") throw new TypeError("Reference marker needs a following line.");
  const existing = document.slice(offset + 1, last.index);
  if (/<!-- (?:BEGIN|END) GENERATED /u.test(existing) || /<!-- (?:BEGIN|END) GENERATED /u.test(generated)) throw new TypeError("Nested reference markers are forbidden.");
  const newline = first[0].endsWith("\r") ? "\r\n" : "\n";
  const content = generated.replace(/\r?\n/g, newline);
  const block = content + (content.endsWith(newline) ? "" : newline);
  return { document: document.slice(0, offset + 1) + block + document.slice(last.index), block };
}

export async function writeReference<Contexts>(cli: Cli<Contexts>, options: ReferenceOptions & {
  readonly path: string; readonly marker: string; readonly mode: "write" | "check";
}): Promise<ReferenceWriteResult> {
  if (options.mode !== "write" && options.mode !== "check") throw new TypeError("Invalid reference mode.");
  const limit = bytes(options.maxBytes ?? 1048576);
  // Pure generation checks the selection before any host acquisition.
  const generated = renderCommandReference(cli, options);
  const host = await referenceHost(options);
  const validation = await checkReferences(cli, { ...options, host });
  if (!validation.ok) return { ...validation, changed: false };
  options.signal.throwIfAborted();
  const original = await host.files.read(options.path, limit, options.signal);
  const document = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(original);
  const updated = replaceMarker(document, options.marker, generated);
  const encoder = new TextEncoder();
  const data = encoder.encode(updated.document);
  const sizes = { generatedBytes: bytes(encoder.encode(updated.block).byteLength), documentBytes: bytes(data.byteLength), maxBytes: limit };
  if (data.byteLength > limit) throw new RangeError(`Generated reference document is ${sizes.documentBytes} bytes, including a ${sizes.generatedBytes}-byte generated block; the limit is ${limit} bytes.`);
  const changed = !sameBytes(original, data);
  options.signal.throwIfAborted();
  if (changed && options.mode === "write") {
    if (!host.files.replace) throw new TypeError("Reference write requires a replacement-capable host.");
    await host.files.replace(options.path, data, options.signal);
  }
  return { ...validation, changed, sizes };
}
