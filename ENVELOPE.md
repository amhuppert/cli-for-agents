# Operating envelope

`cli-for-agents` is an unpublished TypeScript library that one person develops and uses
to build command-line tools their AI agents run locally on their behalf. Its consumers
are that person's own typed projects, compiled against these types and calling into it
in the same process; nothing outside this account depends on its API, and a breaking
change needs no deprecation path. Nearest archetype: a **single-operator tool's
supporting library**. It departs from that archetype in one direction only — its output
is a protocol, because the caller reading every response is an agent, so bounded output,
an exit-code taxonomy, machine-readable envelopes and honest write-effect reporting are
the product, not overhead.

| Dimension | Condition |
|---|---|
| Users | The author, and the author's agents invoking built CLIs on the author's behalf. The author is also the operator and the only human who reads an error. Nobody else is affected when it misbehaves. |
| Trust | Callers are trusted: they are the author's own TypeScript, compiled against these types, in the same process. Argv, environment, stdin, payload files and any bytes read from disk are hostile and are parsed strictly. |
| Concurrency | Several invocations of the same built CLI may overlap — parallel agents, parallel git worktrees (assumed). They are the same user's processes, not adversaries. |
| Topology | One process plus child processes, on the author's machine (macOS; Linux in CI). A built CLI may call a remote service, but that transport is application-owned and opaque to the kernel. |
| Lifetime | Seconds per invocation; nothing in the kernel is long-running. Durable state belongs to the application. Artifacts the kernel writes are regenerable output, not a system of record (assumed). |
| Failure cost | A rerun, plus the author's time and the author's own data — no other person's data, no money (assumed). The exception is a built CLI that mutates remote state, where a write can end in a genuinely unknown outcome; that is what the applied/not_applied/unknown effect model is for. |
| Compatibility | Nothing outside this repository imports the library. The author's own projects are updated in the same change as a breaking one. On-disk formats the kernel owns — artifacts, retention sidecars, generated reference blocks — are read only by this code. |
| Scale | One person's data. Responses are bounded at 32,768 serialized UTF-8 bytes by default; anything larger spills to an artifact or pages with a read continuation. |

## Outside the envelope

- **Hostile callers in the same process.** Do not add token registries, forgery
  refusals, descriptor-level capture or deep re-validation to defend the kernel from
  the application calling it. A caller that wants to break the kernel can edit it.
  Validate at the real boundaries — argv, environment, stdin, files — and nowhere else.
- **Consumers the author cannot update.** No API versioning, deprecation shims, semver
  discipline, changelog, or compatibility ratchets against past releases.
- **A remote authority speaking this framework's protocol.** A built CLI may be a thin
  client over HTTP, but the service is not a peer that emits guidance candidates,
  envelopes or conflicting required instructions (assumed: revisit if one is built).
- **Concurrent writers racing between two steps of one operation.** Overlapping
  invocations are the same user's; no TOCTOU re-verification, no distributed locks.
- **A second machine, multi-tenancy, authentication, sessions, rate limiting.**
- **Operators diagnosing from outside the process.** No metrics, tracing, health
  endpoints, log rotation or alerting. The author reads stderr at a terminal.
- **Data that outlives code versions.** No schema migrations or format upgraders.
- **Runtimes the author does not run.** The Node 20 floor and current Node are real;
  Bun is unconfirmed (assumed). Drop a runtime rather than carry an untested one.
