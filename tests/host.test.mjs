import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, readFile, symlink, readdir, rm, realpath, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { getEventListeners } from "node:events";
import { nodeHost } from "cli-for-agents/runtime";
import { createTestHost } from "cli-for-agents/testing";
import { bytes, milliseconds } from "cli-for-agents";

const signal = () => new AbortController().signal;
const encode = (text) => new TextEncoder().encode(text);
async function temporary(t) {
  const dir = await mkdtemp(join(tmpdir(), "agent-host-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return realpath(dir);
}

test("Node file reads preserve exact UTF-8 byte limits and reject overflow/abort", async (t) => {
  const host = await nodeHost();
  const dir = await temporary(t);
  const path = join(dir, "input");
  await writeFile(path, "é🌍");
  assert.deepEqual(await host.files.read(path, bytes(6), signal()), encode("é🌍"));
  await assert.rejects(host.files.read(path, bytes(5), signal()), /limit/i);
  await assert.rejects(host.files.read(path, bytes(0), signal()), /limit/i);
  await writeFile(path, "");
  assert.equal((await host.files.read(path, bytes(0), signal())).length, 0);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(host.files.read(path, bytes(10), abort.signal), { name: "AbortError" });
  await assert.rejects(host.files.read(join(dir, "absent"), bytes(10), signal()), { code: "ENOENT" });
});

test("Node canonical paths resolve symlink ancestors, dangling links and file kinds", async (t) => {
  const host = await nodeHost();
  const dir = await temporary(t);
  await mkdir(join(dir, "real"));
  await symlink("real", join(dir, "alias"));
  await symlink("alias/new", join(dir, "dangling"));
  assert.equal(await host.files.canonicalPath(join(dir, "alias/new/file")), join(dir, "real/new/file"));
  assert.equal(await host.files.canonicalPath(join(dir, "dangling/file")), join(dir, "real/new/file"));
  await writeFile(join(dir, "real/file"), "data");
  assert.equal(await host.files.kind(join(dir, "alias/file")), "file");
  assert.equal(await host.files.kind(join(dir, "alias")), "directory");
  assert.equal(await host.files.kind(join(dir, "absent")), "missing");
  await assert.rejects(host.files.kind(join(dir, "real/file/child")), { code: "ENOTDIR" });
  await symlink("loop", join(dir, "loop"));
  await assert.rejects(host.files.canonicalPath(join(dir, "loop/file")), /symlink|ELOOP/i);
});

test("Node atomic writes publish complete bytes, reuse identical content and refuse collisions", async (t) => {
  const host = await nodeHost();
  const dir = await temporary(t);
  await mkdir(join(dir, "real"));
  await symlink("real", join(dir, "alias"));
  const path = join(dir, "alias/file");
  const data = encode("é🌍");
  await host.files.writeAtomic(path, data, "reuse-identical-or-refuse");
  await host.files.writeAtomic(path, data, "reuse-identical-or-refuse");
  await assert.rejects(host.files.writeAtomic(path, encode("other"), "reuse-identical-or-refuse"), /collision/i);
  assert.deepEqual(new Uint8Array(await readFile(path)), data);
  assert.deepEqual(await readdir(join(dir, "real")), ["file"]);
  const race = join(dir, "real/race");
  const results = await Promise.allSettled(["one", "two"].map(value => host.files.writeAtomic(race, encode(value), "reuse-identical-or-refuse")));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.ok(["one", "two"].includes(await readFile(race, "utf8")));
  assert.deepEqual((await readdir(join(dir, "real"))).sort(), ["file", "race"]);
});

function stdinChild(mode, input) {
  const source = `
    import { nodeHost } from 'cli-for-agents/runtime';
    const host = await nodeHost();
    const controller = new AbortController();
    const before = ['data','end','error','close'].map(name => process.stdin.listenerCount(name));
    if (${JSON.stringify(mode)} .startsWith('abort')) setTimeout(() => controller.abort(), 20);
    try {
      const data = await host.files.readStdin(6, controller.signal);
      process.stdout.write(JSON.stringify({bytes: [...data]}));
    } catch (error) {
      if (${JSON.stringify(mode)} === 'abort-retry') {
        process.stdout.write('READY\\n');
        const data = await host.files.readStdin(6, new AbortController().signal);
        process.stdout.write(JSON.stringify({bytes: [...data]}));
      } else process.stdout.write(JSON.stringify({name: error.name, message: error.message,
        clean: before.every((count, i) => process.stdin.listenerCount(['data','end','error','close'][i]) === count),
        paused: process.stdin.isPaused()}));
    }
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", source], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "", errors = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error("stdin child did not settle")); }, 5000);
    child.on("error", reject);
    child.stdout.on("data", chunk => {
      output += chunk;
      if (output.startsWith("READY\n")) { output = output.slice(6); child.stdin.end("é🌍"); }
    });
    child.stderr.on("data", chunk => { errors += chunk; });
    child.on("exit", code => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(errors));
      else { try { resolve(JSON.parse(output)); } catch (error) { reject(error); } }
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

test("Node stdin reads accept exact bytes, reject overflow, and cancel an open pipe cleanly", async () => {
  assert.deepEqual(await stdinChild("read", "é🌍"), { bytes: [...encode("é🌍")] });
  const overflow = await stdinChild("read", "é🌍x");
  assert.match(overflow.message, /limit/i);
  assert.equal(overflow.clean, true);
  assert.equal(overflow.paused, true);
  const aborted = await stdinChild("abort");
  assert.equal(aborted.name, "AbortError");
  assert.equal(aborted.clean, true);
  assert.equal(aborted.paused, true);
});

test("Node clock, cancellable sleep and requested SHA-256 work", async () => {
  const host = await nodeHost();
  assert.ok(Math.abs(host.now() - Date.now()) < 1000);
  await host.sleep(milliseconds(0), signal());
  const controller = new AbortController();
  const pending = host.sleep(milliseconds(10000), controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await assert.rejects(host.sleep(milliseconds(0), controller.signal), { name: "AbortError" });
  assert.equal(await host.sha256(encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});


test("Node stdin can be read again after cancellation without hanging", async () => {
  assert.deepEqual(await stdinChild("abort-retry"), { bytes: [...encode("é🌍")] });
});

test("Public imports load no Node capabilities; filesystem operations never request crypto", async (t) => {
  const dir = await temporary(t);
  // A loader records actual module acquisition in an isolated process, including dynamic imports.
  const loader = `
    export async function resolve(specifier, context, next) {
      if (specifier.startsWith('node:')) process.stderr.write('BUILTIN:' + specifier + '\\n');
      return next(specifier, context);
    }
  `;
  const source = `
    const runtime = await import('cli-for-agents/runtime');
    await import('cli-for-agents');
    await import('cli-for-agents/testing');
    process.stderr.write('DECLARATIONS_DONE\\n');
    const host = await runtime.nodeHost();
    await host.files.writeAtomic(${JSON.stringify(join(dir, "lazy"))}, new Uint8Array([1]), 'reuse-identical-or-refuse');
    await host.files.read(${JSON.stringify(join(dir, "lazy"))}, 1, new AbortController().signal);
    process.stderr.write('FILES_DONE\\n');
    await host.sha256(new Uint8Array([1]));
  `;
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", "--experimental-loader", `data:text/javascript,${encodeURIComponent(loader)}`, "--input-type=module", "-e", source]);
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve(stderr) : reject(new Error(stderr)));
  });
  const [declarations, rest] = output.split("DECLARATIONS_DONE\n");
  assert.doesNotMatch(declarations, /BUILTIN:/);
  const [files, hash] = rest.split("FILES_DONE\n");
  assert.doesNotMatch(files, /BUILTIN:node:crypto/);
  assert.match(hash, /BUILTIN:node:crypto/);
});

test("Node file abort during open settles without a late unhandled error", async (t) => {
  const host = await nodeHost();
  const dir = await temporary(t);
  const controller = new AbortController();
  const pending = host.files.read(join(dir, "missing"), bytes(10), controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  // Allow the pending OS open and stream close to finish after cancellation.
  await new Promise(resolve => setTimeout(resolve, 30));
});

test("Test host snapshots initial bytes, returned files and call records", async () => {
  const initial = encode("é🌍");
  const host = createTestHost({ files: { "/data/file": initial }, stdin: "abc", now: 100 });
  initial.fill(0);
  assert.deepEqual(await host.files.read("/data/file", bytes(6), signal()), encode("é🌍"));
  const snapshot = host.filesSnapshot();
  snapshot["/data/file"].fill(0);
  assert.deepEqual(host.filesSnapshot()["/data/file"], encode("é🌍"));
  const read = await host.files.read("/data/file", bytes(6), signal());
  read.fill(0);
  assert.deepEqual(host.filesSnapshot()["/data/file"], encode("é🌍"));
  assert.equal(host.now(), 100);
  await host.files.canonicalPath("/data/./file");
  await host.files.kind("/data");
  await host.files.readStdin(bytes(3), signal());
  await host.sha256(encode("abc"));
  const pending = host.sleep(milliseconds(2), signal());
  host.advance(milliseconds(2));
  await pending;
  const data = encode("new");
  await host.files.writeAtomic("/data/new", data, "reuse-identical-or-refuse");
  data.fill(0);
  assert.deepEqual(host.filesSnapshot()["/data/new"], encode("new"));
  assert.deepEqual(host.calls, [
    { kind: "read", path: "/data/file" }, { kind: "read", path: "/data/file" },
    { kind: "clock" }, { kind: "canonicalPath", path: "/data/./file" },
    { kind: "kind", path: "/data" }, { kind: "stdin" }, { kind: "sha256" },
    { kind: "sleep", duration: 2 }, { kind: "write", path: "/data/new" },
  ]);
  assert.throws(() => host.calls.push({ kind: "clock" }), TypeError);
  assert.throws(() => { host.calls[0].path = "changed"; }, TypeError);
});

test("Test clock resolves sleeps in deadline/insertion order and removes cancelled waits", async () => {
  const host = createTestHost({ now: 100 });
  const wakeups = [];
  const pending = [20, 10, 10, 0].map((duration, index) => host.sleep(milliseconds(duration), signal()).then(() => wakeups.push(index)));
  const controller = new AbortController();
  const aborted = host.sleep(milliseconds(5), controller.signal);
  const reason = new Error("cancel test sleep");
  controller.abort(reason);
  await assert.rejects(aborted, error => error === reason);
  host.advance(milliseconds(0));
  await Promise.resolve();
  assert.deepEqual(wakeups, [3]);
  host.advance(milliseconds(9));
  await Promise.resolve();
  assert.deepEqual(wakeups, [3]);
  host.advance(milliseconds(1));
  await Promise.resolve();
  assert.deepEqual(wakeups, [3, 1, 2]);
  host.advance(milliseconds(10));
  await Promise.all(pending);
  assert.deepEqual(wakeups, [3, 1, 2, 0]);
  assert.equal(host.now(), 120);
  await assert.rejects(host.sleep(milliseconds(0), controller.signal), error => error === reason);
  assert.throws(() => host.advance(-1), TypeError); // Hostile JavaScript.
  assert.throws(() => createTestHost({ now: Infinity }), TypeError);
});

for (const flavor of ["Node", "test"]) {
  test(`${flavor} host shared file/hash/cancellation contract`, async (t) => {
    const root = flavor === "Node" ? await temporary(t) : "/fixture";
    const path = `${root}/input`;
    const host = flavor === "Node" ? await nodeHost() : createTestHost({ files: { [path]: "é🌍" }, stdin: "é🌍" });
    if (flavor === "Node") await writeFile(path, "é🌍");
    assert.equal(await host.files.kind(path), "file");
    assert.equal(await host.files.kind(root), "directory");
    assert.equal(await host.files.kind(`${root}/missing`), "missing");
    assert.equal(await host.files.canonicalPath(`${root}/./new/../input`), path);
    assert.deepEqual(await host.files.read(path, bytes(6), signal()), encode("é🌍"));
    await assert.rejects(host.files.read(path, bytes(5), signal()), /limit/i);
    await assert.rejects(host.files.read(`${root}/missing`, bytes(10), signal()), { code: "ENOENT" });
    await assert.rejects(host.files.read(`${path}/child`, bytes(10), signal()), { code: "ENOTDIR" });
    const controller = new AbortController();
    const reason = new Error("shared abort");
    controller.abort(reason);
    await assert.rejects(host.files.read(path, bytes(10), controller.signal), error => error === reason);
    await assert.rejects(host.files.readStdin(bytes(10), controller.signal), error => error === reason);
    await assert.rejects(host.sleep(milliseconds(0), controller.signal), error => error === reason);
    await assert.rejects(host.files.read(path, -1, signal()), TypeError); // Hostile JavaScript.
    await assert.rejects(host.sleep(-1, signal()), TypeError);
    const output = `${root}/output`;
    await host.files.writeAtomic(output, encode("abc"), "reuse-identical-or-refuse");
    await host.files.writeAtomic(output, encode("abc"), "reuse-identical-or-refuse");
    await assert.rejects(host.files.writeAtomic(output, encode("abcd"), "reuse-identical-or-refuse"), /collision/i);
    assert.deepEqual(await host.files.read(output, bytes(3), signal()), encode("abc"));
    assert.equal(await host.sha256(encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    await assert.rejects(host.files.writeAtomic(`${root}/absent/child`, encode("abc"), "reuse-identical-or-refuse"), { code: "ENOENT" });
  });
}

test("Test stdin observes byte limits, EOF and pre-abort without consuming fixture", async () => {
  const host = createTestHost({ stdin: "é🌍" });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(host.files.readStdin(bytes(6), controller.signal), { name: "AbortError" });
  assert.deepEqual(await host.files.readStdin(bytes(6), signal()), encode("é🌍"));
  assert.deepEqual(await host.files.readStdin(bytes(0), signal()), new Uint8Array());
  await assert.rejects(createTestHost({ stdin: "é🌍" }).files.readStdin(bytes(5), signal()), /limit/i);
  assert.deepEqual(await createTestHost().files.readStdin(bytes(0), signal()), new Uint8Array());
});

for (const flavor of ["Node", "test"]) {
  test(`${flavor} sleep cleans up listeners on completion/cancellation and preserves long waits`, async () => {
    const host = flavor === "Node" ? await nodeHost() : createTestHost();
    const controller = new AbortController();
    const start = host.now();
    const completed = host.sleep(milliseconds(10), controller.signal);
    assert.equal(getEventListeners(controller.signal, "abort").length, 1);
    if (flavor === "test") host.advance(milliseconds(10));
    await completed;
    assert.ok(host.now() >= start + 10);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    let woke = false;
    const long = host.sleep(milliseconds(2147483648), controller.signal).then(() => { woke = true; });
    if (flavor === "test") host.advance(milliseconds(10));
    else await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(woke, false);
    controller.abort();
    await assert.rejects(long, { name: "AbortError" });
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  });
}

test("Test host refuses clock overflow and ambiguous initial filesystem entries", async () => {
  const host = createTestHost({ now: Number.MAX_SAFE_INTEGER });
  assert.throws(() => host.advance(milliseconds(1)), TypeError);
  await assert.rejects(host.sleep(milliseconds(1), signal()), TypeError);
  assert.equal(host.now(), Number.MAX_SAFE_INTEGER);
  for (const files of [
    { "/a": "file", "/a/child": "child" },
    { "/a/child": "child", "/a": "file" },
    { "/a": "file", "/./a": "duplicate" },
    { "/": "file" },
  ]) assert.throws(() => createTestHost({ files }));
});

for (const flavor of ["Node", "test"]) {
  test(`${flavor} host captures write and hash bytes before callers can mutate them`, async (t) => {
    const root = flavor === "Node" ? await temporary(t) : "/";
    const host = flavor === "Node" ? await nodeHost() : createTestHost();
    const path = join(root, "captured");
    const content = encode("abc");
    const writing = host.files.writeAtomic(path, content, "reuse-identical-or-refuse");
    const hashing = host.sha256(content);
    content.fill(0);
    await writing;
    assert.deepEqual(await host.files.read(path, bytes(3), signal()), encode("abc"));
    assert.equal(await hashing, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
}


test("Node bounded file reads refuse a named pipe instead of blocking during open", async (t) => {
  const host = await nodeHost();
  const dir = await temporary(t);
  const path = join(dir, "pipe");
  execFileSync("mkfifo", [path]);
  const pending = host.files.read(path, bytes(10), signal()).then(() => "accepted", error => error.message);
  let timer;
  const result = await Promise.race([pending, new Promise(resolve => { timer = setTimeout(() => resolve("blocked"), 100); })]);
  clearTimeout(timer);
  if (result === "blocked") {
    // Release an implementation's blocked OS open so red runs also clean up.
    await writeFile(path, "");
    await pending;
  }
  assert.match(result, /regular file/i);
});

for (const flavor of ["Node", "test"]) {
  test(`${flavor} host preserves directory-only path spellings`, async (t) => {
    const root = flavor === "Node" ? await temporary(t) : "/fixture";
    const path = `${root}/file`;
    const host = flavor === "Node" ? await nodeHost() : createTestHost({ files: { [path]: "data" } });
    if (flavor === "Node") await writeFile(path, "data");
    for (const suffix of ["/", "/.", "//./", "/.."] ) {
      await assert.rejects(host.files.canonicalPath(path + suffix), { code: "ENOTDIR" });
      await assert.rejects(host.files.read(path + suffix, bytes(10), signal()), { code: "ENOTDIR" });
      await assert.rejects(host.files.kind(path + suffix), { code: "ENOTDIR" });
      await assert.rejects(host.files.writeAtomic(path + suffix, encode("data"), "reuse-identical-or-refuse"));
    }
    for (const suffix of ["/", "/.", "//./"] ) {
      assert.equal(await host.files.canonicalPath(root + suffix), root);
      assert.equal(await host.files.kind(root + suffix), "directory");
      assert.equal(await host.files.canonicalPath(`${root}/new${suffix}`), `${root}/new/`);
      await assert.rejects(host.files.writeAtomic(`${root}/new${suffix}`, encode("data"), "reuse-identical-or-refuse"));
      assert.equal(await host.files.kind(`${root}/new`), "missing");
    }
    assert.deepEqual(await host.files.read(path, bytes(4), signal()), encode("data"));
    if (flavor === "Node") assert.deepEqual(await readdir(root), ["file"]);
    else assert.deepEqual(Object.keys(host.filesSnapshot()), [path]);
  });
}

test("Node symlink targets retain directory-only semantics", async (t) => {
  const host = await nodeHost();
  const root = await temporary(t);
  await writeFile(`${root}/file`, "data");
  await symlink("file/.", `${root}/bad-link`);
  await assert.rejects(host.files.canonicalPath(`${root}/bad-link`), { code: "ENOTDIR" });
  await symlink("new/", `${root}/missing-directory-link`);
  assert.equal(await host.files.canonicalPath(`${root}/missing-directory-link`), `${root}/new/`);
  await assert.rejects(host.files.writeAtomic(`${root}/missing-directory-link`, encode("data"), "reuse-identical-or-refuse"));
  assert.equal(await host.files.kind(`${root}/new`), "missing");
});

test("Test file fixtures reject directory-only path spellings", () => {
  for (const path of ["/new/", "/new/.", "/new//./"]) {
    assert.throws(() => createTestHost({ files: { [path]: "data" } }));
  }
});
