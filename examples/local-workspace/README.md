# Local workspace pilot

A private, in-repository CLI using the four public `cli-for-agents` exports.
It stores a finite JSON document in a real workspace directory. This is a pilot,
with no kb migration or SQLite claim.

Build and verify the single-file executable through the registered test command:

```sh
cctl validate run test --queue-if-busy -- tests/pilots/local.test.mjs
node .cc/temp/local-pilot/bundle/workspace.mjs init --json
```

`init` without `WORKSPACE_HOME` creates a temporary directory and returns its root.
Set `WORKSPACE_HOME` to that root for subsequent commands. Tests allocate their
own temporary directories and remove their domain state on completion.

```sh
export WORKSPACE_HOME=/absolute/root/from/init
node .cc/temp/local-pilot/bundle/workspace.mjs doctor
node .cc/temp/local-pilot/bundle/workspace.mjs contracts --json
node .cc/temp/local-pilot/bundle/workspace.mjs query --tag work --tag shared
node .cc/temp/local-pilot/bundle/workspace.mjs query Alpha --text-file filter.txt
node .cc/temp/local-pilot/bundle/workspace.mjs show n1 --context --full
node .cc/temp/local-pilot/bundle/workspace.mjs claim validate --file claim.json
node .cc/temp/local-pilot/bundle/workspace.mjs claim apply --file claim.json
node .cc/temp/local-pilot/bundle/workspace.mjs answer-check --file claim.json
node .cc/temp/local-pilot/bundle/workspace.mjs update n1 --title 'Revised title'
node .cc/temp/local-pilot/bundle/workspace.mjs ingest n1 --source document.txt
node .cc/temp/local-pilot/bundle/workspace.mjs export n1 --out document.bin --json
```

Claim payload: `{"nodeId":"n1","text":"Verified claim"}`. Structured `--file`,
raw `--source`, and derived `--text-file`/`--title-file` accept `-` for stdin.
Queries default to two rows; repeated tags and variadic title terms are AND
filters. Pages disclose unknown totals, stable handles and an exact continuation.
`show` defaults to id/title, `--context` adds tags, and `--context --full` adds body
and saved claims. Bare `--full` is not a declared selector set.

The output budget is 8192 UTF-8 bytes. Application reads resolve their artifact
policy from the acquired workspace: `root/artifacts`, forbidden `root/data`.
`WORKSPACE_ARTIFACTS` may select another existing directory; canonical forbidden
roots and symlinks still apply. Bootstrap/doctor use the explicit temporary
output directory (`TMPDIR` or `/tmp`) before a workspace exists. Binary export
always uses bounded artifact delivery, preserving the ingested UTF-8 bytes.

The store is limited to 2 MiB and ingestion to 64 KiB. Writers take an exclusive
lock, reread current state, sync the replacement, and atomically rename it.
Preparation reads only; receipts are assigned while holding the writer lock.
A busy lock refuses the write. A process killed during a write can leave a lock
or pending file requiring inspection; this pilot does not claim crash recovery
or a database concurrency model. Reinitialization never overwrites changed state.
Handlers and renderers return through the library; `main` owns process output.
