import assert from "node:assert/strict";
import test from "node:test";
import { bytes } from "cli-for-agents";
import { measureOutput, validateOutputBudget } from "../dist/internal/artifacts.js";

test("output budget defaults to 32768 and accepts the 8192-byte floor", () => {
  assert.equal(validateOutputBudget(), 32768);
  assert.equal(validateOutputBudget(bytes(8192)), 8192);
  assert.equal(validateOutputBudget(bytes(50000)), 50000);
});
test("pre-execution budget validation rejects impossible and malformed configuration", () => {
  // Hostile JavaScript deliberately bypasses branded configuration types.
  for (const value of [0, 8191, -1, 8192.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "8192", null]) {
    assert.throws(() => validateOutputBudget(value), /8192|safe integer/);
  }
});
test("measurement counts both serialized UTF-8 streams including framing and escapes", () => {
  for (const value of ["é", "😀", '"\\\n\u0000', "\ud800", "\u2028"]) {
    const stdout = `${JSON.stringify({ value })}\n`;
    const stderr = "diagnostic: é\n";
    assert.equal(measureOutput({ stdout, stderr }), Buffer.byteLength(stdout) + Buffer.byteLength(stderr));
  }
});
test("UTF-8 and JSON escaping thresholds distinguish one byte around the floor", () => {
  for (const special of ["😀", '"\\\n', "é"]) {
    const prefix = JSON.stringify({ value: special }).slice(0, -2);
    for (const delta of [-1, 0, 1]) {
      const stdout = `${prefix}${"x".repeat(8192 + delta - Buffer.byteLength(prefix) - 3)}"}\n`;
      assert.equal(measureOutput({ stdout, stderr: "" }), 8192 + delta);
      assert.doesNotThrow(() => JSON.parse(stdout));
    }
  }
});

import { commandsFor, defineErrors, invocation, recoveryFacts } from "cli-for-agents";
import { createCli, decodeEnvelope } from "cli-for-agents/runtime";
import { createTestHost } from "cli-for-agents/testing";
import { instruction } from "cli-for-agents/guidance";
import { arbitrate, assembleResponse, renderResponse } from "../dist/internal/response.js";
import { deliver } from "../dist/internal/artifacts.js";
const errors = defineErrors({ OFFLINE: { exitClass: "connection", description: "Unavailable." }, USAGE: { exitClass: "usage", description: "Invalid input." } });
const family = commandsFor()({ errors, globalFlags: {} });
const doctorCommand = family.defineCommand({ path: "doctor", summary: "Inspect", description: "Inspect", requires: "none", effects: "read", args: [{ name: "target", description: "Target", value: { kind: "string" }, required: false }], flags: {} }, { examples: [{ why: "Inspect" }], handler: async () => { throw Error("Unused"); } });
const doctor = invocation(doctorCommand, {});
createCli({ name: "tool", version: "1", family, commands: [doctorCommand], contexts: {}, doctor, output: { artifacts: { directory: "/unused", forbiddenRoots: [] } } });
const receipt = recoveryFacts([{ kind: "receipt", id: "saved-123" }]);
async function response({ data = { value: "small" }, error, operation = { effect: "read" }, text = JSON.stringify(data), guidance = {}, secondary = [], doctorRef = doctor, executable = "tool" } = {}) {
  return assembleResponse({ result: error ? { ok: false, error, data } : { ok: true, data }, operation, renderPrimary: () => text }, { guidance: await arbitrate({ commandPath: "doctor", handler: guidance, candidates: [], conflictSink: () => {} }), doctor: doctorRef, executable, secondary });
}
const options = (format = "json", extra = {}) => ({ format, budget: bytes(8192), host: createTestHost(), signal: new AbortController().signal, ...extra });
function bounded(result, format, exitCode) {
  assert.ok(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) <= 8192);
  assert.equal(result.exitCode, exitCode);
  assert.equal(format === "json" || exitCode === 0 ? result.stderr : result.stdout, "");
  if (format === "json") return decodeEnvelope(JSON.parse(result.stdout));
}
for (const format of ["json", "text"]) {
  test(`${format} delivers small success and usage/failure with exact stream routing`, async () => {
    for (const [error, exit] of [[undefined, 0], [errors.error("USAGE", { message: "Bad flag" }), 2], [errors.error("OFFLINE", { message: "Disconnected" }), 3]]) {
      const assembled = await response({ error });
      const result = await Promise.resolve().then(() => deliver(assembled, options(format))).catch(() => undefined);
      assert.ok(result, "delivery must return a bounded response");
      bounded(result, format, exit);
      assert.deepEqual(result, renderResponse(assembled, format));
    }
  });
  test(`${format} omits oversized optional detail explicitly and preserves required protocol`, async () => {
    const assembled = await response({ data: { secretBody: "x".repeat(30000) }, operation: { effect: "applied", recovery: receipt }, guidance: { instruction: instruction("owner", "Stop and inspect saved state.") } });
    const result = await deliver(assembled, options(format));
    const wire = bounded(result, format, 0);
    assert.match(result.stdout, /Stop and inspect saved state/);
    assert.match(result.stdout, /saved-123/);
    assert.match(result.stdout, /omitted/i);
    assert.doesNotMatch(result.stdout, /xxxxxxxx/);
    if (wire) assert.deepEqual(wire.recovery, receipt);
  });
  test(`${format} bounds huge error detail and diagnostics without changing exit 3`, async () => {
    const error = errors.error("OFFLINE", { message: "Disconnected", details: { private: "q".repeat(40000) }, issues: Array.from({ length: 300 }, () => ({ code: "DETAIL", message: "Optional information" })) });
    const assembled = await response({ error, operation: { effect: "unknown", recovery: { kind: "unknown_acknowledgment", commandPath: "doctor", advice: "inspect_before_retry" } }, guidance: { instruction: instruction("owner", "Stop.") } });
    const result = await deliver(assembled, options(format));
    const wire = bounded(result, format, 3);
    assert.match(result.stdout + result.stderr, /OFFLINE/);
    assert.match(result.stdout + result.stderr, /inspect_before_retry/);
    assert.match(result.stdout + result.stderr, /omitted/i);
    if (wire) { assert.equal(wire.error.code, "OFFLINE"); assert.equal(wire.error.doctor.path, "doctor"); }
  });
}
test("inline JSON is retained at the exact byte bound and omitted one byte above it", async () => {
  const base = await response({ data: "" });
  const overhead = Buffer.byteLength(renderResponse(base, "json").stdout);
  for (const delta of [-1, 0, 1]) {
    const data = "😀" + '"\\' + "x".repeat(8192 + delta - overhead - 8);
    const assembled = await response({ data });
    assert.equal(Buffer.byteLength(renderResponse(assembled, "json").stdout), 8192 + delta);
    const wire = bounded(await deliver(assembled, options()), "json", 0);
    if (delta <= 0) assert.equal(wire.payload.data, data);
    else assert.match(JSON.stringify(wire), /omitted/);
  }
});
test("compact text preserves apostrophe-heavy argv when ordinary shell expansion cannot fit", async () => {
  const token = "'".repeat(900);
  const doctorRef = invocation(doctorCommand, { args: { target: token } });
  const assembled = await response({ error: errors.error("OFFLINE", { message: "Disconnected" }), doctorRef, executable: "'".repeat(2000), data: "x".repeat(20000), guidance: { instruction: instruction("owner", "Stop.") } });
  const result = await deliver(assembled, options("text"));
  bounded(result, "text", 3);
  const line = result.stderr.split("\n").find(line => line.startsWith("doctor argv: "));
  assert.ok(line, "emergency reference must disclose structured argv for the current executable");
  assert.deepEqual(JSON.parse(line.slice("doctor argv: ".length)), ["doctor", "--", token]);
});
test("text success retains applied effect and receipt even when custom primary omits them", async () => {
  const result = await deliver(await response({ operation: { effect: "applied", recovery: receipt }, text: "Saved" }), options("text"));
  bounded(result, "text", 0);
  assert.match(result.stdout, /effect: applied\nrecovery: .*saved-123/);
});

