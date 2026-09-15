# Remote pilot evidence

## Production surface

`examples/remote-service/cli.mjs` calls public `main`. The focused test bundles it
into one ESM executable, launches real Node child processes, and gives each test
its own ephemeral loopback HTTP server and temporary artifact directory. The
server's two-item store, receipts, requests, failure controls, and guidance firing
sink belong to that test. Cleanup closes connections, listeners and child streams;
children have a 15-second emergency termination deadline.

The declaration module imports neither handlers nor transport. Context selection
passes declared credential/global values to a lazy application-owned fetch service.
Doctor/schema use `requires: none`. The lazy Standard Schema decoder and pure
prepare reject invalid local files before any service request; validate shares
prepare and never commits. The application reports acknowledged receipts using
public recovery facts. Unknown acknowledgment remains the kernel's bounded fact
with command path and payload hash, without fabricated receipt IDs or secrets.

List is a production `page` caller over an already-paged HTTP response. It returns
one item, preserves unknown totals, and carries a typed read cursor continuation including the selected server and
workspace. References deliberately exclude credentials and use the declared
environment credential fallback.
Show has summary and artifact-eligible full detail. Server rules evaluate using
the pure guidance export and retain firing events at the authority. Client ingress
decodes candidates. The response arbiter combines them with a handler-local
instruction once, retains conflict provenance, and suppresses hints under stop
instructions. No handler or primary renderer writes process streams.

## Verification mapping

| Acceptance | Evidence in tests/pilots/remote.test.mjs |
| --- | --- |
| remote-production-cli | Bundled real children exercise paged list, show, validate/apply and wait/status. All seven inherited callbacks use the consumer registry and public runForTest; domain callbacks use real HTTP. |
| remote-contexts | Closed-server doctor/schema; five offline loader traces; zero requests on malformed JSON/schema; rejected token and explicit override; selected workspace observed by server. |
| remote-guidance | JSON/text full-response spill retains server stop; conflicting local instruction produces one stop-and-report conflict; inherited events assert one arbitration, one conflict and firings. |
| remote-disconnect | Injected clock holds status until advancement; cancellation retains doctor and exact cursor; bundled SIGINT/SIGTERM and destroyed TCP socket retain runnable status continuation. |
| remote-recovery | Real applied mutation and output failure retain compact receipt and stop; status observes the one persisted record. Lost mutation response yields unknown acknowledgment and status reveals the single receipt without replay. |

Inherited callback scope is explicit: offline controls exercise this registry;
JSON/text schema and conflict, unknown-total paging, hostile shell cursor,
exact UTF-8 boundary and one-astral-character overflow, and applied artifact-write
failure all invoke this consumer's production runtime. The testkit adds
observations; it does not replace the HTTP service. Paired recovery runs own
separate services so each independently reports receipt-1.

Initial fixture behavior tests failed before implementation. Later tests verify
existing production runtime behavior rather than adding parallel cancellation or
recovery logic. The initial missing TypeScript installation was a setup failure;
it was repaired with the locked development-only npm install and was not counted
as the TDD red assertion. Exact settled runs are listed in remote-pilot-output.json.

Source-of-truth entry 1, implementation-contract decisions 6 and 8–15, governs
local-first decoding, finite waits, one arbiter, protocol bounds, artifact policy,
app-owned transport, and inherited cases. Source AST checks and real loader traces
cover output/laziness; HTTP observations cover context/input order; recovery and
conflict assertions cover preservation. The package stays private with no runtime
dependencies. No consumer repositories, publication, live progress or git lifecycle
actions are involved.

## Final-audit continuation repair

Reviewing the actual emitted references exposed a gap hidden by the original test
helper: cursor continuations omitted the selected server/workspace, and the helper
added those flags when resuming. A new bundled-process regression failed on the
missing server field. The application now constructs page and wait/status
references with explicit nonsecret globals. The new test follows only the emitted
reference tokens and observes the selected workspace at the real service. All 21
focused tests pass after this repair. Governing entry 1 decisions 4, 8 and 13
requires runnable secret-free references; the kernel contract needed no change.
