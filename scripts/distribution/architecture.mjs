import { readFile, readdir } from 'node:fs/promises';
import { posix } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const roots = ['src', 'tests/fixtures/distribution'];
const entries = ['src/index.ts', 'src/runtime/index.ts', 'src/guidance/index.ts', 'tests/fixtures/distribution/consumer.mjs'];
const lazyOnly = ['tests/fixtures/distribution/handler.mjs', 'tests/fixtures/distribution/contracts.mjs'];
function property(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return `${property(node.expression)}.${node.name.text}`;
  if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) return `${property(node.expression)}.${node.argumentExpression.text}`;
  return '';
}
function valueImport(node) {
  // With verbatimModuleSyntax, inline type specifiers and empty braces still emit
  // a side-effect import/export. Only a declaration-level `type` erases the edge.
  return ts.isExportDeclaration(node) ? !node.isTypeOnly : !node.importClause?.isTypeOnly;
}
export async function sourceInventory(directories = roots) {
  const sources = {};
  async function scan(directory) {
    for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const path = `${directory}/${item.name}`;
      if (item.isDirectory()) await scan(path);
      else if (/\.(ts|mjs)$/.test(path) && !path.endsWith('.d.ts')) sources[path] = await readFile(path, 'utf8');
    }
  }
  for (const directory of directories) await scan(directory);
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  function target(from, specifier) {
    if (specifier === manifest.name || specifier.startsWith(`${manifest.name}/`)) {
      const exported = manifest.exports[specifier === manifest.name ? '.' : `.${specifier.slice(manifest.name.length)}`];
      if (!exported) throw Error(`Private package import: ${from}: ${specifier}`);
      return exported.import.replace('./dist/', 'src/').replace(/\.js$/, '.ts');
    }
    if (!specifier.startsWith('.')) return specifier;
    const resolved = posix.normalize(posix.join(posix.dirname(from), specifier));
    return Object.hasOwn(sources, resolved) ? resolved : resolved.replace(/\.js$/, '.ts');
  }
  const inventory = {};
  for (const [path, source] of Object.entries(sources)) {
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    if (ast.parseDiagnostics.length) throw Error(`Cannot inventory malformed source: ${path}`);
    const imports = [], output = [];
    const processAliases = new Set(['process', 'Bun']);
    const fdAliases = new Map();
    for (const node of ast.statements) {
      if (!ts.isImportDeclaration(node) || !valueImport(node)) continue;
      const specifier = node.moduleSpecifier.text;
      const clause = node.importClause;
      if (['node:process', 'process'].includes(specifier)) {
        if (clause?.name) processAliases.add(clause.name.text);
        if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) processAliases.add(clause.namedBindings.name.text);
      }
      if (['node:fs', 'node:fs/promises', 'fs', 'fs/promises'].includes(specifier) && clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const binding of clause.namedBindings.elements) fdAliases.set(binding.name.text, (binding.propertyName ?? binding.name).text);
      }
    }
    const flag = node => output.push(ast.getLineAndCharacterOfPosition(node.getStart()).line + 1);
    function visit(node, functionDepth = 0) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && valueImport(node)) {
        const specifier = node.moduleSpecifier.text;
        imports.push({ path: target(path, specifier), kind: 'static', eager: true });
        if (['node:console', 'console'].includes(specifier) || ['node:process', 'process'].includes(specifier) && node.importClause?.namedBindings && /\b(stdout|stderr)\b/.test(node.importClause.namedBindings.getText(ast))) flag(node);
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const argument = node.arguments[0];
        if (!argument || !ts.isStringLiteral(argument)) throw Error(`Uninspectable dynamic import: ${path}`);
        imports.push({ path: target(path, argument.text), kind: 'dynamic', eager: functionDepth === 0 });
      }
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const name = property(node).replace(/^globalThis\./, '');
        if (processAliases.has(name.split('.')[0]) && /^(stdout|stderr)$/.test(name.split('.')[1] ?? '') || /^console\./.test(name)) flag(node);
      }
      if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer && /^(globalThis\.)?(process|Bun)$/.test(property(node.initializer)) && node.name.elements.some(item => /^(stdout|stderr)$/.test((item.propertyName ?? item.name).getText(ast)))) flag(node);
      if (ts.isCallExpression(node)) {
        const called = property(node.expression).split('.').at(-1);
        const name = fdAliases.get(called) ?? called;
        const destination = node.arguments[0]?.getText(ast);
        if (/^(write|writeSync|writeFile|writeFileSync|createWriteStream)$/.test(name ?? '') && (/^[12]$/.test(destination ?? '') || /^['"]\/dev\/(stdout|stderr|fd\/[12])['"]$/.test(destination ?? ''))) flag(node);
      }
      const depth = functionDepth + (ts.isFunctionLike(node) ? 1 : 0);
      ts.forEachChild(node, child => visit(child, depth));
    }
    visit(ast);
    inventory[path] = { imports, output: [...new Set(output)] };
  }
  return inventory;
}
export function assertArchitecture(inventory, options = {}) {
  const starting = options.entries ?? entries;
  const forbidden = options.lazyOnly ?? lazyOnly;
  const reached = new Set();
  const audited = options.entries ?? Object.keys(inventory);
  for (const path of audited) {
    if (path !== 'src/internal/process.ts' && inventory[path]?.output.length) throw Error(`Direct output bypass: ${path}:${inventory[path].output.join(',')}. Return data through bounded main delivery.`);
  }
  function visit(path) {
    if (reached.has(path)) return;
    if (forbidden.includes(path)) throw Error(`Eager handler/schema import: ${path}. Declarations must keep application initialization lazy.`);
    if (!inventory[path]) throw Error(`Unexpected eager module: ${path}. Declaration imports may not acquire builtins or dependencies.`);
    reached.add(path);
    for (const dependency of inventory[path].imports) if (dependency.eager) visit(dependency.path);
  }
  for (const entry of starting) visit(entry);
  // Audit every production module, including ones reachable only after execution.
  const candidates = options.entries ? [...reached] : Object.keys(inventory);
  for (const path of candidates) {
    if (path !== 'src/internal/process.ts' && inventory[path].output.length) throw Error(`Direct output bypass: ${path}:${inventory[path].output.join(',')}. Return data through bounded main delivery.`);
  }
  return [...reached].sort();
}
function validBaseline(value) {
  if (!value || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || !Array.isArray(value.eager) || value.eager.some(item => typeof item !== 'string') || new Set(value.eager).size !== value.eager.length) throw Error('Invalid distribution baseline');
}
export function assertRatchet(measured, baseline, history = []) {
  validBaseline(baseline);
  for (const previous of history) {
    validBaseline(previous);
    if (baseline.bytes > previous.bytes) throw Error('Bundle ceiling increased against baseline history. Reduce bundle size; a same-change bump cannot mask growth.');
    if (baseline.eager.some(item => !previous.eager.includes(item))) throw Error('Eager allowlist expanded against baseline history. Keep offline initialization within the existing module inventory.');
  }
  if (measured.bytes > baseline.bytes) throw Error(`Bundle bytes ${measured.bytes} exceed ceiling ${baseline.bytes}. Reduce the consumer bundle.`);
  const unexpected = measured.eager.filter(item => !baseline.eager.includes(item));
  if (unexpected.length) throw Error(`Unexpected eager module: ${unexpected.join(', ')}`);
}
export function baselineHistory(path = 'scripts/distribution/baseline.json') {
  function git(args) {
    const result = spawnSync('git', args, { encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw Error(`Cannot read ratchet history: ${result.error?.message ?? result.stderr}`);
    return result.stdout.trim();
  }
  if (git(['rev-parse', '--is-shallow-repository']) !== 'false') throw Error('Full git history is required for the downward-only distribution ratchet.');
  const revisions = git(['log', '--format=%H', 'HEAD', '--', path]).split('\n').filter(Boolean);
  return revisions.map(revision => JSON.parse(git(['show', `${revision}:${path}`])));
}
