# Remote service pilot

This in-repository thin client uses the public package exports. Its declaration
module loads handlers and HTTP transport lazily; public `main` owns process output.
The test suite bundles `cli.mjs` into one executable ESM file with development-only
esbuild, then starts an ephemeral loopback HTTP service owned by each test.

Use `REMOTE_TOKEN` (or `--token`), `--server <url>`, and `--workspace <name>` for remote
commands. `doctor`, `schema`, help, version, and exit-codes need no live service.
`REMOTE_ARTIFACTS` explicitly selects the artifact directory (default current directory).

- `list [--cursor <cursor>]` returns one item and an unknown-total page disclosure.
- `show <id> [--full]` reads summary/detail; large detail spills through the library.
- `validate --file <path>` and `apply --file <path>` share a lazy Standard Schema
  decoder and pure preparation. Only apply sends the mutation request.
- `wait [--cursor <cursor>] [--delay <ms>]` makes a finite request, sleeps through
  the injected host clock, then reads status. `status --cursor <cursor>` resumes. Emitted references retain the selected server
  and workspace; credentials remain in the declared environment fallback.

The service's candidate rules and firing sink use `cli-for-agents/guidance`.
The client decodes those candidates; response assembly arbitrates handler/local
protocol and authoritative guidance. `show --conflict` exercises a competing
local instruction. Neither client nor service implements live progress.

Run through the project's registered validation:

```
cctl validate run test --queue-if-busy -- tests/pilots/remote.test.mjs
```

The loopback server is a deterministic test fixture, not a deployed service or a
consumer migration. Its state is inspected directly by tests and discarded at close.
