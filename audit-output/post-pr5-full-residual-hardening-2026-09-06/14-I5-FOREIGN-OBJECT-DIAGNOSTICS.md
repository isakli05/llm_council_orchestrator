# 14 — I5 (RC2): foreign-object wording at the evidence path

Investigator: MAO seat C1 (read-only Phase 1). Repro against fresh dist,
scratch project `/tmp/lco-pr5-hardening/c1/repro1`.

## 1. Current behavior (read side, `state.ts` L96–103 `readRevision`)

The sidecar check is CONTENT-BLIND: a single
`existsSync(abortEvidencePath(projectDir))`; no parse anywhere in the codebase
(rg: only existsSync L96 + write L675 reference `tx-abort-evidence.json`).

| parked content at evidence path | result |
|---|---|
| (none — healthy) | OK |
| garbage bytes | `recovery_required`: "a transaction aborted with in-flight writes while a concurrent writer owned the journal (…tx-abort-evidence.json) — the on-disk state may combine both writers. Inspect the trusted state after review, then remove the evidence file; recovery refuses to guess" |
| valid JSON, wrong shape | identical message |
| empty file | identical message |

Contrast — journal path has a rich typed taxonomy (foreign garbage → "journal is
unreadable" L947–951; tampered L959–963; superseded L969–974; lock-held L934–939;
unreadable-revision join L997–1002; journal-ahead L1025–1030; completed-leftover
auto-retire L1004–1019; rollback failure L1036–1040; clean-absent L113–116/L910–913).

## 2. Assessment

- **False retention/written claims: NONE** (walked every user-visible string;
  hedges correct; abort-side "NO durable marker OF THIS ABORT exists" literally true).
- **Conflation confirmed, two facets:** (a) read side — a foreign/empty file
  produces the exact message a genuine abort sidecar produces, asserting an abort
  narrative that may never have happened; no distinguishable diagnostic;
  (b) abort side — "NO durable marker of this abort exists on disk" can read as
  "the path is empty" while a pre-existing object still fail-closes reads
  (protection understated).
- Current severity: Info (fail-close behavior and truthfulness correct;
  diagnostics only).

## 3. Fix (PM-approved: minimal, diagnostics-only, no authority change)

1. `state.ts` L96–103: before throwing, parse+shape-check the sidecar
   (`schema_version===1`, `holder`, `base_revision`, `performed_steps`,
   `evidence`, `remedy` — exactly what `writeAbortEvidence` writes at L664–672;
   size guard: skip-read over 64 KiB). Genuine sidecar → current message.
   Foreign/unexpected → SAME typed error
   (`TrustStateError('trust:state','recovery_required')`, errors.ts L54–59) with
   a distinguishable message: "an unexpected object occupies the abort-evidence
   path (<path>) — it fail-closes trusted reads but is not a transaction-abort
   marker; inspect and remove it after review". Update the recovery_required
   sub-shape docstring list (errors.ts L48–53); no new error code.
2. Abort-side tweak (L553–554 / L590–591): append the evidence path + note that
   any pre-existing object there still fail-closes reads.
3. Recorded out-of-scope note (owner-visible, no change): a LANDING sidecar
   write silently REPLACES a foreign object at that path (persistTrustedJson
   staging+rename) — observable but harmless.

## 4. Tests

Read-side taxonomy block: foreign garbage / wrong-shape JSON / empty file /
oversized file / genuine sidecar → each `recovery_required`, correct
distinguishable message, still fail-closed. L7 Cell C pins the abort-side
foreign-journal retention phrase (report 09).

## 5. Mutation proof required

Revert to content-blind single-bucket message → taxonomy block fails (foreign
garbage no longer distinguishable from genuine sidecar).

## 6. Disposition

Investigator proposed OPEN_REQUIRES_OWNER_DECISION (touches `readRevision`, the
most-guarded function). **PM determination:** the change is
message/diagnostics-only, preserves the typed error contract and fail-closed
direction, and is exactly what the program's I5 spec requires ("distinguish
foreign object / unreadable / failed write / superseded / recovery-required;
prefer structured diagnostic code + human-readable message"). Parsing risk
(attacker-influenced bytes) mitigated by size guard + try/catch → treat as
unparseable (fail-closed, distinguishable). Target final disposition:
**VERIFIED_CLOSED**.

## 7. Risks

Message churn in tests pinning the current sidecar message (L1400 pins only the
filename — safe; audit other pins before landing). readRevision guards must be
re-run (root-invariants, transaction-atomicity).
