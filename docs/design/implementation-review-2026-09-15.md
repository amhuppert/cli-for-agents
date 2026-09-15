# Implementation review — 2026-09-15

**Remediation status: R1–R3 are resolved in the working tree; final typecheck, build and full tests pass.** See the remediation follow-up below for changes and validation evidence.

**Original review verdict: the approved milestone is substantially implemented, but three P2 correctness/type-contract gaps prevent an unqualified sign-off.** No major promised subsystem is missing. This is a review of the implementation, not a proposal to expand the milestone or a remediation patch.

Reviewed source: `9f6d22fa524dc40c54b9c0f0f034583e7a3d56aa`, the completed workflow's merged session tree. Governing requirements are `.cc/graph-workflow-docs/implementation-contract.md` decisions 1–15, its charter/source hierarchy, and `docs/design/public-contract.md`. Historical scaffold-only wording and explicitly excluded consumer migrations are not treated as missing implementation.

## Findings

### R1 — P2: Hint references retain an Invocation type after losing its runtime identity

Location: `src/guidance/index.ts:32–38`; propagation through `src/internal/execution-reports.ts:20` and the live/detached distinction in `src/internal/registry.ts:206–213`.

`hint()` JSON-clones its invocation. The resulting `Hint.invocation` still has the public nominal `Invocation` type, but it no longer has the provenance required by the public `renderInvocation()` function. Thus ordinary, well-typed composition of these two public APIs throws:

```ts
const ref = invocation(registeredCommand, {});
renderInvocation(ref, 'tool');                         // succeeds
renderInvocation(hint(ref, 'Inspect').invocation, 'tool'); // throws
// TypeError: Unknown or forged invocation token.
```

There is no public rebinding API. The existing test at `tests/registry.test.mjs:397` explicitly expects the rejection and repairs it with a private import. That proves detachment is an intentional implementation choice, but it does not resolve the public type/API mismatch.

It also erases a useful distinction during production processing. A live invocation from family B is rejected by the membership check for family A. Passing that reference through `hint()` first, then returning it from an A handler, permits it when A has a same-path, compatible command: the runtime silently treats it as a detached wire reference and emits A's command. The reproduction returns exit 0 and `Inspect foreign state: tool inspect`. Detached remote references are legitimately supported; the problem is silently converting a local identity-bearing value into that different category while keeping its type.

This conflicts with the nominal-type goal and the contract's current-registry validation guarantee. Preserve local provenance through hint/result/error admission, or give detached references a distinct type and a supported rendering/rebinding path. Merely changing `hint()` is insufficient while downstream snapshots also discard identity. Add public-only composition and same-path foreign-reference regression cases.

Reproduction: `.cc/temp/implementation-review/invocation-provenance.mjs`. It exercises the public API failure and production hint output; one private call is used only as a control demonstrating the original reference's rejection.

### R2 — P2: Optional context-map keys allow a required provider to be omitted at compile time

Location: `src/runtime/index.ts:86–87`; context-map admission at `src/commands.ts:176–179`.

`ContextProviders` is a homomorphic mapped type, so it preserves optional modifiers from the caller's context map. The following family and command are accepted, and `createCli` accepts `contexts: {}`:

```ts
const family = commandsFor<{ remote?: { value: string } }>()({
  errors: defineErrors({}), globalFlags: {},
});
// Define a command with requires: 'remote'.
// createCli({ family, commands: [command], contexts: {}, ... }) compiles.
```

The complete public-package reproduction compiles with zero diagnostics using strict TypeScript, NodeNext, and `exactOptionalPropertyTypes`, then fails during `createCli` with `TypeError: Missing context provider.` No cast, `any`, suppression or malformed JavaScript is needed.

The runtime safely rejects the configuration, but this is precisely a configuration bug the family contract is meant to make a type error. `type-tests/family-negative.ts:36` already states the intended invariant: all context keys have a provider. Its current fixture only covers required context properties.

Either reject optional context-map keys at `commandsFor`, or remove optionality when deriving providers (`[K in keyof Contexts]-?`). Add an isolated compiler control for an optional context property paired with a command requiring it.

Reproduction: `.cc/temp/review-public/optional-context.mts` and emitted `.mjs`; independently checked by two reviewers.

### R3 — P2: The wire decoder brands contradictory artifact metadata as valid

Location: `src/results.ts:323–326`; compare writer validation at `src/internal/artifacts.ts:93–97`.

`decodeEnvelope()` checks `format` and `contains` independently and validates `mediaType` only as nonempty text. It accepts each of these invalid changes to an otherwise valid binary artifact envelope:

```json
{ "format": "binary", "contains": "data", "mediaType": "application/octet-stream" }
{ "format": "binary", "contains": "binary", "mediaType": "not-a-media-type" }
```

Both are returned with the `ArtifactManifest` brand. The production writer rejects binary/content disagreement and validates media-type syntax. The decoder therefore grants consumers stronger apparent assurance than it actually checks, despite the strict wire-admission requirement. This is an ingress defect; it does not demonstrate the library's writer producing an invalid file or a filesystem-authority bypass.

Share the applicable metadata invariants between writer and decoder, without conflating wire shape with filesystem authority. Prefer a discriminated manifest type for binary/content correlation. Add malformed-envelope controls for both cases; no new network or filesystem capability is needed.

Reproduction: `.cc/temp/implementation-review/artifact-decoder.mjs`. A canonical manifest passes as a control; each invalid variant also incorrectly passes.

## Coverage and positive assessment

Three independent review slices plus the composition review covered the major owners, public declarations, existing tests, and the finite workflow acceptance matrix:

