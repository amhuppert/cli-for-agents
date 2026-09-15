import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// Keep fixture lifetime independent of the library's still-pending test host.
async function withTemporaryDirectory(work) {
  const directory = await mkdtemp(join(tmpdir(), "cli-for-agents-harness-"));
  try {
    return await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("the harness imports all four built ESM package surfaces", async () => {
  for (const [specifier, entry, representative] of [
    ["cli-for-agents", "index.js", "page"],
    ["cli-for-agents/runtime", "runtime/index.js", "runCli"],
    ["cli-for-agents/guidance", "guidance/index.js", "instruction"],
    ["cli-for-agents/testing", "testing/index.js", "createTestHost"],
  ]) {
    assert.equal(import.meta.resolve(specifier), new URL(`../dist/${entry}`, import.meta.url).href);
    const surface = await import(specifier);
    assert.equal(typeof surface[representative], "function", specifier);
  }
});

for (const outcome of ["success", "rejection"]) {
  test(`temporary fixtures are removed after callback ${outcome}`, async () => {
    let fixtureDirectory;
    const failure = new Error("fixture callback failed");
    try {
      const operation = withTemporaryDirectory(async (directory) => {
        fixtureDirectory = directory;
        const file = join(directory, "fixture.json");
        await writeFile(file, '{"ready":true}\n');
        assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { ready: true });
        if (outcome === "rejection") throw failure;
        return "callback result";
      });
      if (outcome === "rejection") {
        await assert.rejects(operation, (error) => error === failure);
      } else {
        assert.equal(await operation, "callback result");
      }
      assert.equal(typeof fixtureDirectory, "string");
      await assert.rejects(access(fixtureDirectory), { code: "ENOENT" },
        "temporary directory must be removed when its callback settles");
    } finally {
      // Also contain temporary files when the cleanup regression test is red.
      if (fixtureDirectory) await rm(fixtureDirectory, { recursive: true, force: true });
    }
  });
}
