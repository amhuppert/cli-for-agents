// Tooling only: record actual module resolution in the loader's separate realm.
import { appendFileSync } from 'node:fs';
export async function resolve(specifier, context, next) {
  const resolved = await next(specifier, context);
  appendFileSync(process.env.DISTRIBUTION_TRACE, `${resolved.url}\n`);
  return resolved;
}