import { kernelErrors } from "../dist/results.js";

function fill(limit, shape, character = "x") {
  let value = "";
  while (Buffer.byteLength(JSON.stringify(shape(value + character))) <= limit) value += character;
  return shape(value);
}
for (const character of ["'", "\\", "\u2028", "😀"]) {
  for (const format of ["json", "text"]) {
    test(`${format} reservation fits all maximum protocol groups with ${JSON.stringify(character)}`, async () => {
      // Transport fixtures use the real strict decoder; no manifest filesystem
      // provenance is claimed. The next task tests manifests from atomic writes.
      const recovery = recoveryFacts([{ kind: "receipt", id: fill(1024, id => ({ kind: "reported", references: [{ kind: "receipt", id }] }), character.trim() ? character : "😀").references[0].id }]);
      const references = fill(1024, target => ({ doctor: { path: "doctor", effects: "read", args: [target], flags: {} } }), character);
      const manifest = fill(2048, tail => ({ path: `/artifacts/${tail}`, format: "json", mediaType: "application/json", bytes: 20000, sha256: "a".repeat(64), reason: "stdout_budget_exceeded", contains: "response" }), character);
      const base = await response();
      const wire = decodeEnvelope({ ok: false, effect: "applied", recovery,
        instruction: fill(1024, value => "a" + value, character), reminders: fill(1024, value => ["a" + value], character),
        payload: { kind: "artifact", artifact: manifest, summary: "x".repeat(20000) },
        error: { code: "E".repeat(510), exitClass: "connection", message: fill(512, value => "a" + value, character), why: fill(512, value => "a" + value, character), ...references, secondary: Object.keys(kernelErrors).flatMap(code => Array.from({ length: 30 }, () => ({ code, message: "x".repeat(510) }))), details: "x".repeat(20000) } });
      const result = await deliver({ ...base, envelope: wire, executable: "'".repeat(2000), primaryText: "x".repeat(20000) }, options(format));
      const decoded = bounded(result, format, 3);
      const failed = await deliver({ ...base, envelope: wire, executable: "'".repeat(2000), primaryText: "x".repeat(20000) }, options(format, { out: "unavailable" }));
      const failedWire = bounded(failed, format, 3);
      if (failedWire) {
        assert.deepEqual(failedWire.payload.artifact, manifest);
        assert.deepEqual(new Set(failedWire.error.secondary.map(item => item.code)), new Set(Object.keys(kernelErrors)));
      }
      if (decoded) {
        assert.deepEqual(new Set(decoded.error.secondary.map(item => item.code)), new Set(Object.keys(kernelErrors)));
        assert.equal(decoded.error.why, wire.error.why);
        assert.equal(decoded.error.code, wire.error.code);
        assert.equal(decoded.instruction, wire.instruction);
        assert.deepEqual(decoded.reminders, wire.reminders);
        assert.deepEqual(decoded.recovery, wire.recovery);
        assert.deepEqual(decoded.error.doctor, wire.error.doctor);
        assert.deepEqual(decoded.payload.artifact, manifest);
      } else {
        for (const code of Object.keys(kernelErrors)) assert.ok(result.stderr.includes(code));
        assert.ok(result.stderr.includes(wire.error.code));
        assert.ok(result.stderr.includes(manifest.sha256));
      }
    });
  }
}
test("required ingress overflow is rejected instead of truncating instructions or recovery", async () => {
  assert.throws(() => instruction("owner", "x".repeat(1024)), /byte limit/);
  assert.throws(() => recoveryFacts([{ kind: "receipt", id: "x".repeat(1024) }]), /byte limit/);
  const base = (await response()).envelope;
  for (const fields of [{ instruction: "x".repeat(1024) }, { reminders: ["x".repeat(1024)] }]) {
    assert.throws(() => decodeEnvelope({ ...base, ...fields }), /byte limit/);
  }
});

