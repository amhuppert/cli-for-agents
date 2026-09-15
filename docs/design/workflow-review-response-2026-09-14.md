# Implementation graph review response

This revision addresses the findings recorded by conversation
`16627048-f8c2-4231-8b1e-32301bb96675` against plan hash
`b998b5d81c0f680b453aea8b3b0a9a72ea416b01d52ebf2aba0cf3bed070fd71`.
The revised graph has 19 contexts, 50 tasks and 26 edges. It remains a planning
draft; no runtime implementation or workflow execution begins with these repairs.
It is saved as revision 2 of workflow
`e88c16c2-f83e-46de-bd07-de9ba6070ac6`. Revised plan hash:
`57fad5ae5957dcf81985d9ac062b31a65e8f937fca3765efc6d486363f5e2ff2`.

| Finding | Repair |
| --- | --- |
| F1: missing Node 20 | The seeded launch contract names exact absolute commands for Node 20, current Node and Bun. The Node 20 location is explicitly absent until provisioned. `baseline-record` checks these before implementation and records versions/paths in `baseline.md`; distribution consumes the same paths and retains the no-silent-skip rule. |
| F2: nonexistent preserved check | `type-regressions-held` now identifies the emitted-declaration check as new work introduced by `distribution-guards.package-boundary`. Existing isolated result controls and misuse fixtures remain preservation obligations. |
| F3: canonical wrapper obligation | Deleted `canonical-validation`. Harness criteria now require local harness behavior and retained evidence of the registered single-file invocation. They do not ask a lane to repair the canonical wrapper. |
| F4: constructor deferral | `foundation-callers` now covers public exports only. A scoped `canonical-constructors` invariant owns reuse in registry, execution, response, delivery and runtime composition. |
| F5: bundled lifetime criterion | Split none-bypass, keyed-provider inputs, exactly-once finalization, and release-after-hook criteria. The foundation defines the private hook; execution verifies it with injected consumers; runtime supplies actual guidance and app-policy resolution. |
| F6: missing criterion homes | Registry rejection now includes missing/unrunnable/non-read doctors for connection-class catalogs. Response owns central exit-3 doctor insertion. Execution rejects handler/commit codes outside the family plus KernelCode. |
| F7: undefined documentation-root contract | Foundation now declares the root and validation seam. A separate help/reference criterion and the actual reference write/check command own missing/outside-root rejection. |
| F8: missing violation inventory | `invalid-fixture-suite` enumerates the seven violations directly: offline handler loading, lost schema issues, repeated arbitration, invented totals, unsafe references, Unicode byte errors and lost recovery. |
| F9: global bundled invariant | Replaced `canonical-declarations` with separately scoped declaration-derivation and compiler-control invariants. |

Two suggested wordings needed adjustment to match the existing design. For F3,
the canonical launcher is silent on success, so scope evidence comes from the
requested path and settled CC run metadata, not invented filename stdout. For F7,
synchronous `createCli` remains free of filesystem acquisition. The asynchronous
reference build/check path validates registered document references using a lazy
or injected host. This preserves the required existence check without adding
filesystem IO to declaration construction.

Finalization applies only after successful acquisition. The injected hook is
allowed to fail or be cancelled; either path still releases exactly once and
retains the operation outcome. None/failed-acquisition paths have no finalizer.

The advisory repairs are included: the minimum 8192-byte budget now has delivery
and runtime criterion homes; page disclosure has its own ordered routing context;
context descriptions identify existing versus upstream-produced premises; and
the parser, delivery, composition-failure and remote-live tasks are split at
bounded behavior sets. A third seeded document supplies the historical review
linked relatively by `review-response.md`, keeping that snapshot byte-identical.

Live premise checks confirmed current Node v24.16.0 and Bun 1.3.14 at the named
paths, Node 20 absent from the checked installations, zero canonical validation
registrations, and emitted-package checks present only in ignored scratch files.
These are launch-preparation facts, not additional implementation claims.

`cctl workflow validate --file .cc/temp/plan.json` passes without warnings. Changes
are planning documents and graph configuration, so there is no runtime behavior
for a test-first loop. A separate subagent audit found no remaining finding
omissions. The saved definition and layout match the intended plan. No external
verdict is recorded for the new hash; the original review remains attached to its
original hash and no approval is carried forward or attributed to that reviewer.

The revised seed documents and graph layout require replacement of the saved
definition: CC's targeted edit API rejects those fields. The replacement retains
the workflow ID and uses the observed revision as its concurrency check. The
gate-binding template includes the new page context and must use the latest saved
revision when applied after registration. Provisioning runtimes, promoting the
scaffold and binding registered gates remain required before launch.
