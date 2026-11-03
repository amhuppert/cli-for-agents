---
name: ai-readable-tool-output
description: >-
  Configure linters, type checkers, test runners, formatters, and hooks
  (ESLint, TypeScript, Vitest, Jest, Prettier) for low-noise agent consumption:
  O(1) success verdicts, full failure details, no ANSI colors, early bail,
  truncated diffs, and AI_OUTPUT=1 detection. Use when configuring
  lint/typecheck/test scripts or pre-commit hooks for agents, or reducing
  passing-test noise.
---

# AI-Readable Tool Output

Agents pay context tokens for every line of stdout/stderr. Configure real-time agent tooling to reduce passing output to a single bounded verdict while preserving every failure detail.

## Core principles

1. **O(1) success verdict, never O(n) enumeration.** Replace per-file `PASS` or formatted-file lists with one summary line (`200 tests passed`, `no findings`). Never silence the outcome to zero bytes—silence is indistinguishable from a tool that did not run.
2. **One verdict at the caller boundary.** When a wrapper script or pre-commit hook runs four tools, emit a single combined verdict (or let the final test runner emit it) rather than four competing success lines.
3. **Disambiguate branching checks.** On preflight, readiness, or policy checks that gate the agent's next step, a bare `ok` or exit `0` cannot separate *ran clean*, *did not run* (bad flag/config/cwd), and *matched zero targets*. State the clean verdict and name the unblocked transition (`no findings — <transition> will not be refused`).
4. **Keep full failure detail, strip ANSI, bail early, cap diffs.** Preserve complete error messages, file locations, expected/received values, and app stack frames. Strip color codes (`--no-color`), bail after ~3 failures so one root cause does not flood context with symptoms, and truncate huge snapshot/object diffs.
5. **Use a project-owned `AI_OUTPUT=1` switch.** Map vendor and CI variables (`CLAUDECODE=1`, `CI=true`) onto `AI_OUTPUT=1` so any agent runner or script can opt in deterministically:
   ```typescript
   const isAI = process.env.AI_OUTPUT === "1" || process.env.CLAUDECODE === "1";
   const isCI = process.env.CI === "true";
   ```
6. **Keep human defaults and captured CI logs verbose.** Add `:ai` script variants for real-time agent and pre-commit use; keep default scripts (`lint`, `typecheck`, `test`) and captured post-merge logs human-readable (`--pretty`, default reporters).

## Tool configurations

| Tool | Human command | AI command | Rationale and required config |
|---|---|---|---|
| **ESLint** | `eslint .` | `eslint . --quiet --no-color --no-warn-ignored` (add `--fix` first when autofixing) | `--quiet` suppresses warnings (and skips running warn rules in v9+); `--no-warn-ignored` drops ignore notices. Keep the default `stylish` formatter: it groups by file, whereas `compact`/`unix` repeat paths and `json` adds 3–5× token overhead. |
| **TypeScript** | `tsc --noEmit --pretty` | `tsc --noEmit --pretty false` | Emits one `file(line,col): error TSxxxx: msg` line per error (~7× shorter than `--pretty`'s source snippets and squiggly underlines). |
| **Vitest** | `vitest run` | `vitest run --no-color` | Use `vitest.config.ts` (below); CLI flags alone cannot set bail, console suppression, stack filtering, or diff truncation. |
| **Jest** | `jest` | `jest --silent --no-color --bail=3` | `--silent` suppresses test `console.log` while keeping summary counts; configure `summary` reporter in `jest.config.ts` (below) to drop per-file `PASS` lines. |
| **Prettier** | `prettier --write .` | `prettier --write . --log-level warn` | Drops O(n) file lists while preserving warnings/errors (do not redirect to `/dev/null`). Because Prettier has no summary mode, let the wrapping `:ai` script or hook emit the run verdict. |

### Vitest (`vitest.config.ts`)

The `dot` reporter prints one character per test (`.` or `x`) plus full failure details and the final summary (~96% fewer lines on a 200-test suite):

```typescript
const isAI = process.env.AI_OUTPUT === "1" || process.env.CLAUDECODE === "1";
const isCI = process.env.CI === "true";

export default defineConfig({
  test: {
    reporters: isCI ? ["dot", "github-actions"] : isAI ? ["dot"] : ["default"],
    ...(isAI && {
      bail: 3,
      onConsoleLog() {
        return false;
      },
      onStackTrace(_error, { file }) {
        if (file.includes("node_modules")) return false;
      },
      diff: {
        truncateThreshold: 2000,
        truncateAnnotation: "... diff truncated",
        expand: false,
      },
    }),
  },
});
```

### Jest (`jest.config.ts`)

`summaryThreshold: 0` ensures failure details always print regardless of suite count (the default threshold is `20`):

```typescript
const isAI = process.env.AI_OUTPUT === "1" || process.env.CLAUDECODE === "1";

export default {
  reporters: isAI ? [["summary", { summaryThreshold: 0 }]] : ["default"],
};
```

## `:ai` package scripts and pre-commit hooks

Chain `check:ai` with `&&` so the run short-circuits on the first failing tool:

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:ai": "eslint . --quiet --no-color --no-warn-ignored",
    "test": "vitest run",
    "test:ai": "vitest run --no-color",
    "typecheck": "tsc --noEmit --pretty",
    "typecheck:ai": "tsc --noEmit --pretty false",
    "check:ai": "eslint . --quiet --no-color --no-warn-ignored && tsc --noEmit --pretty false && vitest run --no-color"
  }
}
```

In pre-commit hooks (e.g., Husky), switch on `AI_OUTPUT=1` or `CLAUDECODE=1` and let the final test runner emit the single summary line for the commit:

```sh
#!/bin/sh
set -e

npx prettier --write . --log-level warn
git add -u

if [ "${AI_OUTPUT:-0}" = "1" ] || [ "${CLAUDECODE:-0}" = "1" ]; then
  npx eslint . --fix --quiet --no-color --no-warn-ignored
  git add -u
  tsc --noEmit --pretty false
else
  npx eslint . --fix
  git add -u
  tsc --noEmit --pretty
fi

npx vitest run
```

## Related skills

- `cli-tools-for-agents` — when designing custom CLI exit codes, outcome lines, and preflight verdicts
- `logging-for-agent-debugging` — when designing structured logs and bounded log-analysis commands for agents