| Contract area | Assessment |
| --- | --- |
| Four public ESM exports, dependency-free kernel and private internals | Implemented; package remains private with no runtime dependencies. |
| Family declarations, parser, defaults, files/stdin, selectors and secrets | Substantially implemented and tested; R2 narrows the provider completeness guarantee. |
| Lazy local/schema validation, direct/payload runners and preparation tokens | Implemented; input checks precede application acquisition, twins avoid commit, and token ownership/consumption is checked. |
| Context lifetime and production wiring | Implemented; post-operation guidance/policy settle before release; cleanup and known operation outcomes are preserved. |
| Guidance candidates, firing diagnostics and one arbiter | Implemented; deterministic selection, conflicts and sink failures are covered. R1 exposes an identity/type mismatch at the reference boundary. |
| Effects, domain precedence, recovery and byte-bounded output | Implemented, including serialized UTF-8 accounting, required protocol reserves, omission and emergency text projection. |
| Artifact policy, collisions, binary output, retention and Node host | Implemented; canonical/symlink checks and no-clobber behavior are present. R3 affects wire admission rather than production file writing. |
| Offline help, bounded enrichment, references and page disclosure | Implemented through shared declarations and actual reference-file checks; unknown totals and read continuations are preserved. |
| Process drain, EPIPE, cancellation and no replay | Implemented and exercised with real children. |
| Consumer testkit, installed-package checks and distribution | Implemented; isolated public imports, private-path rejection, compiler controls, lazy startup and ratchets are exercised. |
| Local and remote executable pilots | Implemented; actual persistence/loopback transport and all seven consumer callbacks are covered. |

Architecture assessment: **approximately 8/10**, with deep ownership of parsing, execution, arbitration and delivery. The weak software-design diagnostics are information hiding across module changes and understanding boundaries from public interfaces: invocation binding state is hidden from its public type, while artifact metadata rules are duplicated inconsistently. R1/R3 need those rules centralized and represented accurately; R2 needs the provider contract to encode its actual requirement. This is a qualitative architecture score, not a correctness probability or a measurement of engineering time allocation.

## Fresh verification

| Registered command | Result |
| --- | --- |
| Full typecheck | Passed — `vrun-5f4ad14e-1681-42d1-9a69-b4292cc53af2` |
| Full build | Passed — `vrun-375015d6-727f-438d-94d5-16cba8f338e2` |
| Full test suite after dependency setup | Passed — `vrun-c25d4bc7-8ae8-40b3-840a-d3e1fc6e8db6` |

The first test attempt (`vrun-2fbc55ff-2260-462e-8025-6234adc551ac`) could not load the distribution/local/remote pilot suites because this worktree lacked the declared `esbuild` dev dependency. Its other 699 tests passed. Running the existing `scripts/worktree-init.sh` restored lockfile dependencies without changing the manifest or lockfile; the subsequent full suite passed. This setup issue is not counted as a library defect. The passing wrapper is intentionally silent; no total assertion count is inferred for the successful run.

The three findings were independently reproduced beyond the existing passing suite. No library source, test fixtures, workflow state, or dependency declarations were changed during review. This report and ignored diagnostic artifacts are the only review outputs.

## Limits and recommendation

This is a source/contract review with fresh registered checks and focused reproductions, not a formal proof for arbitrary callbacks or every operating system. Existing runtime compatibility tests ran as part of the full suite; hosted CI execution is not newly claimed. Preparation purity, reported domain truth, transport authenticity, durability and cooperative cancellation remain application responsibilities, as documented. Portable path checks cannot prevent hostile concurrent ancestor replacement; that limitation is disclosed rather than silently promised away.

Consumer migrations, publication, Commander replacement, optional kits, streaming/progress/raw-output APIs and plugin synchronization remain approved non-goals. The compile-only notebook is not an unfinished executable pilot.

Address R1–R3 with targeted regression controls, then repeat the relevant registered checks. The implementation does not need a broad rewrite or a new feature phase to close these findings.


## Remediation follow-up

The three findings have been addressed in the working tree:

- **R1:** invocation constructors mark a private canonical origin. Descriptor-checked internal JSON snapshots preserve that origin through both cloning stages, so hints and catalog continuations remain usable by public rendering and cannot silently acquire a different local command identity. Actual JSON serialization carries no identity and continues through ordinary receiving-registry validation. No public export or import edge was added.
- **R2:** provider maps remove optional property modifiers. An optional app value remains allowed, but its provider cannot be omitted. The consumer testkit derives the same required map. Unsuppressed positives cover object and undefined app values; negative fixtures reject omitted providers.
- **R3:** binary requests, artifact writing and wire decoding share pure media-type and artifact-metadata validation. Binary/content contradictions and malformed MIME strings are rejected before granting the wire brand.

Each correction started with a regression that failed for the reported behavior. R2 is a type-only correction and used compiler red/green controls rather than a manufactured runtime failure. R1 adds public rendering and same-path foreign-reference controls for handlers, local rules and error continuations, with transported-JSON controls. R3 adds invalid metadata and valid MIME/format boundary controls.

Final registered validation after all source changes:

| Command | Result |
| --- | --- |
| Full typecheck | Passed — `vrun-346cee9e-5e1c-47ca-96be-c698579a784d` |
| Full build | Passed — `vrun-1b49b466-01c3-42d4-85d5-7d22a7922010` |
| Full test suite | Passed — `vrun-7d291444-d11d-4eca-b65b-a4d74fb79b2b` |

The full suite includes distribution, compatibility, process and both executable pilot checks. The consumer bundle measures **107,921 bytes**, below the existing **107,929-byte** ceiling. The ceiling, eager-import allowlist, fixtures and build settings were not relaxed. Shared validation and removal of a one-use writer wrapper offset the added provenance handling. `git diff --check` also passes.
