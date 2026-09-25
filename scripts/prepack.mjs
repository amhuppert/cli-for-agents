#!/usr/bin/env node
// npm pack and yalc publish run this before copying files: dist is always rebuilt from
// this producer's source, so stale or obsolete output cannot ship. A failed build
// fails packing and leaves nothing to publish. The build wrapper owns compiler settings.
import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
rmSync(fileURLToPath(new URL('../dist', import.meta.url)), { recursive: true, force: true });
// Forward build output to stderr so `npm pack --json` stdout stays machine-readable.
const build = spawnSync('bash', [fileURLToPath(new URL('./validate/build.sh', import.meta.url))], { cwd: root, stdio: ['ignore', 2, 2] });
if (build.error) {
  process.stderr.write(`prepack: could not start the build: ${build.error.message}\n`);
  process.exitCode = 1;
} else if (build.status !== 0) {
  process.stderr.write(`prepack: build ${build.signal ? `ended with ${build.signal}` : `failed with exit ${build.status}`}; nothing was packed.\n`);
  process.exitCode = build.status || 1;
}
