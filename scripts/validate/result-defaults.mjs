import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// A separate program is essential: an expected diagnostic elsewhere can hide TS2589,
// after which TypeScript's cached error type silently accepts later invalid payloads.
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtures = ["result-defaults.ts", "input-positive.ts", "family-positive.ts", "runner-positive.ts", "response-positive.ts", "delivery-positive.ts", "json-value-positive.ts", "preparation-positive.ts", "input-file-positive.ts"];
for (const name of fixtures) {
  const fixture = fileURLToPath(new URL(`../../type-tests/${name}`, import.meta.url));
  if (/@ts-(?:expect-error|ignore|nocheck)/u.test(readFileSync(fixture, "utf8"))) {
    throw new Error("Positive controls must not suppress compiler diagnostics.");
  }

  const configFile = ts.readConfigFile(`${root}tsconfig.json`, ts.sys.readFile);
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
  const configErrors = configFile.error ? [configFile.error, ...config.errors] : config.errors;
  const program = ts.createProgram({ rootNames: [fixture], options: config.options });
  const diagnostics = [...configErrors, ...ts.getPreEmitDiagnostics(program)];
  if (diagnostics.length !== 0) {
    process.stderr.write(ts.formatDiagnostics(diagnostics, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (name) => name,
      getNewLine: () => "\n",
    }));
    process.exitCode = 1;
  }
}
