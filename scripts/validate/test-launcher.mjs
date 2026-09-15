#!/usr/bin/env node
// Canonical preparation stage; exits before the Bash wrapper starts node --test.
import { lstatSync, realpathSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const TEST_HEAP_MB = 1024;
const [manifestPath, ...requestedPaths] = process.argv.slice(2);
const root = realpathSync(process.cwd());

function fail(message) {
  throw new Error(message);
}

function isContained(path) {
  const fromRoot = relative(root, path);
  return fromRoot !== "" && fromRoot !== ".." &&
    !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

function exactTestFile(path) {
  if (typeof path !== "string" || path.startsWith("-") ||
      isAbsolute(path) || /[\\\x00-\x1f\x7f*?\[\]{}()!]/u.test(path) ||
      path.split("/").some((part) => part === "" || part === "." || part === "..") ||
      !path.endsWith(".test.mjs")) {
    fail(`expected an exact relative .test.mjs file path, received ${JSON.stringify(path)}`);
  }
  const candidate = resolve(root, path);
  const resolved = realpathSync(candidate);
  if (!isContained(candidate) || !isContained(resolved)) {
    fail(`test path escapes the worktree: ${JSON.stringify(path)}`);
  }
  if (!lstatSync(resolved).isFile()) {
    fail(`test path is not a regular file: ${JSON.stringify(path)}`);
  }
  // Absolute validated filenames cannot be interpreted as command-line flags.
  return candidate;
}

function inventory(directory, files = []) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) inventory(path, files);
    else if (entry.name.endsWith(".test.mjs")) files.push(exactTestFile(path));
    // Never follow directory symlinks: the no-argument inventory is finite.
  }
  return files;
}

try {
  if (!manifestPath) fail("missing wrapper-owned manifest path");
  let files;
  if (requestedPaths.length > 0) {
    files = [...new Set(requestedPaths.map(exactTestFile))];
  } else {
    const testRoot = resolve(root, "tests");
    if (!lstatSync(testRoot).isDirectory()) fail("tests must be a real directory");
    files = inventory("tests");
  }
  if (files.length === 0) fail("no .test.mjs files found; an empty run does not pass");

  const compile = spawnSync(process.execPath, [
    `--max-old-space-size=${TEST_HEAP_MB}`,
    "./node_modules/typescript/bin/tsc", "--project", "tsconfig.build.json",
    "--pretty", "false",
  ], {
    cwd: root,
    env: {
      ...process.env,
      NODE_OPTIONS: `--max-old-space-size=${TEST_HEAP_MB}`,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
    },
    // The wrapper captures a file, avoiding truncation by spawnSync.maxBuffer.
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (compile.error) fail(`could not start TypeScript: ${compile.error.message}`);
  if (compile.status !== 0) {
    if (compile.signal) process.stderr.write(`test: TypeScript ended with ${compile.signal}\n`);
    process.exitCode = compile.status ?? 1;
  } else {
    writeFileSync(manifestPath, `${files.join("\0")}\0`, { flag: "wx", mode: 0o600 });
  }
} catch (error) {
  process.stderr.write(`test: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
