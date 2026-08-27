# Reliability and Operations Review

## CI and release evidence

The workflow file is well-formed in intent: frozen install, path-scoped build/lint/test, Node 22/24 matrix, fixed pnpm, concurrency cancellation. The equivalent sequence passed locally on Node 24. It has never run remotely because spec-core and the workflow exist only in 39 local commits ahead of `origin/main`. Node 22 was therefore not independently exercised in this audit.

The workflow's generic name and root badge obscure that only spec-core is gated. Root build/test remain intentionally broken; the root test also contains a real-API test tied to a tracked key, so it was not executed.

## Failure and recovery behavior

| Failure | Behavior | Operator recovery |
| --- | --- | --- |
| Missing/bad section | path-specific compile exit 2 | Repair JSON/file |
| Blocked generation | reasons, exit 1, no write | Clarify intent; reasons are useful |
| Adapter failure | exception/exit 2 | Diagnose endpoint/env; no structured run record |
| Partial generate/init | partial spec blocks retry | Manual inspect/delete/restore; no recovery command |
| Freeze write interruption | possibly corrupt manifest | Restore from VCS/manual file |
| Partial change | draft/bumped manifest can strand CP | Manual reconstruction; no rollback/journal |
| Drift | section list, exit 1 | Diff manually |
| Check timeout | TIMEOUT but descendants may live | Manual process cleanup |
| Evidence write failure | exit 2 after commands ran | Results may be lost/partial |
| MCP client death | EPIPE exit 0 | In-flight work not drained/cancelled |

## Diagnostics and logging

CLI output is concise and usually actionable. Generation blocked reasons include schema/lint text and usage. There is no persistent generation run record, request/attempt timeline, retry logging, provider status, cancellation signal, or doctor command. MCP diagnostics go to stderr, preserving stdout protocol. This is adequate for a developer experiment, not pilot operations involving paid retries.

## Retry behavior

Each HTTP completion may take four attempts with 180-second request timeouts and 2/5/10-second backoff. Council validation may request six completions. There is no global deadline or abort propagation exposed by CLI/MCP. Timed-out requests may have completed/billed provider-side and are not counted.

## Packaging and publishing

Pack contents are appropriately narrow: dist, schema, examples, README, license, no fixtures/tests/env. `prepublishOnly` requires pnpm on PATH. The more serious issue is that the packed bins have no shebang. Build also does not clean dist. Publishing must remain blocked until a clean installed-package smoke passes.

## Health/self-diagnostics

A hosted health endpoint is N/A. A local `lco doctor` would nevertheless be valuable before pilot: Node/pnpm versions, bin integrity, schema freshness, provider configuration without revealing values, write permissions, and supported MCP protocol.

## Findings

OPS-001 through OPS-003, DATA-001, SEC-005, TEST-001/002, PROD-001.
