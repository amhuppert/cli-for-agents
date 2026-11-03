---
name: progressive-disclosure-tooling
description: >-
  Structure CLI and tool help as a pull-based progressive-disclosure graph
  derived from a single typed command registry. Use when designing --help
  output, organizing command documentation for agents, adding commands or
  flags, or eliminating drift between parsers, help text, and skill docs.
---

# Progressive-Disclosure Tooling

Expose tool documentation pull-based, node by node via `--help`, rather than front-loading a monolithic README. Every subcommand is a node in a disclosure graph, and every surface—help text, flag allowlists, parser sets, group dispatch, and skill-doc command tables—derives from one typed registry so documentation drift cannot compile.

Help discloses instructions just as bounded query output discloses data (`query-output-disclosure`); hints, usage errors, and omission lines in command output form edges of the same graph.

## Disclosure graph and node anatomy

- **Terse hubs, rich leaves.** Render group nodes as compact indexes (summary, one line per child, related/skill edges). Keep top-level usage and group hubs terse so walking the graph is cheap; put full detail at leaf commands.
- **Longest-prefix help resolution.** Resolve `--help` on the full positional path so `tool group verb --help` renders the leaf. When an unknown path is invoked under a matched parent, fail with a usage error listing the parent's valid children.
- **Leaf `--help` contents:**
  - **Description:** 1–4 lines stating what the command does.
  - **Usage:** Invocation shapes.
  - **Flags:** Command-specific flags only, plus one pointer line to global flags (never repeat global flags on every leaf).
  - **Examples (≥ 1 per leaf):** Teach failure-prone shapes—range syntax, payload file structure, required `validate`-first ordering—never bare restatements of the usage line.
  - **Domain context (optional):** ≤ 4 lines when a domain invariant matters at call time (`designed-friction`).
  - **Lateral edges:** Related sibling commands with one-line descriptions.
  - **Outbound skill edges:** `"load <skill> when <trigger>"` pointers to deeper reference docs.
- **One shared vocabulary.** Author hints and error suggestions next to command definitions using registered command and flag names (`validate` → `create` → `start`; exit `3` → `doctor`) so guidance never names nonexistent commands.

## Single source of truth: the typed registry

Store all command metadata (path, summary, description, usage, typed flags, examples, domain context, related edges, skill refs) in colocated per-command files and aggregate them centrally. Throw at module initialization on duplicate paths or leaves missing a parent group node.

| Derived surface | Replaces |
|---|---|
| Per-command `--help` text (and `--help --json` returning the raw registry entry) | Hand-written help strings or prose-in-JSON |
| Per-command flag allowlists and parser boolean-flag sets | Hand-maintained arrays at validation/parser call sites |
| Top-level usage and group dispatch (`valid verbs`, missing-subcommand errors) | Hand-listed verb tables per group module |
| Command reference tables in agent-facing skill docs | Manually synced documentation sections |

## Adding a command and contract-testing against drift

When adding or changing a command or flag:

1. Update the typed registry entry (including ≥ 1 example on leaves), wire flag validation through the registry, add bidirectional `related` edges and `skill` refs, and regenerate derived skill-doc tables.
2. Enforce registry invariants in a contract test that fails the build on drift:
   - Every dispatchable command path has a registry entry, and group dispatch handler maps match registry children exactly.
   - Every entry has a non-empty summary, description, and usage; every leaf has ≥ 1 example.
   - All top-level entries appear in top-level usage; all group nodes list every child.
   - Every `related` command edge resolves to a registered entry, and every referenced skill-doc path exists on disk.
   - No flag name is declared boolean in one entry and value-taking in another.

## Infallible static help with bounded dynamic garnish

`--help` is the agent's primary recovery path: compile static help into the binary from the same build as the flag parser so it works offline and unauthenticated, returns instantly, and **always exits `0`**.

The server may append runtime state to `--help` (running dev servers, active task/iteration counts, existing artifacts) only under strict bounds:

- Read-only, best-effort fetch with a short timeout (~500 ms), capped at ≤ 3 clearly marked blocks of ~10 lines after static help.
- Omit sections when providers return empty, and add providers only for observed agent needs.
- **Silent fallback on any failure.** If the server is unreachable, unauthenticated, times out, returns non-2xx, or fails schema validation, log server-side only and render static help byte-identically with nothing on stderr and exit code `0`.

## Related skills

- `cli-tools-for-agents` — when designing the CLI's exit codes, file payloads, preflight checks, and `doctor` command
- `query-output-disclosure` — when designing progressive disclosure for query data rather than help text
- `agent-feedback-tiers` — when embedding chained `hint`, `reminders`, and `instruction` tiers in command output
- `mechanical-guardrails` — when enforcing registry derivation and contract tests structurally
- `earned-guidance-docs` — when structuring root `AGENTS.md` pointers and read-on-demand reference docs
