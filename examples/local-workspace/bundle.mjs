import { build } from 'esbuild';
import { mkdir, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function bundleLocal(directory, entry = 'main.mjs') {
  await mkdir(directory, { recursive: true });
  const file = resolve(directory, entry === 'main.mjs' ? 'workspace.mjs' : 'registry.mjs');
  await build({ entryPoints: [resolve('examples/local-workspace', entry)], outfile: file,
    bundle: true, splitting: false, platform: 'node', target: 'node20', format: 'esm',
    minify: true, sourcemap: false, legalComments: 'none', logLevel: 'silent' });
  await chmod(file, 0o755);
  return file;
}
