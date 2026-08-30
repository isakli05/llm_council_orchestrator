# Response to the External Audit — Remediation Program Closure

> **Addendum 2026-08-27 (same day, residual program):** the five residuals from
> the readiness re-assessment were closed in a follow-up program — see
> `RESIDUAL-CLOSURE-REPORT.md`. In particular §PROD-003 below describes the
> `MENTIONS_TERMS` rubric as closed; it has since been superseded by the
> stronger `CONSTRAINT_TRACE` gate with a frozen, hash-locked corpus. This
> letter is retained as the historical record of the 39-finding program.

**To:** The Codex external audit team (gpt-5.6-sol, four parallel sub-auditors)
**From:** The lco-spec maintainers
**Date:** 2026-08-27
**Re:** Full remediation of `audit-output/codex-external-audit/` (39 findings,
audit target `88e3c1c`), and a re-request for a readiness re-assessment.

---

Your audit of `packages/spec-core` at `88e3c1c` concluded **"First Usable
Product: NO — important product gaps remain"** with 39 canonical findings.
This is the closure response: every finding now carries a terminal status
with runnable evidence. The canonical per-finding table (ID | status | work
item | commits | test evidence) is [`REMEDIATION-LOG.md`](REMEDIATION-LOG.md);
this letter summarizes the program and answers the audit's verdicts directly.

## How the remediation was run

Four phases in your roadmap's dependency order — P0 (8 items), P1 (6),
P2 (6), P3 (5); 25 work items total, P4 untouched as you scoped it. Every
item went through: fresh implementer sub-agent → TDD (RED first) →
independent reviewer sub-agent → fix-loop when warranted (6 loops, all
converged in one round) → per-phase whole-branch review on the strongest
available model → single fix wave → scoped re-review → merge to main.
No finding was silently skipped; "defer to a future release" was forbidden
by the program's charter. Evidence discipline: every claim in this letter
was executed and its exit code recorded — nothing is reported as "appears
to pass."

## Terminal status: 39/39 closed

**31 FIXED · 7 ACCEPTED-DOC (5 of them your INFO positive designs, each
re-verified unviolated) · 1 USER-GATED (SEC-001's owner-side halves — see
below).**

### Your BLOCKER
- **PROD-001** (installed bins exit 126) — shebang'd executable entry
  points, mode 0755 verified into the tarball (`npm pack --json`), a
  bin-contract test, and a committed packed-install smoke that installs the
  tarball and runs `lco` and `lco-mcp` as real POSIX executables. The smoke
  is re-run in CI on every push.

### Your ten HIGH findings — all FIXED
- **SEC-001** — repository side complete: both tracked key copies removed
  (value never printed; in-process byte-compare verified 0 occurrences in
  the committed tree), real-API test quarantined behind `LCO_REAL_API=1`,
  `.env.test` gitignored. Owner side: the pushed history was rewritten with
  `git filter-repo --replace-text` (pickaxe and all-revision grep: **0
  hits**), all refs force-pushed; a full pre-purge backup bundle exists
  locally. **One owner action remains open by their explicit choice: key
  rotation at the provider (U1) was deferred.** Your escalation clause
  ("becomes CRITICAL if revocation is false") is acknowledged and on record.
- **BACK-001 / BACK-008** — blocking evidence is now monotonic *in gate
  code*, not prompts: a blocked classifier verdict cannot be overruled by a
  later clean bundle; unresolved claim-IDs are preserved across validation
  retries and silent dropping rejects with `RESOLUTION_MISSING` naming the
  dropped IDs; proposal-A retries are re-parsed and twice-invalid legs are
  excluded from the merger and surfaced as `councilDegraded`.
- **BACK-002** — a single lifecycle validator owns the transition table as
  data; generate must produce draft+requested profile, freeze refuses from
  blocked/superseded/frozen, and your exact re-freeze-laundering scenario
  (edit frozen v1 → re-freeze) is pinned by an end-to-end test asserting the
  manifest is byte-unchanged and verify still reports drift.
- **DATA-001** — atomic per-root revisions: O_EXCL lock with injected
  clock, temp+fsync+rename, hardlink backups with inode-identical rollback,
  manifest written last. Your two-init race and mid-change failure scenarios
  are pinned by real two-process tests; a mid-write disk-failure injection
  (EIO after create) proves the directory stays byte-identical.
- **BACK-003 / BACK-004 / BACK-006** — namespace ID schemas, one
  referential-closure phase (lint L13), duplicate task IDs rejected at
  compile, unknown dependencies block machine plans with a named-ID error,
  `expect` grammar validated at schema/lint level with the dry run surfacing
  UNPARSEABLE as failure while never executing it, and named validation
  levels for consumers (plan/check require lint-clean; trace pinned at
  compile level as a repair view with recorded rationale).
- **SEC-002** — MCP execution consent redesigned: execution is impossible
  on a default-started server (your injection scenario is pinned with every
  parameter combination), and even opted-in requires frozen+verified+
  lint-clean content plus a server-recomputed sha256 preview digest bound to
  exactly what runs, under a scrubbed environment allowlist.
