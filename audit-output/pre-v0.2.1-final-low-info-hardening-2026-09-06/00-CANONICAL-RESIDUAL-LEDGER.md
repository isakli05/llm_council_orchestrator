# 00 — Canonical Residual Ledger (Pre-Implementation Reconstruction)

Program: Pre-v0.2.1 Final Residual Hardening.
Baseline: `origin/main` = `1b7fe6e3a4a7fc30bbbe5f23cfa1482ba901a7ea` (tree `be5fe190addf64c602a9496b3b6a5120d9f3e67c`), verified 2026-09-06 via `git fetch origin --tags` + `git rev-parse`.

## Authority

The canonical residual source is the fresh independent targeted re-audit:

```
audit-output/post-pr5-full-residual-targeted-independent-reaudit-2026-09-06/
```

Authoritative files used for this reconstruction:

- `00-FINAL-VERDICT.md` — totals: 0 C / 0 H / 0 M, 8 Low, 19 Info.
- `16-NEW-INFO-ADJUDICATION.md` — §"New Low (8)" table (per-ID findings) and §"New Info (19)" paragraph (per-ID one-line adjudications). **This is the primary per-item authority.**
- `23-FINAL-RESIDUAL-LEDGER.md` — cross-check of the 8 Low IDs + 19-Info group enumeration.
- `15-VERIFIER-FINDING-FIXES.md`, `17-PROTECTED-FINDINGS.md`, `24-INTEGRATION-HANDOFF.md` — context/provenance.
- Lane detail reports: 04 (Lane A), 10 (Lane D), 11 (Lane E), 12 (Lane F), 14 (Lane H), 05/06/09 (Lanes B/C).

## Scope exclusions (NOT part of the 27)

- F1–F18 evidence-trace defects (report 03, documentary): closed by docs-only commit `5e47912` before/within PR #6 merge `1b7fe6e`. Verified: `git show --stat 5e47912` is docs-only on the previous program's committed reports.
- V-L1..V-L4: verifier-found Low *fixes* independently verified HELD (report 15) — already closed on main.
- NEW-F-01 (Medium): VERIFIED_CLOSED (report 23) — protected, not open.

## Severity-discrepancy cross-check (charter requirement)

The charter warns that a later merge summary listed NF-1/NF-2 under an Info example while the fresh re-audit classified them **Low**. Resolution: report 16's "New Low (8)" table and report 23's new-findings table both classify NF-1/NF-2 as **Low**. The PR #6 merge handoff (`post-pr5-full-residual-pr6-merge-2026-09-06/07-FINAL-HANDOFF.md` §1) lists "identifiers include E-1, E-2, E-3, F-L6-1, NF-1, NF-2, D-F-01, H-1" under "8 Low / 19 Info" — consistent with the re-audit. The misclassification existed only in conversational/summary prose outside these artifacts. **Re-audit files win; NF-1 and NF-2 are Low.** No other severity disagreements found between the re-audit and the PR #6 merge reports.

---

## The 8 Low (canonical order as listed in report 16 §"New Low (8)")

