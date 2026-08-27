# Security Review

## Threat model

For a local CLI operated on trusted specs, the attack surface is modest. The threat model changes materially when specs are LLM-generated, repositories are untrusted, an AI client can invoke MCP tools, or MCP is exposed beyond a single trusted user. `check` is an intentional arbitrary-code capability, so the central question is whether trust and consent are strong enough at each adapter.

## Principal risks

### Tracked credential and unsafe legacy test

A non-placeholder provider credential is present twice in tracked history already pushed to `origin/main`. A test explicitly uses it for real provider traffic. The team describes it as revoked; this audit did not attempt authentication and therefore cannot verify that. The value is never reproduced in audit output. See SEC-001.

### Shell execution trust

`verification.command` is arbitrary shell text. CLI dry-run and explicit `--yes` are valuable. They are insufficient when:

- the spec came from an LLM or untrusted checkout;
- check does not require lint, freeze, or verify;
- MCP exposes `yes` directly to an AI client;
- child processes inherit provider tokens and the user's filesystem authority;
- evidence records their raw output.

No shell escaping defect is needed—the product deliberately executes shell. The security defect is missing trust-state/consent containment around that capability.

### Filesystem/path boundary

CLI users intentionally choose any directory. MCP also accepts any path, with no workspace allowlist or realpath containment. Reads/writes follow symlinks. This is acceptable only under an explicit same-user/trusted-workspace model; it becomes a path-write primitive in remote/shared use.

### MCP protocol and resource surface

Positive: stdout purity held in a real process; arguments reject unknown keys; exceptions become structured `isError` responses; EPIPE is handled.

Gaps: invalid JSON-RPC versions/IDs are accepted; lines/in-flight work are unbounded; mutations race; output backpressure is ignored; EPIPE exits with work active. Error text can reveal paths and OS messages, appropriate locally but not for remote service exposure.

### Secret handling and evidence

The HTTP API key stays in process environment and Authorization headers and is not logged by spec-core. Provider error body excerpts are surfaced, which could contain sensitive upstream diagnostics. Verification subprocesses inherit the entire environment and their last 500 output characters can land in repository evidence with default permissions and no redaction.

### Dependency risk

Spec-core's only production dependency is Zod 3.25.76; no advisory surfaced specifically on that path. Workspace `pnpm audit --prod` reported 66 issues, all observed paths in legacy indexer/shared-observability dependencies. This supports isolation/archive, not a version-number-only alarm against spec-core.

## Security posture by deployment

| Deployment | Judgment |
| --- | --- |
| Trusted local CLI, dry-only | Reasonable |
| Trusted local CLI, reviewed `--yes` | Dangerous but explicit; needs frozen/verified binding |
| MCP controlled by a coding agent | Not safe enough for shell execution |
| Shared machine | Needs env scrubbing, path containment, process isolation, restrictive evidence modes |
| Remote MCP service | Unsupported and unsafe without authentication, authorization, quotas, sandboxing, and protocol hardening |

## Findings

SEC-001 through SEC-007 are canonical. PROD-001 is also a release-security boundary because wrappers/shebangs must be correct before distribution.
