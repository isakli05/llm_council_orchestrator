# 08 — L6 (RC3): persistent evidence-channel physics boundary

Investigator: MAO seat C2 (read-only Phase 1). Driver:
`/tmp/lco-pr5-hardening/c2/l6-physics.js` (real EACCES, fresh-process readers).

## 1. Current-source mechanics

- `writeAbortEvidence` (state.ts L663-683): 3 bounded attempts of
  `persistTrustedJson` to the sidecar path (`abortEvidencePath` L646-648);
  persistent failure returns `{landed:false; attempts:3}` — data in memory only.
  Nothing durable records the failed-evidence event: the journal at the path is
  foreign or absent; `state.json` untouched by the abort.
- The disclosure exists solely in the thrown `TrustStateError` message (L551-561
  marker channel, L588-592 sidecar channel): "CRITICAL: PERSISTENT abort-evidence
  failure: the abort evidence could NOT be written after 3 attempts — NO durable
  marker of this abort exists on disk; …".
- Durable fail-closed gates in the reader: `readRevision` L96-103 (sidecar
  presence) and L104-106 (journal presence) — both require a file that could be
  written; under total channel failure neither exists.
- Propagation that DOES exist: `refresh --force` refuses to bulldoze
  `recovery_required` (cli/commands/renew.ts L302); status renders typed
  refusals (exit 2); `authorizeRenewalState` (renew/project/project.ts L30-35 →
  `preflightRenewalSurface`, trust/fs.ts L416-445) is the entry/mid-op preflight.

## 2. Fresh-reader verification on current source (real EACCES)

A's tx parks a foreign journal + zombie byte, then fails; sidecar channel killed
by real `chmod 0555` on `.lco/renewal` at the first evidence write (all 3
attempts EACCES); channel restored; B completes:

```
A abort message: … CRITICAL: PERSISTENT abort-evidence failure: … NO durable marker of this abort exists on disk; …
durable state after B completes: tx-abort-evidence.json: false | tx-journal.json: false | revision: 2
FRESH READER PROCESS: readRevision → OK, revision 2 ; loadActiveState → OK, overlay ok, parity ok
```

**Claim VERIFIED**: disclosure is process-ephemeral; a fresh reader sees healthy
state at R+1 with zero durable trace.

## 3. Improvement candidates vs the forbidden list

| Candidate | Verdict |
|---|---|
| Pre-armed sidecar before work phase | FORBIDDEN (fail-closes every S5-H-01 crash window into manual recovery — rejected by prior audit) |
| Second journal / out-of-project evidence path | FORBIDDEN (uncontrolled second store; outside authorized domain) |
| Rollback-capable "emergency" state | FORBIDDEN |
| **Entry-time evidence-channel health probe** (extend `preflightRenewalSurface`/`authorizeRenewalState`: write+unlink staging probe in `.lco/renewal` before long operations; unique staging name via `randomTail()`) | SAFE + cheap + recommended (propagate/disclose only; converts in-flight discovery into an entry-time typed refusal) |
| Status/reader rendering of durable degraded states | already present for states that HAVE markers |
| Durable record of a failed-evidence event | PHYSICALLY UNAVAILABLE (directory-level failure kills journal, sidecar, and revision channels together — the physics argument survives scrutiny under real EACCES) |

## 4. Final mechanically-enforced representation (PM-approved)

**Invariant:** *When no durable evidence channel is physically writable, the
abort's only truthful representation is the in-process typed disclosure; a
subsequently healthy reader is the accepted, contract-pinned outcome — never
silently conflated with either a durability claim or a defect.*

1. The typed `MarkerWriteOutcome = {landed:false; attempts:3}` (state.ts L654)
   IS the mechanical state — not a stringly defect.
2. **Boundary-pinning test** (extend the S5-M-04 matrix in
   transaction-atomicity.test.ts; disclosure cells live at L1290/L1383/L1465/L1477):
   named cell `physics-boundary-persistent-evidence` asserting (i) A's abort
   carries the CRITICAL disclosure and claims NO retention ("NO durable evidence
   of this abort could be retained"); (ii) after the concurrent writer completes,
   a fresh reader (subprocess) returns HEALTHY at R+1 — comment-marked as the
   ACCEPTED invariant boundary so a future auditor reads a pinned contract, not a
   defect; (iii) the fail-closed direction when the channel DOES land (sidecar
   presence gates reads, L96-103) for contrast.
3. **Entry-time channel health probe** (safe improvement): staging-temp +
   immediate unlink in `.lco/renewal` inside `preflightRenewalSurface`; new test:
   read-only dir ⇒ typed entry refusal naming the dead evidence channel. Probe
   never touches journal/sidecar paths (cannot be mistaken for a pre-arm marker).

## 5. S5-H-01 interaction

None of the accepted candidates touch rollback authority; the probe writes only
a uniquely-named staging temp it immediately unlinks (no journal-like semantics).

## 6. Disposition

**ACCEPTED_INVARIANT_BOUNDARY** — mechanically represented (typed outcome +
pinned boundary test + entry-time probe + disclosure semantics), per the Fifth
Audit's pre-acceptance ("ACCEPTABLE FOR V1 WITH DISCLOSURE") and the S5-M-04
truthful-disclosure closure. Not confusable with a defect: the boundary is
test-pinned as the expected outcome.

## 7. Risks

None identified beyond keeping the probe out of journal/sidecar paths and
ensuring its refusal message names the evidence channel (not a generic EACCES).