import { mkdtemp, mkdir, symlink, realpath, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { nodeHost } from "cli-for-agents/runtime";
import { resolveArtifactPolicy, writeArtifact } from "../dist/internal/artifacts.js";
const signal = new AbortController().signal;
const artifactRequest = (extra = {}) => ({ bytes: new TextEncoder().encode('é😀\n'), format: "json", mediaType: "application/json", basename: "data.json", reason: "stdout_budget_exceeded", contains: "data", ...extra });
async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "delivery-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "artifacts");
  const forbidden = path.join(root, "dataset");
  await mkdir(directory); await mkdir(forbidden);
  return { root, directory, forbidden, host: await nodeHost() };
}
test("policy resolution freezes an app-free canonical snapshot with retention off by default", async t => {
  const { root, directory, forbidden, host } = await fixture(t);
  await symlink(directory, path.join(root, "alias"));
  let open = true;
  let calls = 0;
  const source = { async resolve({ app, env }) { calls++; assert.equal(app.open, true); return { directory: env.OUT, forbiddenRoots: [forbidden] }; } };
  // Runtime composition owns invoking app/env resolution before release.
  assert.equal(calls, 0);
  const policyInput = await source.resolve({ app: { open }, env: { OUT: path.join(root, "alias") } });
  const policy = await Promise.resolve().then(() => resolveArtifactPolicy(policyInput, host)).catch(() => undefined);
  assert.ok(policy, "policy must resolve while application is still open");
  open = false;
  policyInput.forbiddenRoots.length = 0;
  assert.equal(policy.directory, directory);
  assert.deepEqual(policy.forbiddenRoots, [forbidden]);
  assert.equal(Object.hasOwn(policy, "retention"), false);
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.forbiddenRoots), true);
  assert.deepEqual(Object.keys(policy).sort(), ["directory", "forbiddenRoots"]);
  await writeArtifact(artifactRequest(), policy, host, signal);
  assert.equal(calls, 1);
});
test("policy rejects forbidden directories, invalid retention and non-directory roots", async t => {
  const { root, directory, forbidden, host } = await fixture(t);
  await writeFile(path.join(root, "file"), "x");
  for (const input of [
    { directory: forbidden, forbiddenRoots: [forbidden] },
    { directory, forbiddenRoots: [root] },
    { directory: path.join(root, "missing"), forbiddenRoots: [] },
    { directory: path.join(root, "file"), forbiddenRoots: [] },
    { directory, forbiddenRoots: [], retention: { maxAgeMs: -1 } },
    { directory, forbiddenRoots: [], retention: { maxAgeMs: Infinity } },
  ]) await assert.rejects(async () => resolveArtifactPolicy(input, host));
  const policy = await resolveArtifactPolicy({ directory, forbiddenRoots: [], retention: { maxAgeMs: 1000 } }, host);
  assert.equal(policy.retention.maxAgeMs, 1000);
  assert.equal(Object.isFrozen(policy.retention), true);
});
test("atomic manifests report absolute canonical paths and true bytes/hash/content", async t => {
  const { directory, forbidden, host } = await fixture(t);
  const policy = await resolveArtifactPolicy({ directory, forbiddenRoots: [forbidden] }, host);
  const request = artifactRequest();
  const manifest = await writeArtifact(request, policy, host, signal);
  assert.equal(path.dirname(manifest.path), directory);
  assert.equal(manifest.bytes, request.bytes.length);
  assert.equal(manifest.sha256, createHash("sha256").update(request.bytes).digest("hex"));
  assert.equal(manifest.format, "json"); assert.equal(manifest.contains, "data");
  assert.equal(manifest.mediaType, "application/json");
  assert.deepEqual(new Uint8Array(await readFile(manifest.path)), request.bytes);
  assert.equal(Object.isFrozen(manifest), true);
  assert.ok(Buffer.byteLength(JSON.stringify(manifest)) <= 2048);
  assert.deepEqual(await writeArtifact(request, policy, host, signal), manifest);
  assert.deepEqual(await readdir(directory), [path.basename(manifest.path)]);
});
test("explicit out refuses unrelated collisions and reuses matching files without clobber", async t => {
  const { directory, host } = await fixture(t);
  const policy = await resolveArtifactPolicy({ directory, forbiddenRoots: [] }, host);
  const request = artifactRequest({ out: "chosen.json", reason: "explicit_out" });
  const manifest = await writeArtifact(request, policy, host, signal);
  assert.equal(manifest.path, path.join(directory, "chosen.json"));
  assert.deepEqual(await writeArtifact(request, policy, host, signal), manifest);
  await assert.rejects(() => writeArtifact({ ...request, bytes: new Uint8Array([1]) }, policy, host, signal), /collision/i);
  assert.deepEqual(new Uint8Array(await readFile(manifest.path)), request.bytes);
  assert.deepEqual(await readdir(directory), ["chosen.json"]);
});
test("canonical containment rejects symlink ancestors, forbidden aliases and prefix lookalikes", async t => {
  const { root, directory, forbidden, host } = await fixture(t);
  const lookalike = directory + "-other";
  await mkdir(lookalike);
  await symlink(forbidden, path.join(directory, "escape"));
  await symlink(forbidden, path.join(root, "forbidden-alias"));
  const policy = await resolveArtifactPolicy({ directory, forbiddenRoots: [path.join(root, "forbidden-alias")] }, host);
  for (const out of ["escape/new.json", path.join(forbidden, "new.json"), path.join(lookalike, "new.json"), "../dataset/new.json"]) {
    await assert.rejects(() => writeArtifact(artifactRequest({ out }), policy, host, signal), /outside|forbidden/i);
  }
  assert.deepEqual(await readdir(forbidden), []);
  assert.deepEqual(await readdir(lookalike), []);
});
test("automatic spills contain the entire response; explicit JSON out contains only data", async t => {
  const { directory, host } = await fixture(t);
  const artifacts = await resolveArtifactPolicy({ directory, forbiddenRoots: [] }, host);
  const assembled = await response({ data: { rows: "x".repeat(30000) }, guidance: { instruction: instruction("owner", "Stop.") } });
  for (const out of [undefined, "data.json"]) {
    const wire = bounded(await deliver(assembled, options("json", { host, artifacts, ...(out ? { out } : {}) })), "json", 0);
    assert.equal(wire.payload.kind, "artifact");
    const artifact = wire.payload.artifact;
    const content = JSON.parse(await readFile(artifact.path, "utf8"));
    assert.deepEqual(content, out ? assembled.envelope.payload.data : assembled.envelope);
    assert.equal(artifact.contains, out ? "data" : "response");
    assert.equal(artifact.reason, out ? "explicit_out" : "stdout_budget_exceeded");
    assert.equal(wire.instruction, "Stop.");
  }
});
test("writer snapshots bytes before awaiting host operations and refuses malformed hashes", async () => {
  const host = createTestHost({ files: { "/artifacts/seed": "keep" } });
  const policy = await resolveArtifactPolicy({ directory: "/artifacts", forbiddenRoots: [] }, host);
  const request = artifactRequest();
  const expected = new Uint8Array(request.bytes);
  const writing = writeArtifact(request, policy, host, signal);
  request.bytes.fill(0);
  const manifest = await writing;
  assert.deepEqual(host.filesSnapshot()[manifest.path], expected);
  const badHost = { ...host, sha256: async () => "invalid" };
  const before = host.calls.filter(call => call.kind === "write").length;
  await assert.rejects(() => writeArtifact(artifactRequest(), policy, badHost, signal), /hash|digest/i);
  assert.equal(host.calls.filter(call => call.kind === "write").length, before);
  assert.equal(host.filesSnapshot()["/artifacts/seed"].length, 4);
});
test("untyped callers cannot forge a resolved policy or mutate a retained one", async () => {
  const host = createTestHost({ files: { "/artifacts/seed": "keep" } });
  const raw = { directory: "/artifacts", forbiddenRoots: [] };
  await assert.rejects(() => writeArtifact(artifactRequest(), raw, host, signal), /resolved policy/i);
  const policy = await resolveArtifactPolicy(raw, host);
  assert.throws(() => { policy.directory = "/outside"; }, TypeError);
  assert.throws(() => { policy.forbiddenRoots.push("/"); }, TypeError);
});
test("symlinks inside the allowed directory retain canonical destinations; nested forbidden roots refuse writes", async t => {
  const { directory, host } = await fixture(t);
  await mkdir(path.join(directory, "nested"));
  await symlink(path.join(directory, "nested"), path.join(directory, "alias"));
  const allowed = await resolveArtifactPolicy({ directory, forbiddenRoots: [] }, host);
  const manifest = await writeArtifact(artifactRequest({ out: "alias/file.json" }), allowed, host, signal);
  assert.equal(manifest.path, path.join(directory, "nested/file.json"));
  const blocked = await resolveArtifactPolicy({ directory, forbiddenRoots: [path.join(directory, "alias")] }, host);
  await assert.rejects(() => writeArtifact(artifactRequest({ out: "nested/other.json" }), blocked, host, signal), /forbidden/i);
  assert.deepEqual(await readdir(path.join(directory, "nested")), ["file.json"]);
});

