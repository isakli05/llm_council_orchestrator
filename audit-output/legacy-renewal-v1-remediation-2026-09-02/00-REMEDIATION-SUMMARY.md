# 00 — Remediation Summary

**Date:** 2026-09-02
**Branch:** `fix/legacy-renewal-v1-release-blockers`
**Base:** `feat/legacy-renewal-v1` @ `f71cbc19996b469ea348e8b5dc096312e1d93c28` (the audited NO-GO HEAD; verified before branching)
**Input:** the independent release audit (`audit-output/legacy-renewal-v1-final-release-audit-2026-09-02/`) + the forensic audit's locked architecture.
**Discipline:** no push, no merge, no council work, no architectural revival; Graphify stayed external/pinned/fail-closed; Renewal stayed analysis+planning only.

## Verdict

**READY_FOR_SECOND_INDEPENDENT_AUDIT** — 10/10 Critical findings CLOSED with negative mutation tests; **13/13 High findings CLOSED** (H-01 coverage gate closed: branches 89.17–89.19% ≥ 89%, functions 96.08% ≥ 96%, thresholds untouched — three consecutive stable runs); 8/8 Medium and 3/3 Low CLOSED. All gates green: build, lint, 2053/2053 tests, coverage, schema freshness, packed install + MCP handshake, real Graphify integration. The closure tranche also found and fixed two genuine production defects (an args empty-value grammar hole and a ReDoS in the secret-redaction path) with regression tests — see report 11. This is a readiness claim for a NEW independent audit only, not a release verdict.

## What changed (by trust invariant)

| Invariant | Now enforced |
|---|---|
| Path-domain disjointness | One canonical realpath check rejects equal/ancestor/descendant/symlink/textual-alias project↔target pairs BEFORE any write; failed inits leave the target tree-hash identical (bytes+modes+links) |
| Export containment | MCP `lco_renew_export` is genuinely read-only (no `out`; returns content; no-write tree-hash test). CLI `--out` is root-contained, no-clobber, no symlink escapes |
| Self-verifying snapshot | `snapshot_id` recomputed from identity fields at load; tamper = `snapshot_corrupt`; graph BYTES bound (`graph_digest`); strict manifest identity (malformed/absent = typed failure, never empty-identity fresh) |
| Single active snapshot | Every store binds `snapshot_id`; analyze/review/plan refuse cross-snapshot state; refresh ARCHIVES per-snapshot stores under their old RSN and keeps analyses/approvals as history |
| Paid-call bracketing | probe → freshness → (MCP: state-bound consent) → budget → call → freshness AGAIN → promote; mid-call mutation = `blocked_stale` with usage recorded, nothing promoted |
| Evidence provenance | anchors must be context-supplied (relevance), node-linked anchors verified against the graph, line ranges possible-on-disk and node-coherent; model-invented paths/nodes never promote |
| Fail-closed persistence | missing ≠ corrupt (typed loads); corrupt stops the operation, never empty-overwrite; duplicate ids / duplicate active records / contradictory rulings are corrupt state |
| Approval integrity | content_digest + per-decision evidence hashes recomputed on load; approvals snapshot-bound; parityGate resolves approval REFERENCES (fabricated `APPR-9999` blocks) and checks the decision authorizes the exact ruling |
| Validate-before-write | SpecBundleSchema.parse + lint + topology inside the planner; unscoped parity refuses up front; pre-write freshness recheck — nothing written on refusal, non-zero exit |
| Egress minimization | 4-layer documented secret policy (incl. GitHub/Slack-xoxb/OAuth/JWT/DB-URL/camelCase assignments); L4 output redaction with explicit markers + counts; JSON-envelope prompt (delimiter collision impossible); slices reserved first in bounded context; empty analysis = blocked, never success |
| Consent binds effect | renewConsentDigest covers protocol version, root, ACTIVE snapshot + graph digest, scope, profile fingerprint, resolved model, budget envelope |
| Honest verification | no fake parity test; manual-review tasks for unsupported/ungraphed material and overlay review records; planner CONSUMES overlay (preserve→protected, risk→risk, review→tasks) |

## Gate results (this branch, final run)

| Gate | Result |
|---|---|
| build | PASS |
| lint (both tsconfigs) | PASS |
| tests | PASS — 150 files / 2053 tests (baseline at audit: 133/1822) |
| generated schema freshness | PASS |
| smoke:packed (pack → install → lco init → lco-mcp handshake → renewal offline surface) | PASS |
| test:coverage | **PASS (exit 0)** — branches 89.17–89.19%, functions 96.08%, statements/lines 93.64% (thresholds unchanged; audit baseline was 85.98/94.28) |
| real Graphify 0.9.50 integration | 7/7 PASS (incl. the new CI canary logic) |
| CI Graphify install | workflow updated (floor 0.9.50 + current 0.9.53, both re-verified on PyPI this session) |

## Commits (this branch)

`3e00302` plan → `2623d0d` TRACK A → `a862dc9` TRACK B → `732f65b` TRACK C → `868e607` TRACK E → `8e17922` TRACK F → `859f2e3` TRACK G → `8e850ee` TRACK H+D → `cea5fbf` TRACK I → `44424cc`/`62c14ab` TRACK J (tests) — 11 commits, no squash, implementation history untouched.
