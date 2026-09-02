# 00 — Remediation Verdict

Date: 2026-09-02
Branch: `fix/legacy-renewal-v1-second-audit-blockers`
Base (audited second-audit HEAD): `40e6b1bfe15bc471d7ef09da5f3524fcd2312773`
Implementation HEAD: see 14-FILES-COMMITS (9 commits after base: plan + 7 invariant commits + verifier-hardening commit)

## Verdict: READY_FOR_THIRD_INDEPENDENT_AUDIT

Not GO — the release verdict belongs to a fresh independent audit. This verdict states only that every second-audit root invariant is implemented at a shared boundary with mutation-sensitive tests, every audit reproduction fails closed, the independent verifier pass found no surviving Critical/High defect, and all ordinary gates pass.

## What changed, in one paragraph

The remediation did not patch findings; it derived eight root invariants (A filesystem trust domain, B project/snapshot identity + versioned state, C provenance ≠ semantic support, D authority/canonical destructive decisions, E bounded sanitized paid boundary, F effectual consent/budget, G strict Graphify identity, H release contract) and enforced each at one shared boundary: every renewal state destination is no-follow-authorized at command entry AND re-authorized immediately before every trusted write; the project's target pointer is cryptographically joined to the snapshot's recorded root; trusted-store folds re-read under the lock with human-authority precedence and a state-revision counter; promoted claims carry provenance scope and an honest `unvalidated` support status until a human rules them; approval digests bind all authority-bearing fields and rulings authorize only via canonical option ids (the keyword parser is deleted); one egress sanitizer covers every repository-derived string inside a line-separator-safe envelope under an actual-byte prompt cap; one budget ledger charges reported attempts and accounting reads the real response shape; MCP consent binds the resolved route and transitive roots; Graphify manifests/graphs parse strict-fail-closed with typed health; artifact hashing is canonical (key-order-independent) with legacy-compatible verification; the publish workflow installs the pinned Graphify and runs the coverage gate.

## Gate summary (final build, primary-context verified)

| Gate | Result |
|---|---|
| build | PASS |
| lint (tsc, both configs) | PASS |
| tests | 153 files / **2,193 passed** (base: 150 / 2,053) |
| coverage | statements **93.89%** / branches **89.39%** / functions **96.61%** / lines **93.89%** (thresholds 91/89/96/91; audited baseline 93.64/89.19/96.08/93.64 — every axis above both; zero ignores added) |
| schema freshness | PASS (0 diff after rebuild) |
| packed install + smoke | PASS (pack → install → init → doctor → MCP handshake → offline browser clarification → renewal offline surface) |
| Graphify 0.9.50 (installed) | 7/7 integration PASS |
| Graphify 0.9.53 (isolated venv) | 7/7 integration PASS (global untouched) |
| target immutability | PASS — symlink repro + neighbor matrix + mid-call plant all refuse with byte/mode/symlink inventory identity |
| concurrency matrix | PASS — preserve-survives-analyze barrier, lock refusal, mid-call supersession refusal, idempotent folds |
| pre-Renewal frozen-spec verify | PASS — the audit's own fixture (`/tmp/lco-base-compat-AuKMbq`, base exit 0 / remediation-base exit 1) verifies **exit 0**; semantic change still drifts exit 1 |
| `git diff --check` | CLEAN at HEAD and vs `feat/legacy-renewal-v1` |
| real paid LLM calls made | **0** (scripted providers only) |

## Independent verification (read-only agents, no implementation context)

Three verifiers ran ~200 adversarial probes across INV-A/B, INV-C/D, INV-E/F/G/H including mutation-clone testing on /tmp copies: **every invariant HELD**. Ten findings total: 6 fixed with committed regression tests (fold-time write re-authorization; read-before-gate ordering; symlinked-root availability; PAR→PAR link authority closure; anchor-table framing escape; two unkilled mutations now killed), 4 documented (13-RESIDUAL-RISKS). Verifier mutation-sensitivity tables are folded into 11-TEST-MUTATION-MATRIX.

## Closure totals

- S2 Critical: 5/5 CLOSED · S2 High: 11/11 CLOSED (S2-H-09's clean-runner proof is inherently CI-time — local evidence provided) · S2 Medium: 5/5 CLOSED · S2 Low: 4/4 CLOSED
- Reopened originals: 19/19 CLOSED via the same invariants
- Locked architecture: untouched (analysis+planning only; Graphify external/pinned/fail-closed; no indexer/council/vector revival; council remains MODERATE_REFACTOR_REQUIRED and out of scope)

## Residuals (13-RESIDUAL-RISKS)

Same-state consent replay nonce (deferred, documented) · microsecond check-then-write TOCTOU (nowhere minutes-wide; local racing writer outside threat model) · pattern-based redaction · pre-remediation digest-v1 approval records fail closed · publish clean-run proof at next dispatch · recovery recall/precision unproven (unchanged).

No push, no merge, no target mutation, zero paid calls. The third audit's entry point is 15-THIRD-AUDIT-HANDOFF.