for (const mode of ["node", "test"]) {
  test(`${mode} opt-in retention expires old automatic artifacts and preserves explicit/unrelated files`, async t => {
    const setup = mode === "node" ? await fixture(t) : { directory: "/artifacts", host: createTestHost({ files: { "/artifacts/unrelated": "keep" } }) };
    let clock = Date.now();
    const host = { ...setup.host, now: () => clock };
    const { directory } = setup;
    if (mode === "node") await writeFile(path.join(directory, "unrelated"), "keep");
    const policy = await resolveArtifactPolicy({ directory, forbiddenRoots: [], retention: { maxAgeMs: 1000 } }, host);
    const old = await writeArtifact(artifactRequest(), policy, host, signal);
    const explicit = await writeArtifact(artifactRequest({ out: "saved.json", reason: "explicit_out" }), policy, host, signal);
    clock += 10000;
    const fresh = await writeArtifact(artifactRequest({ bytes: new Uint8Array([9]) }), policy, host, signal);
    assert.equal(await host.files.kind(old.path), "missing", "expired automatic file must be removed");
    assert.equal(await host.files.kind(explicit.path), "file");
    assert.equal(await host.files.kind(path.join(directory, "unrelated")), "file");
    assert.equal(await host.files.kind(fresh.path), "file");
  });
}
test("retention disabled performs no listing or deletion, even for previously managed artifacts", async () => {
  const host = createTestHost({ files: { "/artifacts/seed": "keep" } });
  const enabled = await resolveArtifactPolicy({ directory: "/artifacts", forbiddenRoots: [], retention: { maxAgeMs: 1 } }, host);
  const old = await writeArtifact(artifactRequest(), enabled, host, signal);
  host.advance(10000);
  const disabled = await resolveArtifactPolicy({ directory: "/artifacts", forbiddenRoots: [] }, host);
  const before = host.calls.filter(call => call.kind === "retention-list" || call.kind === "retention-remove").length;
  await writeArtifact(artifactRequest({ bytes: new Uint8Array([1]) }), disabled, host, signal);
  assert.equal(host.calls.filter(call => call.kind === "retention-list" || call.kind === "retention-remove").length, before);
  assert.equal(await host.files.kind(old.path), "file");
});
test("explicit out adopts an automatic path permanently before subsequent expiration", async () => {
  const host = createTestHost({ files: { "/artifacts/seed": "keep" } });
  const policy = await resolveArtifactPolicy({ directory: "/artifacts", forbiddenRoots: [], retention: { maxAgeMs: 1 } }, host);
  const automatic = await writeArtifact(artifactRequest(), policy, host, signal);
  await writeArtifact(artifactRequest({ out: automatic.path, reason: "explicit_out" }), policy, host, signal);
  host.advance(10000);
  await writeArtifact(artifactRequest({ bytes: new Uint8Array([2]) }), policy, host, signal);
  assert.equal(await host.files.kind(automatic.path), "file");
});
test("retention requires host cleanup support instead of silently ignoring maxAgeMs", async () => {
  const host = createTestHost({ files: { "/artifacts/seed": "keep" } });
  const unsupported = { ...host, files: { ...host.files, retention: undefined } };
  await assert.rejects(() => resolveArtifactPolicy({ directory: "/artifacts", forbiddenRoots: [], retention: { maxAgeMs: 1 } }, unsupported), /retention/i);
});
test("retention refuses symlinked metadata and leaves replaced or unrelated contents intact", async t => {
  const { directory, forbidden, host: base } = await fixture(t);
  let clock = Date.now();
  const host = { ...base, now: () => clock };
  const off = await resolveArtifactPolicy({ directory, forbiddenRoots: [forbidden] }, host);
  const old = await writeArtifact(artifactRequest(), off, host, signal);
  const marker = old.path + ".agent-cli-retention.json";
  await symlink(path.join(forbidden, "outside.json"), marker);
  const on = await resolveArtifactPolicy({ directory, forbiddenRoots: [forbidden], retention: { maxAgeMs: 1 } }, host);
  await assert.rejects(() => writeArtifact(artifactRequest(), on, host, signal), /metadata|canonical|symlink/i);
  assert.deepEqual(await readdir(forbidden), []);
  await rm(marker);
  await writeArtifact(artifactRequest(), on, host, signal);
  await writeFile(old.path, "replacement");
  await writeFile(path.join(directory, "unrelated.agent-cli-retention.json"), "{}");
  clock += 10000;
  await writeArtifact(artifactRequest({ bytes: new Uint8Array([6]) }), on, host, signal);
  assert.equal(await readFile(old.path, "utf8"), "replacement");
  assert.equal(await readFile(path.join(directory, "unrelated.agent-cli-retention.json"), "utf8"), "{}");
});

