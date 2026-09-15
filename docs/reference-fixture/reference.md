# Generated fixture reference

This file exercises in-repository generation. Handwritten content stays outside the markers.

<!-- BEGIN GENERATED COMMAND REFERENCE -->
## reference-fixture

reference-fixture
reference-fixture

Usage: reference-fixture <command> [options]

Commands:
reference-fixture doctor — Diagnose local setup
reference-fixture records — Records

Flags:
--workspace <string> — Workspace name [global; string]
--help — help output. [framework; boolean]
--json — json output. [framework; boolean]
--version — version output. [framework; boolean]

## doctor

Diagnose local setup
Inspect local setup without changing it.

Usage: reference-fixture doctor [options]

Effects:
read

Global flags: reference-fixture --help

Examples:
reference-fixture doctor — Inspect status

## records

Records
Inspect and update records.

Usage: reference-fixture records <command> [options]

Commands:
reference-fixture records show — Show a record
reference-fixture records validate — Validate: Write a record
reference-fixture records write — Write a record

Global flags: reference-fixture --help

## records show

Show a record
Read a record with explicit detail selection.

Usage: reference-fixture records show <id> [options]

Effects:
read

Arguments:
id — Record ID (required; string)

Global flags: reference-fixture --help

Flags:
--full — Select full detail. [selector; boolean]
--out <path> — Write artifact to this path. [framework; output destination]

Levels:
full: --full (artifact-eligible)

Examples:
reference-fixture records show --full -- 'example record' — Inspect all record details

Rules:
- inspect-before-write: Inspect the record before changing it.

Related:
reference-fixture records write --help — Apply

Skills:
guide.md — Before working with records.

Flows:
record-update: records show (Inspect) → records write (Apply)

## records validate

Validate: Write a record
Validate and apply a bounded payload.

Usage: reference-fixture records validate --file <path> [options]

Effects:
read

Global flags: reference-fixture --help

Flags:
--file <path> — Read structured payload from a file or stdin (-). [payload; file or stdin (-), max 4096 bytes; required]

Payload:
Structured file or stdin (-), maximum 4096 bytes.

Examples:
reference-fixture records validate --file=record.json — Apply a validated record

Related:
reference-fixture records show --help — Inspect before changing.
reference-fixture records write --help — Apply

Flows:
record-update: records show (Inspect) → records write (Apply)

## records write

Write a record
Validate and apply a bounded payload.

Usage: reference-fixture records write --file <path> [options]

Effects:
write

Global flags: reference-fixture --help

Flags:
--file <path> — Read structured payload from a file or stdin (-). [payload; file or stdin (-), max 4096 bytes; required]

Payload:
Structured file or stdin (-), maximum 4096 bytes.

Examples:
reference-fixture records write --file=record.json — Apply a validated record

Related:
reference-fixture records show --help — Inspect before changing.
reference-fixture records validate --help — Validate this payload before applying it.

Flows:
record-update: records show (Inspect) → records write (Apply)

## Exit codes

0: success — The command completed successfully.
1: failed — The operation failed.
2: usage — Correct local arguments or input before retrying.
3: connection — Diagnose connection or context acquisition with the registered doctor.
4: version — Resolve version incompatibility before retrying.

KERNEL_USAGE: exit 2 (usage) — The invocation does not match the declared CLI contract.
KERNEL_CONTRACT: exit 1 (failed) — An application or protocol value violated its declared contract.
KERNEL_INPUT: exit 2 (usage) — Local file, JSON or schema input could not be validated.
KERNEL_CANCELLED: exit 1 (failed) — The operation was cancelled.
KERNEL_HANDLER: exit 1 (failed) — The handler did not return an acknowledged outcome.
KERNEL_CONTEXT: exit 3 (connection) — The required application context could not be acquired.
KERNEL_GUIDANCE: exit 1 (failed) — Required guidance conflicted or could not be collected.
KERNEL_OUTPUT: exit 1 (failed) — The bounded response could not be rendered or delivered.
KERNEL_RELEASE: exit 1 (failed) — The application context could not be released.
RECORD_MISSING: exit 1 (failed) — The record does not exist.
<!-- END GENERATED COMMAND REFERENCE -->

End of handwritten reference.