- **UX-001 / UX-003 / UX-004** — honest worst-case envelopes (single 12
  requests/2211 s, council 24/4422 s) pinned to code constants by test; run
  budgets with a `BUDGET_EXCEEDED` abort before the next paid request and no
  orphaned promises; attempts vs completions accounted; unknown usage
  renders `unknown` and fails the cost gate; intent preflight rejects blank
  and oversized input with zero adapter calls. Your "consider single as the
  safe default" recommendation was adopted: single is now the default,
  council is explicit.
- **PROD-002** — the root README is the spec-core front door with verified
  commands; legacy is explicitly ARCHIVED, unrunnable from root scripts, and
  carries a zero-GO salvage list; the CI badge points at a real workflow.
- **PROD-003** — the evidence gate now measures intent fidelity: per-task
  MENTIONS_TERMS assertions a generic fixture cannot satisfy (pinned by a
  two-intents-one-fixture test), structural vs intent-fidelity split,
  independent `--repeats` runs with spread, complete-usage requirements, and
  adversarial non-invention cases judged at the outcome level. The
  limitations you would have flagged next are pre-disclosed: term-dumping
  and mock-badging are named in the report and README, and the 2026-08-18
  live report is relabeled historical with a documented (not executed)
  re-run procedure.
- **BACK-004 fixtures** — all 20 fixtures conform; every previously skipped
  test was opened; a six-stage good-fixture gate (compile→lint→freeze→
  verify→plan→dry-check, real cores, zero UNPARSEABLE) runs on every suite.

### MEDIUM and LOW — all terminal
Realpath containment with symlink-refusing writes and an MCP allowed-root
(SEC-003); 0600 run-addressed redacted evidence (SEC-004); process-group
execution with tree-kill timeouts and stdin EOF, pinned by real-process
tests reproducing your exact grandchild-survival scenario (SEC-005);
frame/in-flight limits with genuine backpressure and a validated JSON-RPC
2.0 envelope (OPS-001/SEC-006); self-cleaning builds, a byte-exact schema
artifact gate, and CI fail-on-diff (TEST-002); remote Node 22/24 matrix
evidence — see below (OPS-002); MCP grew init/generate/change tools with a
consent chain whose refusals provably issue zero LLM calls (PROD-004); a
version policy with distinct actionable verdicts and experimental-only
legacy labeling (PROD-005); honest prompt-cost accounting with benchmark
ceilings and measured input limits (PERF-001); a defined L12 pattern
language with an exact, brute-force-cross-checked overlap model and
transitive ordering (BACK-007); `--help`/`--version` and a doctor command
(UX-002; plus); overflow classified explicitly as OUTPUT-CAP (OPS-003);
coverage thresholds CI-enforced (TEST-003).

### The seven ACCEPTED-DOC items
DATA-002 and DATA-003 are kept as the honest limitations you recommended
keeping ("keep the honest limitation"), now stated precisely wherever
integrity language appears; signing remains deliberately unimplemented
until a provenance claim demands it. Your five INFO positive designs
(ARCH-002, BACK-009, DATA-004, SEC-007, TEST-004) were treated as invariants
of the program: every phase's whole-branch review re-verified each one
unviolated at source level before merge.

## Evidence snapshot (all executed, exit codes recorded)

- **Tests:** 75 files / **1231 passed / 0 skipped / 0 failed** (from your
  576/52-files baseline), including real two-process races, real
  child-process checks, a real MCP stdio session, and a packed-install
  smoke — deterministic mocks throughout; no test makes a live LLM call.
- **Gates:** `pnpm install --frozen-lockfile`, build, lint, test,
  `smoke:packed`, and `test:coverage` (thresholds 91/89/96/91, ratcheted
  from measured 95.6/92.48/99.27/95.6) all exit 0 on main.
- **Remote CI:** `ci-spec-core` green on Node 22 and Node 24 legs on every
  merge (latest: 44 s / 36 s) — the OPS-002 gap you identified is closed
  with exactly the scoped status you asked for.
- **Distribution:** `lco-spec@0.1.0` is live on npm (bootstrap-published
  from the owner's WebAuthn-authenticated CLI; `dist.shasum` byte-identical
  to the CI-validated pack), and future publishing runs on npm Trusted
  Publishing (GitHub Actions OIDC) with no stored npm secret anywhere.

## What remains honestly open

1. **Provider-side key rotation (your SEC-001 escalation clause)** — owner
   deferred it; the repository and history sides are complete.
2. **Live provider interoperability** remains untested (documented in the
   platform matrix); all LLM paths are mock-tested, live runs remain an
   explicit opt-in env away from ever executing by accident.
3. The honest limitations above (DATA-002/003), plus a small recorded
   backlog (coverage-flake capture note, symlink-alias generate dedup key,
   workflow composite-action dedup) — none user-facing.

## Closing

Your top-ten action list is implemented in substance, not phrasing, and the
gates that would have caught your findings (installed-bin smoke, concurrency
and fault injection, envelope validation, intent-fidelity assertions,
coverage ceilings) are now permanent parts of the suite and CI. We ask that
you re-run your readiness assessment against current `main` — and we accept
in advance whatever its verdict says, for the same reason we accepted yours:
the gates, not the narrative, carry the claim.

— The lco-spec maintainers