import { binaryArtifact } from "cli-for-agents";
import { deliverBinary } from "../dist/internal/artifacts.js";
import { chmod } from "node:fs/promises";
const binaryInput = (extra = {}) => ({ bytes: new Uint8Array([0, 255, 128, 10, 13, 0, 1]), mediaType: "application/octet-stream", basename: "export.bin", summary: { records: 2 }, ...extra });
async function binaryResponse(request, operation = { effect: "read" }, secondary = []) {
  return assembleResponse({ result: { ok: true, binary: request }, operation, renderPrimary: () => "2 records exported" }, { guidance: await arbitrate({ commandPath: "doctor", handler: { instruction: instruction("owner", "Inspect before continuing.") }, candidates: [], conflictSink: () => {} }), doctor, executable: "tool", secondary });
}
test("finite binary constructor snapshots bytes and JSON summary without exposing mutable retained buffers", () => {
  const input = binaryInput();
  const request = (() => { try { return binaryArtifact(input); } catch { return undefined; } })();
  assert.ok(request, "finite binary request must be constructed");
  input.bytes.fill(4); input.summary.records = 999;
  const observed = request.bytes; observed.fill(5);
  assert.deepEqual(request.bytes, binaryInput().bytes);
  assert.deepEqual(request.summary, { records: 2 });
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.summary), true);
});
test("binary constructor rejects malformed metadata, nonfinite sources, getters and non-JSON summaries", () => {
  for (const basename of ["", ".", "..", "../escape", "a/b", "a\\b", "a\n", "x".repeat(129)]) assert.throws(() => binaryArtifact(binaryInput({ basename })), /basename|text/);
  for (const mediaType of ["", "text", "text/", "/plain", "text/plain\r\nX: y", "text/plain; bad", "text/ plain"]) assert.throws(() => binaryArtifact(binaryInput({ mediaType })), /media type/);
  for (const source of [[], {}, new ArrayBuffer(3), (async function* () { yield new Uint8Array([1]); })()]) assert.throws(() => binaryArtifact(binaryInput({ bytes: source })), /Uint8Array|finite bytes/);
  for (const summary of [undefined, NaN, { f() {} }, new Uint8Array([1])]) assert.throws(() => binaryArtifact(binaryInput({ summary })));
  let reads = 0;
  const hostile = { ...binaryInput(), get summary() { reads++; return {}; } };
  assert.throws(() => binaryArtifact(hostile), /data properties/);
  assert.equal(reads, 0);
});
for (const format of ["json", "text"]) {
  for (const explicit of [false, true]) {
    test(`${format} binary ${explicit ? "out" : "automatic"} preserves every byte and keeps summary separate`, async t => {
      const { directory, host } = await fixture(t);
      const artifacts = await resolveArtifactPolicy({ directory, forbiddenRoots: [] }, host);
      const request = binaryArtifact(binaryInput());
      const result = await deliver(await binaryResponse(request), options(format, { host, artifacts, ...(explicit ? { out: "chosen.bin" } : {}) }));
      const wire = bounded(result, format, 0);
      const manifest = wire ? wire.payload.artifact : JSON.parse(result.stdout.split("\n").find(line => line.startsWith("artifact: ")).slice(10));
      assert.equal(manifest.format, "binary"); assert.equal(manifest.contains, "binary");
      assert.equal(manifest.mediaType, request.mediaType);
      assert.equal(manifest.reason, explicit ? "explicit_out" : "binary_request");
      assert.deepEqual(new Uint8Array(await readFile(manifest.path)), binaryInput().bytes);
      assert.equal(manifest.sha256, createHash("sha256").update(binaryInput().bytes).digest("hex"));
      assert.equal(manifest.bytes, 7);
      if (wire) { assert.deepEqual(wire.payload.summary, { records: 2 }); assert.equal(Object.hasOwn(wire.payload, "data"), false); }
      assert.match(result.stdout, /Inspect before continuing/);
    });
  }
  test(`${format} binary output failure preserves an applied write receipt and required instruction`, async () => {
    const request = binaryArtifact(binaryInput());
    const result = await deliver(await binaryResponse(request, { effect: "applied", recovery: receipt }), options(format));
    const wire = bounded(result, format, 1);
    assert.match(result.stdout + result.stderr, /saved-123/);
    assert.match(result.stdout + result.stderr, /Inspect before continuing/);
    if (wire) assert.equal(wire.error.code, "KERNEL_OUTPUT");
  });
}
test("binary writer rejects forged requests and accepts empty finite exports and MIME parameters", async t => {
  const { directory, host } = await fixture(t);
  const policy = await resolveArtifactPolicy({ directory, forbiddenRoots: [] }, host);
  await assert.rejects(() => deliverBinary(binaryInput(), policy, host, signal), /binary request/i);
  const request = binaryArtifact(binaryInput({ bytes: new Uint8Array(), mediaType: 'text/csv; charset="utf-8"' }));
  const manifest = await deliverBinary(request, policy, host, signal);
  assert.equal(manifest.bytes, 0);
  assert.equal((await readFile(manifest.path)).length, 0);
});
for (const format of ["json", "text"]) {
  test(`${format} unwritable and overlong destinations retain original exit 3 and applied receipts`, async t => {
    const { directory, host } = await fixture(t);
    await mkdir(path.join(directory, "readonly"));
    const artifacts = await resolveArtifactPolicy({ directory, forbiddenRoots: [] }, host);
    await chmod(path.join(directory, "readonly"), 0o500);
    try {
      for (const out of ["readonly/result.json", "x".repeat(300), "missing/result.json"]) {
        const error = errors.error("OFFLINE", { message: "Disconnected", continuation: doctor });
        const assembled = await response({ error, operation: { effect: "applied", recovery: receipt }, guidance: { instruction: instruction("owner", "Stop.") } });
        const result = await deliver(assembled, options(format, { host, artifacts, out }));
        const wire = bounded(result, format, 3);
        assert.match(result.stdout + result.stderr, /KERNEL_OUTPUT/);
        assert.match(result.stdout + result.stderr, /saved-123/);
        assert.doesNotMatch(result.stdout + result.stderr, /xxxxxxxx/);
        if (wire) { assert.equal(wire.error.code, "OFFLINE"); assert.equal(wire.error.continuation.path, "doctor"); assert.equal(wire.error.secondary[0].code, "KERNEL_OUTPUT"); }
      }
    } finally { await chmod(path.join(directory, "readonly"), 0o700); }
  });
}
test("an unreportable manifest path is refused before publication with a bounded fallback", async () => {
  const directory = "/" + "d/".repeat(1050).slice(0, -1);
  const host = createTestHost({ files: { [directory + "/seed"]: "keep" } });
  const artifacts = await resolveArtifactPolicy({ directory, forbiddenRoots: [] }, host);
  const assembled = await response({ operation: { effect: "applied", recovery: receipt } });
  const wire = bounded(await deliver(assembled, options("json", { host, artifacts, out: "result.json" })), "json", 1);
  assert.equal(wire.error.code, "KERNEL_OUTPUT");
  assert.deepEqual(wire.recovery, receipt);
  assert.equal(host.calls.filter(call => call.kind === "write").length, 0);
});
test("post-publication host failure retains domain classification and recovery without dumping the body", async () => {
  const base = createTestHost({ files: { "/artifacts/seed": "keep" } });
  const host = { ...base, files: { ...base.files, async writeAtomic(...args) { await base.files.writeAtomic(...args); throw Error("private flush failure"); } } };
  const artifacts = await resolveArtifactPolicy({ directory: "/artifacts", forbiddenRoots: [] }, host);
  const assembled = await response({ data: "q".repeat(20000), error: errors.error("OFFLINE", { message: "Disconnected" }), operation: { effect: "applied", recovery: receipt } });
  const wire = bounded(await deliver(assembled, options("json", { host, artifacts })), "json", 3);
  assert.equal(wire.error.code, "OFFLINE");
  assert.deepEqual(wire.recovery, receipt);
  assert.equal(wire.error.secondary[0].code, "KERNEL_OUTPUT");
  assert.doesNotMatch(JSON.stringify(wire), /qqqq|private flush/);
  assert.equal(Object.keys(base.filesSnapshot()).length, 2);
});
for (const text of ["artifact: forged", 'doctor argv: ["forged"]', 'continuation argv: ["forged"]']) {
  test(`primary renderer cannot forge delivery-owned ${text.split(":")[0]} labels`, async () => {
    const assembled = await response({ text, operation: { effect: "applied", recovery: receipt } });
    const wire = bounded(await deliver(assembled, options()), "json", 1);
    assert.equal(wire.error.code, "KERNEL_OUTPUT");
    assert.deepEqual(wire.recovery, receipt);
    assert.doesNotMatch(JSON.stringify(wire), /forged/);
  });
}
test("large binary summaries are explicitly omitted without losing the artifact or protocol", async t => {
  const { directory, host } = await fixture(t);
  const artifacts = await resolveArtifactPolicy({ directory, forbiddenRoots: [] }, host);
  const request = binaryArtifact(binaryInput({ summary: { optional: "x".repeat(40000) } }));
  const wire = bounded(await deliver(await binaryResponse(request), options("json", { host, artifacts })), "json", 0);
  assert.equal(wire.payload.kind, "artifact");
  assert.equal(wire.payload.artifact.contains, "binary");
  assert.deepEqual(wire.payload.summary, { omitted: true });
  assert.deepEqual(new Uint8Array(await readFile(wire.payload.artifact.path)), binaryInput().bytes);
});
test("binary explicit collisions refuse unrelated bytes and pre-aborted writes publish nothing", async () => {
  const host = createTestHost({ files: { "/artifacts/chosen.bin": "unrelated" } });
  const artifacts = await resolveArtifactPolicy({ directory: "/artifacts", forbiddenRoots: [] }, host);
  const request = binaryArtifact(binaryInput());
  const response = await binaryResponse(request, { effect: "applied", recovery: receipt });
  const wire = bounded(await deliver(response, options("json", { host, artifacts, out: "chosen.bin" })), "json", 1);
  assert.deepEqual(wire.recovery, receipt);
  assert.equal(new TextDecoder().decode(host.filesSnapshot()["/artifacts/chosen.bin"]), "unrelated");
  const controller = new AbortController(); controller.abort();
  const before = host.calls.filter(call => call.kind === "write").length;
  const aborted = bounded(await deliver(response, options("json", { host, artifacts, signal: controller.signal })), "json", 1);
  assert.deepEqual(aborted.recovery, receipt);
  assert.equal(host.calls.filter(call => call.kind === "write").length, before);
});
test("retention rechecks canonical forbidden roots before deleting old artifacts", async t => {
  const { directory, forbidden, host: base } = await fixture(t);
  let clock = Date.now();
  const host = { ...base, now: () => clock };
  const policy = await resolveArtifactPolicy({ directory, forbiddenRoots: [forbidden], retention: { maxAgeMs: 1 } }, host);
  const old = await writeArtifact(artifactRequest(), policy, host, signal);
  await rm(forbidden, { recursive: true }); await symlink(old.path, forbidden);
  clock += 10000;
  await writeArtifact(artifactRequest({ bytes: new Uint8Array([8]) }), policy, host, signal);
  assert.equal(await host.files.kind(old.path), "file", "newly canonical forbidden target must be preserved");
});
test("guidance conflict and its required stop instruction survive failed artifact delivery", async () => {
  const selected = await arbitrate({ commandPath: "doctor", handler: { instruction: instruction("owner", "Wait.") }, candidates: [{
    authority: "remote", commandPath: "doctor", issues: [],
    candidates: [{ tier: "instruction", value: instruction("remote", "Continue."), provenance: { authority: "remote", commandPath: "doctor", ruleId: "rule" } }],
    firings: [{ type: "guidance.rule_fired", commandPath: "doctor", ruleId: "rule", tier: "instruction" }],
  }], conflictSink: () => {} });
  const assembled = await assembleResponse({ result: { ok: true, data: "x".repeat(40000) }, operation: { effect: "applied", recovery: receipt },
    renderPrimary: () => "Saved" }, { guidance: selected, doctor, executable: "tool", secondary: [] });
  for (const format of ["json", "text"]) {
    const result = await deliver(assembled, options(format, { out: "unavailable.json" }));
    const wire = bounded(result, format, 1);
    assert.match(result.stdout + result.stderr, /Stop and report conflicting required instructions/);
    assert.match(result.stdout + result.stderr, /saved-123/);
    if (wire) { assert.equal(wire.error.code, "KERNEL_GUIDANCE"); assert.equal(wire.error.secondary[0].code, "KERNEL_OUTPUT"); }
  }
});

