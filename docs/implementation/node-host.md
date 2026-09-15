# Injectable hosts

Governing source: `.cc/graph-workflow-docs/implementation-contract.md`, source-of-truth
entry 1, decisions 12 and 14. The canonical Host signature lives in
`src/runtime/index.ts`; checked bytes/durations come from upstream `src/values.ts`.

## Node boundary

`nodeHost()` lazily imports its private owner and Node filesystem/path/process
capabilities. Declaration imports acquire no Node builtins. Crypto is imported
only by `sha256`, including for identical-content collision checks (which compare
bytes directly). Private minimal Node declarations keep the existing dependency-free
package and public declaration surface independent of ambient Node types.

Reads count raw bytes, accept the exact limit including zero-byte files, and reject
overflow without returning a prefix. File input uses a nonblocking open followed by
a regular-file check on the opened descriptor, preventing named pipes/devices
from hanging an open or bypassing the check through a path replacement. Files use capped stream chunks, snapshot
retained buffers, and close the owned stream before settling. Abort retains an
error listener through close so a pending OS open cannot emit an unhandled error.
Stdin is borrowed: completion, refusal and cancellation detach listeners and pause
it without destroying the process stream. A subsequent read resumes it. Abort
reasons are preserved. Input streams must supply raw bytes, not previously decoded
text. A stream closing without EOF is an error. Callers must select a single stdin
consumer before reading (decision 4; parser ownership).

Canonicalization walks path components and resolves symlinks, including dangling
links and existing ancestors above a missing destination. Relative paths use the
process working directory. Symlink loops and non-directory ancestors reject. Trailing separators and final
`.`/`..` components retain their directory requirement, including inside symlink
targets. Existing directories return their normalized canonical path; a missing
directory-only result retains a trailing separator. Both atomic writers refuse
that result rather than creating a regular file.
`kind` follows links, distinguishes files/directories/missing entries, and rejects
unsupported special files or other OS errors.

Atomic writes snapshot input bytes before awaiting, stage a private file in a
unique directory beside the canonical destination, flush and close it, and publish
via a hard link that cannot replace an existing directory entry. Existing regular
files are read with a bound of the proposed byte length; only exact byte identity
is reusable. Differing content, oversized files and nonregular destination entries
are refused. The parent directory is flushed, and staging is removed in a finalizer.
The parent must exist; callers own directory selection/provisioning. A filesystem
without hard-link or directory-sync support reports an error rather than using a
clobbering fallback. These real filesystem tests demonstrate publication, collision
refusal and cleanup; they are not simulated storage evidence or power-loss tests.

Canonical policy containment and forbidden roots belong to artifact-delivery.
Host operations cannot promise containment against a separate process concurrently
replacing directory ancestors; there is no portable directory-descriptor-relative
filesystem API in this minimal Node boundary. Stable symlink ancestors are resolved
before publication, and destination collisions never replace unrelated content.

`now` returns epoch milliseconds. Real sleep preserves abort reasons, removes
listeners/timers on settlement and chunks durations above Node's signed 32-bit
maximum timeout. Hashing snapshots bytes before lazy crypto acquisition.

## Deterministic test boundary

`createTestHost({files, stdin, now})` is synchronous. Its file namespace is POSIX,
rooted at `/`; relative fixture/operation paths are interpreted there. Initial
fixtures create implied parent directories and reject duplicate normalized paths
or file/directory conflicts, including directory-only file fixture keys. No symlink,
device, permission or durability simulation
is claimed. Use the Node host and real temporary directories for those assertions.
The supported regular-file subset shares bounded reads, missing/non-directory
errors, canonical paths, file kinds, identical reuse and unrelated collision refusal.
Writes require an existing parent, including directories implied by initial files.

Initial fixture bytes, write inputs, read outputs and `filesSnapshot()` buffers are
detached. Snapshot keys are canonical absolute paths. Snapshot maps and captured
call records are frozen; buffers remain caller-mutable copies. `calls` returns a
frozen snapshot in invocation order, including failed operations. Snapshot inspection
and clock advancement are test controls and do not append host calls. Hash requests
are captured and use the same lazily loaded SHA-256 implementation as Node.

Stdin is a finite UTF-8 fixture, consumed by the first non-pre-aborted read (including
an overflow refusal); subsequent reads see EOF. Omitted stdin is empty. Interactive
arrivals and stream lifetime/error tests use real child-process pipes in the Node
suite, not this finite fixture.

The fake clock defaults to 0. `now` must be safe integer epoch milliseconds;
`advance` and sleep durations use the checked nonnegative millisecond unit. Clock
and deadline arithmetic reject unsafe integer overflow. `advance(n)` moves to the
new time and resolves all currently scheduled due sleeps in deadline order, with
insertion-order ties. Even zero-duration sleeps require `advance(0)`. Promise
continuations run at the normal microtask boundary, after `advance` returns; a
continuation that schedules another sleep requires a subsequent advance. Aborting
removes the waiter immediately and preserves the abort reason. Completion and
cancellation detach signal listeners. No real timer drives the fake clock.

## Integration ownership

This context supplies the explicit public Node and testing host factories.
Runtime-composition owns omitted-host selection in `runCli`; process-adapter owns
process output, drains, exit and compile cache. Their existing stubs are intentionally
retained per the contract. No application transport or handler is initialized here.

Exact-file TDD and settled validation results are in `node-host-output.json`.

## Validator advisory repair

Advisory `1:general:1` identified discarded directory-only path semantics. Four
new behavior tests failed before the repair. Node/test canonicalization now rejects
existing regular files followed by a separator, `.` or `..`; test reads/kinds match
Node refusals. Missing directory-only destinations preserve a trailing separator
and cannot be published as files. Tests also cover symlink-target spellings, valid
directory controls, rejected fixtures and absence of writes/staging leftovers.
