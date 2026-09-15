#!/usr/bin/env node
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, chmod } from 'node:fs/promises';
import { build } from 'esbuild';

export async function bundleConsumer(directory) {
  await mkdir(directory, { recursive: true });
  const file = resolve(directory, 'consumer.mjs');
  const result = await build({
    entryPoints: ['tests/fixtures/distribution/consumer.mjs'],
    outfile: file, bundle: true, splitting: false, platform: 'node',
    target: 'node20', format: 'esm', minify: true, sourcemap: false,
    legalComments: 'none', metafile: true, logLevel: 'silent',
  });
  await chmod(file, 0o755);
  return { file, outputs: Object.keys(result.metafile.outputs).map(path => relative(directory, resolve(path))), metafile: result.metafile };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await bundleConsumer(resolve(process.argv[2] ?? '.cc/temp/distribution/bundle'));
  console.log(JSON.stringify(result));
}