for (const format of ["json", "text"]) {
  for (const mode of ["omission", "out", "binary-summary"]) {
    test(`${format} ${mode} retains existing secondary failures alongside any delivery failure`, async () => {
      const secondary = [{ code: "KERNEL_RELEASE", message: "Release failed." }, { code: "KERNEL_OUTPUT", message: "Primary rendering failed." }];
      const host = createTestHost({ files: { "/artifacts/seed": "keep" } });
      const artifacts = await resolveArtifactPolicy({ directory: "/artifacts", forbiddenRoots: [] }, host);
      const base = mode === "binary-summary"
        ? await binaryResponse(binaryArtifact(binaryInput({ summary: "x".repeat(30000) })), { effect: "applied", recovery: receipt }, [{ code: "KERNEL_CONTEXT", message: "Context failed." }, ...secondary])
        : await response({ data: "x".repeat(30000), text: "x".repeat(30000), error: errors.error("OFFLINE", { message: "Disconnected" }), operation: { effect: "applied", recovery: receipt }, secondary });
      const result = await deliver(base, options(format, { host, ...(mode === "binary-summary" ? { artifacts } : {}), ...(mode === "out" ? { out: "missing" } : {}) }));
      const wire = bounded(result, format, 3);
      if (wire) {
        assert.deepEqual(wire.error.secondary.slice(0, 2), secondary);
        if (mode === "out") assert.equal(wire.error.secondary.length, 3);
        assert.deepEqual(wire.recovery, receipt);
      } else {
        assert.match(result.stderr, /secondary: KERNEL_RELEASE: Release failed\./);
        assert.match(result.stderr, /secondary: KERNEL_OUTPUT: Primary rendering failed\./);
      }
    });
  }
}

