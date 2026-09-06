# 21 — MAO Fresh Independent Verifier Wave

Five fresh read-only verifiers (no implementation involvement), each instructed to
FALSIFY the implementer's claims; static + probe + worktree-run evidence. Consolidated
by the primary agent; load-bearing claims re-checked against source.

## Verdicts

| Verifier | Domain | Claims | Verdict |
|---|---|---|---|
| V-A | config/canonicalization/prototype semantics | 7 | ALL CONFIRM (6 closure claims + record sweep); new finding N-1 |
| V-B | evidence/filesystem/recovery | 7 | ALL CONFIRM; protected contracts unharmed; no new in-protocol corner; residuals N-B1 (pre-existing untyped post-rollback removal), N-B2, N-B3 (out-of-protocol) |
| V-C | consent/ContextBundle/protected contracts | 7 | ALL CONFIRM; production diff = exactly 4 files; consent preimages byte-identical; B-2 blind spot narrowed-not-closed; new finding N-1 (duplicate), N-2 (chmod restore) |
| V-D | browser/tests/unsupported-value | 7 | ALL CONFIRM (incl. handler-chain proof that deleted settles were dead); 2 minor observations (V-D obs 1: dropped window.lcoApp assertion; V-D obs 2: http inactivity deadline — both enumerated below; corrected from an earlier "3" in the evidence-cleanup commit: only these two exist in the record) |
| V-E | ledger completeness + digest inventory + new-finding sweep | 5 | Ledger COMPLETE 27/27; all claimed closures present in diff; digest 7/13/0 at BOTH refs (site list identical); guards additive-only; observations as enumerated below: 4 test-hygiene findings (N-V1, N-V2, N-V3, N-V5) + 3 ledger/process observations (NF-4 plan-vs-commit delta, 12-Info re-adjudication timing, INFO-A ledger-externality) — the earlier bare "5" matched no enumeration of the committed table and is superseded |

Total: 33/33 claims CONFIRMED, 0 REFUTED. Zero Critical/High/Medium new findings.

## Verifier findings and this program's response (all addressed)

| Finding | Source | Response |
|---|---|---|
| N-B1 post-rollback journal removal unguarded (pre-existing at base) — raw fs error escaped recovery through readRevision | V-B | FIXED (744a5a5): typed recovery_required with honest wording; S11 cell (red pre-fix); M-NB1 mutation CAUGHT |
| N-1 roles key schema dropped min(1) — empty-string role key parse-widening | V-A + V-C | FIXED (744a5a5): non-empty refine chained onto NoProtoKeySchema; cell (red pre-fix); M-N1 mutation CAUGHT |
| N-V5 "no concurrent writer is implied" wording precision (out-of-protocol corner) | V-E | FIXED (744a5a5): grounding parenthetical "(the journal still being ours)"; S8b-1 regex synced. V-B independently proved the in-process exactness of the arm (persistTrustedJson/fsyncDir analysis) — the clause now states both the inference and its ground |
| N-V2 new test seams deleted only per-test | V-E | FIXED (744a5a5): shared afterEach extended |
| N-V3 composition C2/C3 dist skips lacked a CI canary | V-E | FIXED (744a5a5): canary added |
| N-V1 C5 delayed-fetch wrapper never restored | V-E | FIXED (744a5a5): restored at cell end |
| N-2 (V-C) F-L6-1 early exits left 0o500 | V-C | FIXED (744a5a5): chmod restore before exit |
| dropped window.lcoApp assertion | V-D | FIXED (744a5a5): restored |
| http inactivity deadline == vitest default | V-D | FIXED (744a5a5): 4s (fails as the expect, never a hang) |
| N-B2 real racer after failed debris cleanup classified 'debris' (opposite-direction misattribution; triple-fault out-of-protocol window) | V-B | BOUNDED: documented in report 22 new-findings; reopen = any in-protocol path to that corner |
| N-B3 own journal unreadable between ours-check and remove → silent no-op → 'race' misattribution | V-B | BOUNDED: pre-existing classification semantics, fail-closed direction correct; documented |
| B-2 aliased-rename second call still slips both lexical guards | V-C (confirms documented limit) | BOUNDED: the guard's disclaimed class; narrowed by the count pin |
| NF-4 planned in config lane but adjudicated no-action (plan §13 vs commit) | V-E | DOCUMENTED: plan anticipated a possible message fix; investigation adjudicated BOUNDED (cosmetic, refusal-first, pointed message leads) — report 12 |
| "12 Info have no committed re-adjudication at HEAD" | V-E | Resolved by THIS commit set: report 12 (per-item ACTIONABLE/BOUNDED + reopen conditions) was drafted before the verifier ran; committed with the final reports |
| INFO-A behavior change is ledger-external | V-E | DOCUMENTED: listed explicitly in report 22 new-findings (N2) with its own tests and mutation |

## Worktree corroboration (verifier runs)

transaction-atomicity + pre-v021-composition 80/80; concurrency + architecture 24/24;
app+app-errors 9/9; http 20/20; stdio 20/20; server EPIPE 2/2; assets+bin-contract 6/6
(incl. CI=true probe); doctor+prepublish+init-concurrency 69/69; round-trip+review-
interactive 8/8; D-F-01 1/1.

AUDIT_COUNCIL_ESCALATION_RECOMMENDED = NO (no trigger condition occurred: no new trust
primitive, no authority-model change, no L6/consent/recovery semantics change, verifiers
materially agree on every trust-bearing conclusion).