| # | ID | Severity | Report ref | Title | Source surface | Historical reproduction | Reachability | Safety direction | Recommended action (re-audit) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | E-1 | Low | 16 §New-Low; detail 11 (Lane E) | Persistent unlink fault in `markJournalSuperseded` ours-case `removeJournal` escapes untyped — raw `Error('…EACCES')` replaces typed `recovery_required` | `packages/spec-core/src/renew/trust/state.ts` (journal supersede/cleanup path, new from L5 fix) | New path introduced by the L5 fix; persistent unlink fault (e.g. EACCES) escapes as generic Error | Fail-safe: journal retained; fresh reader auto-retires C>B and reads healthy | Fail-safe, untyped | Guard → typed `failed:'persistent'`; do not swallow FS errors; never claim cleanup succeeded |
| 2 | E-2 | Low | 16 §New-Low; detail 11 (Lane E) | Check-then-unlink microsecond sub-window in `removeJournal` can delete an *uncommitted* racer's journal (ours+revisionMoved arm) | `state.ts` `removeJournal` check→unlink sequence | Production-reachable only via out-of-protocol revision writes or the E-1 corner; committed human authority survives every tested cell | Falsifies implementer's "its own or absent" wording; decisive invariant (committed authority) intact | Fails toward deleting uncommitted racer (bounded) | Bounded; document; identity/ownership-conditioned deletion if actionable; no global locks |
| 3 | E-3 | Low | 16 §New-Low + §charter-table; detail 11 (Lane E, schedule S4) | S4 double-fault EEXIST misattribution: debris + cleanup-unlink double fault ⇒ EEXIST attributed to "concurrent writer… PRESERVED" while the path holds our own debris | `state.ts` (EEXIST handling in supersede path; in-code documented `state.ts:813-814` at audit time) | Deterministic schedule S4 reproduced; wrong *cause*, retention wording stays truthful; fresh reader fails closed | Wrong-cause diagnostic only; no false retention/durability claim | Truthful outcome, wrong attribution | Wording fix; distinguish unlink failure from persistence failure; prefer structured error code over prose matching |
| 4 | F-L6-1 | Low | 16 §New-Low; detail 12 (Lane F) + 15 (V-L4) | L6 entry-probe *early* placement unpinned: a late-placement mutation passes the entire committed suite (68/68); only a fresh cell catches it | `packages/spec-core/src/cli/commands/renew.ts` (probe order: stateAuth → project → probe → staleness → graphify probe → paid analyze; journal write later) | Implementation correct at audit target; the *pin* is missing — regression-pinning only | None today; future refactor could move probe past validation without test failure | Test-gap only | Add placement pin test in cleanup pass; never overclaim probe as future write guarantee |
| 5 | NF-1 | Low | 16 §New-Low; detail 04 (Lane A) | `roles` record keys still `z.string().min(1)` — a `"__proto__"` role key in lco.config.json is silently zod-stripped (parse succeeds, role ignored; roles-only case fails misleadingly) | `packages/spec-core/src/config/llm-config.ts` (roles record schema) | Silent-strip class I1/V-L2 closed elsewhere; roles gap inert: closed role-name set | Inert on trust (closed role-name set), but schema says "valid" while dropping a trust-bearing key | Silent semantic drop | Harden in cleanup pass: preserve exactly or reject loudly (own-key refine like V-L2) |
| 6 | NF-2 | Low | 16 §New-Low; detail 04 (Lane A) | `resolveProfile` bare bracket lookups (`llm-config.ts:255,285`): `"__proto__"` profile/provider names hit the prototype chain → bogus route (no apiKeyEnv) / unpointed `TypeError` | `llm-config.ts` `resolveProfile`; reachable via requester-supplied profile names (MCP `server.ts:1262`, CLI `index.ts:357,563`) | `"__proto__"` profile/provider name resolves via prototype chain to bogus values | Requester-supplied profile names; no auth material reachable; no trust bypass; fail-fast contract defeated | Prototype-chain config lookup | `Object.hasOwn` guard; profile resolution requires own property |
| 7 | D-F-01 | Low | 16 §New-Low; detail 10 (Lane D) | Non-JSON-serializable payload (e.g. bigint) throws raw `TypeError` inside the write boundary instead of typed `commit_failed_without_state_change` | `state.ts` `applyStateMutation` boundary (I6 readers run first; serialization of payload later) | bigint value in durable payload → raw TypeError; nothing written | Unsupported input to supported write path; durable guarantee intact (zero bytes written) | Fail-safe but untyped | Typed-catch: deterministic typed refusal, zero durable side effects; do not ad-hoc stringify BigInt if canonical semantics change |
| 8 | H-1 | Low | 16 §New-Low; detail 14 (Lane H) | 12 fixed `settle()` sleeps remain in `app.test.ts` (incl. `settle(80)` gating a real round-trip) — same class as the fixed banner race, uncovered sites | `packages/spec-core/test/browser/app.test.ts` (+ any other browser/client tests with fixed waits) | Same CI-flake class as I7's fixed banner race (M15 caught the fixed-window signature) | Test-infra only; flake risk under slow CI | Race masking, not correctness | Replace fixed waits with observable state/event completion where appropriate; do not weaken CI coverage; do not just increase durations |

## The 19 Info (canonical enumeration from report 16 §"New Info (19) — all BOUNDED_INFO_ACCEPTABLE")