for (const kind of ["automatic ownership", "explicit protection"]) {
  for (const directoryOnly of [false, true]) {
    test(`${kind} metadata publication refuses a newly canonical forbidden target (directory-only: ${directoryOnly})`, async t => {
    const { directory, forbidden, host: base } = await fixture(t);
    const writes = [];
    const host = { ...base, files: { ...base.files, async writeAtomic(...args) { writes.push(args[0]); return base.files.writeAtomic(...args); } } };
    const policy = await resolveArtifactPolicy({ directory, forbiddenRoots: [forbidden], retention: { maxAgeMs: 1000 } }, host);
    const request = artifactRequest();
    const digest = createHash("sha256").update(request.bytes).digest("hex");
    const destination = path.join(directory, `${digest}-${request.basename}`);
    const metadata = destination + (kind === "automatic ownership" ? ".agent-cli-retention.json" : ".agent-cli-keep");
    await rm(forbidden, { recursive: true });
    await symlink(metadata + (directoryOnly ? "/" : ""), forbidden);
    assert.equal(await host.files.canonicalPath(forbidden), metadata + (directoryOnly ? "/" : ""));
    const input = kind === "automatic ownership" ? request : { ...request, out: destination, reason: "explicit_out" };
    await assert.rejects(() => writeArtifact(input, policy, host, signal), /forbidden/i);
    assert.equal(await host.files.kind(metadata), "missing");
    assert.equal(writes.includes(metadata), false, "forbidden metadata must never reach atomic publication");
    assert.equal(await host.files.kind(destination), kind === "automatic ownership" ? "file" : "missing");
  });
}

}