| # | ID | Severity | Report ref | Title (one-line adjudication from report 16) | Source surface (from lane reports) |
|---|---|---|---|---|---|
| 1 | F-I5-1 | Info | 16 §New-Info; detail 13 (Lane F, I5 work) | Dangling-symlink presence-gate quirk (pre-existing kernel-wide property, attacker-equivalent to delete) | `state.ts`/kernel presence checks (`existsSync` on symlink) |
| 2 | F-I5-2 | Info | 16 §New-Info; detail 13 | Sidecar lacks integrity digest (fail-closed either way) | journal sidecar digest/absence corner (report 13) |
| 3 | F-L7-1 | Info | 16 §New-Info; detail 13 (L7 wording) | Implementer's report-19 row-12 wording matches a cruder mutation than claimed (evidence-accuracy only) | prior program report 19 (documentary) |
| 4 | NF-3 | Info | 16 §New-Info; detail 04 (Lane A) | Two single-consumer compact-canonicalization copies (verified consistent, inventoried) | `canonical.ts` + one compact-canonicalization site |
| 5 | NF-4 | Info | 16 §New-Info; detail 04 | V-L2 sole-key dual message (cosmetic) | `llm-config.ts` record-key refusal message |
| 6 | B-1 | Info | 16 §New-Info; detail 05 (Lane B, I2) | Accessor-equipped bundle prompt-projection seam (insider-only, unreachable in production) | `evidence.ts` sealContextBundle clone path |
| 7 | B-2 | Info | 16 §New-Info; detail 06 (Lane B, I3) | I3 guard is per-file, not per-call-site (demonstrated, documented) | `renew/trust/architecture.test.ts` seal-site guard |
| 8 | C-1 | Info | 16 §New-Info; detail 09 (Lane C) | `lco_generate` legacy path binds no route digest (nothing route-shaped resolves at consent; no client influence) | legacy generate path / consent resolution |
| 9 | C-2 | Info | 16 §New-Info; detail 09 | Injected-adapter seam carries no op-owned ledger (programmatic-only, pre-existing, disclosed) | `options.llm` injected adapter seam |
| 10 | D-OBS-1 | Info | 16 §New-Info; detail 10 (Lane D) | `path+symbol` key concatenation ambiguity (pre-existing, fail-closed, unreachable) | overlay/parity store keying |
| 11 | D-OBS-2 | Info | 16 §New-Info; detail 10 | Last-fold-wins among machine overlay records (documented design) | overlay fold semantics |
| 12 | D-OBS-3 | Info | 16 §New-Info; detail 10 | Vitest cannot run overlapping paid phases (test-infra only; real CJS works) | test-infra concurrency |
| 13 | D-OBS-4 | Info | 16 §New-Info; detail 10 | specDir/archive unvalidated by design (read-side quarantined) | specDir/archive readers |
| 14 | G-1 | Info | 16 §New-Info; detail 19 (Lane G) | Stranded-lockfile under dead channel self-heals via 10 s stale window (bounded, honest, deterministic) | lockfile stale-window logic |
| 15 | G-2 | Info | 16 §New-Info; detail 19 | Object-literal `__proto__` authoring trap (shipped tests correct) | test authoring patterns |
| 16 | H-2 | Info | 16 §New-Info; detail 14 (Lane H) | Unsilenced stderr lock-refusal print in no-dist runs (cosmetic) | dist-guard skip stderr |
| 17 | H-3 | Info | 16 §New-Info; detail 21 | Implementer's I4 ceiling "AFTER" figure is best-case-distribution (attribution corrected in report 21) | prior program perf report (documentary) |
| 18 | M-1 | Info | 16 §New-Info; detail 20 (Lane M) | NEW-F-01 mutation catch arrives via the I6 backstop (defense-in-depth, single-active assertions behind it) | mutation coverage structure |
| 19 | M-2 | Info | 16 §New-Info; detail 20 | L6 probe cell is message-text-pinned (covered via verifier-fixes test instead) | L6 probe test cell |

---

## Ledger integrity gate

```
Low count  = 8   (E-1, E-2, E-3, F-L6-1, NF-1, NF-2, D-F-01, H-1)  ✓
Info count = 19  (F-I5-1, F-I5-2, F-L7-1, NF-3, NF-4, B-1, B-2, C-1, C-2,
                  D-OBS-1, D-OBS-2, D-OBS-3, D-OBS-4, G-1, G-2, H-2, H-3, M-1, M-2)  ✓
Total      = 27  ✓
Duplicates = 0   ✓
Omitted    = 0   ✓
Invented   = 0   (every ID appears verbatim in report 16 and/or 23)  ✓
```

**GATE: PASS — CANONICAL_RESIDUAL_LEDGER_COMPLETE.**

## Cross-check vs charter's known Low IDs

Charter list `E-1, E-2, E-3, F-L6-1, NF-1, NF-2, D-F-01, H-1` = exactly the 8 canonical Low IDs. No discrepancy.

## Note on Info classification basis

All 19 Info were adjudicated `BOUNDED_INFO_ACCEPTABLE` by the fresh re-audit. Per this program's charter, each must now be **independently** re-adjudicated on current main into: ACTIONABLE / BOUNDED_NON_ACTIONABLE / ALREADY_ELIMINATED_ON_MAIN / MISCLASSIFIED, with actionable items closed and bounded items given explicit invariant + mechanical guard where possible + reopen condition.
