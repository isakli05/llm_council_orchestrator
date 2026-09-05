# 12 — MAO Verifier Results

Six fresh READ-ONLY verifier agents were spawned after implementation, each
given the CONTRACT to falsify (not the reproduction), plus targeted
re-verifiers after fixes. All ran against built dist with byte-level trusted-
state comparison; none modified source. Zero real paid calls anywhere.

## V1 — transaction atomicity (`trust/state.ts`)

- **Round 1 verdict: CONTRACT BROKEN — 6 violations** (V1 specDir destroyed
  by dir_create rollback; V2 headline — failed archive rename made rollback
  delete/replace live committed stores, zero-injection via the real CLI;
  V3 recovery non-idempotent for rename+null; V4 stuck in-flight marker
  fail-open; V5 init --force swallowed recovery_required and overwrote the
  recovery authority; V6 stale-lock interleave → two commits at one revision
  number).
- **Primary triage: primitive flaws.** All six fixed at the kernel boundary
  (original-state journal entries; performed-prefix in-process rollback;
  never-destructive crash recovery; marker-after-journal-write; force
  rethrows recovery_required; lock+revision fence before the revision write).
  Regressions committed for each.
- **Round 2 (re-verifier): V1–V5 FIXED; V6 partially — H1 (post-fence abort
  rolled the journal's base bytes over the surviving concurrent commit —
  silent lost update), H2 (unguarded fence-abort rollback branch), N1c
  (ensureDirs residue).**
- **Round 3 fix: the superseded-journal protocol** — an abort with the
  revision moved (or unreadable) never rolls back; the journal is retained as
  an integrity-covered `superseded` marker and recovery refuses it (manual);
  the clean-abort rollback is guarded; per-directory performed counting.
  Regressions: B's committed revision+bytes survive A's abort inside the
  write window; reads stay fail-closed until manual recovery; unreadable
  revision takes the same fail-loud path.
- **Round 4 (final narrow re-verify)**: V1–V5 + H2 confirmed; the H1
  headline interleave fixed (typed outcome, superseded marker, fail-closed
  reads; kill-window intact) — but the same harm reproduced through two
  adjacent windows: NH-1 (clean-abort rollback while the concurrent writer is
  MID-COMMIT, pre-bump — clobbers its stores and deletes its journal) and
  NH-2 (a successful commit's journal removal deletes a foreign superseded
  marker).
- **Round 5 fix: the ownership-gated protocol** — the exclusivity rule (a
  live concurrent committer consumes our journal at ITS begin, so the
  journal's OWNER at the abort point is the exclusivity proof): aborts never
  roll back or remove over a foreign/unparseable/absent journal; superseded
  markers only ever cover our own journal; removeJournal is
  ownership-conditioned everywhere (unconditional removal is
  unrepresentable). Regressions for both windows + the corrupt-lockfile fence
  arm and the unparseable-journal abort.
- **Round 6 re-verify (NH-1/NH-2)**: both ORIGINAL mechanisms verifiably
  fixed (no rollback over, no journal deletion, no marker clobber) — but the
  same harm survived through the residual the abort side cannot reach:
  ZOMBIE FORWARD WRITES (a stale-broken writer resuming mid-write-set
  completes its remaining writes over the live committer's bytes; the fence
  ran only after the entire write set).
- **Round 7 fix: per-write ownership fencing** — before EVERY forward write
  the writer re-proves the lock names it (a zombie aborts at the next write
  boundary BEFORE its bytes land); the pre-revision fence remains; the
  revisionMoved message tells the truth when the journal path is foreign.
  Regressions: lock broken at a store write → abort with every trusted byte
  base-R; the foreign-journal revisionMoved arm. The remaining window is the
  interior of a single authorized write (cannot outlive the 10s stale-break
  on a healthy FS — the same documented class as the rename-instant
  micro-TOCTOU).
- **Closing re-verify (zombie fence)**: the fence verifiably closes the
  multi-write completion, resumes-at-fence/before-recovery/after-completion
  are safe — but the ONE already-in-flight write could land at any instant
  inside B's [recovery→journal-removal] span, and with B's journal owning
  the path A's abort left NO evidence: silently-torn pairs reproduced 3/3
  and 2/2 in both schedules.
- **Round 8 fix: the zombie-byte evidence SIDECAR** (`tx-abort-evidence.json`,
  a separate path — exactly the verifier's stated closing requirement): any
  abort whose performed>0 bytes may have landed while a concurrent writer
  owned the journal path writes the sidecar; `readRevision` checks it FIRST
  and fails closed (manual remedy). Clean aborts leave no sidecar (journal
  recovery stays automatic). B may be told COMMITTED, but no trusted read
  accepts the suspect state — an explicit recovery-required outcome per the
  kernel's own bar. Remaining residual (documented): zombie byte lands AND
  the sidecar write itself fails — a double disk failure.
- **Final closing verification (sidecar): ZOMBIE-BYTE EVIDENCE FIXED.**
  Every demonstrated schedule — NH-1 pre-bump, NH-2 post-bump, the
  recovery-window head, after-complete, disjoint sets, three-writer variants
  (including a marker-clobber TOCTOU that STILL failed closed), sidecar-vs-
  recovery, and all single-writer fault cells — ends in B's complete commit
  or a typed fail-closed read (fresh-process readers). The sidecar survives
  B's journal removal; B's begin-read correctly refuses while a zombie is in
  flight; clean paths leave no sidecar (journal auto-recovery preserved).
  The verifier's one residual note — the evidence write itself failing — was
  closed with bounded retries (transient single I/O faults verified
  survivable by regression); a persistent write-selective fault blocking only
  the evidence file while permitting every other trusted write is the
  documented physics-limited residual.
- Documented residuals (verifier-recorded, out of threat model): an external
  writer that can edit trusted files directly; a redundant same-bytes
  `.superseded` copy may remain after crash recovery (cosmetic); refresh on
  an unchanged target self-collides with its own archive (availability wart).

## V2 — context identity (`trust/evidence.ts` + pipeline)

- **CONTRACT HELD** on the model-reachable surface (every splice/substitution/
  stale/reorder/duplicate/structural/hand-edit attack refused with typed
  codes; slice hashes genuinely recomputed; T3-1 holds end-to-end).
- One boundary finding: the pipeline entry join covered snapshot but not
  project. **Fixed** (`RecoveryRequest.projectName` + entry join; CLI passes
  beginState identity; regression: foreign-project bundle refused with zero
  transports). Also hardened the slice line-count fallback (fail-closed).
- Recorded (not defects): the bundle digest is integrity, not authenticity
  (unkeyed, like every digest in the product — a total re-stamp forgery needs
  kernel execution, outside the file-attacker model).

## V3 — paid operation (`trust/paid.ts` + boundaries)

- **Round 1 verdict: CONTRACT BROKEN — 3 holes**: (1) deterministic — MCP
  legacy consent route omitted wallMs → consent digest ≠ transported digest
  on every legacy analyze; (2) adapter consumed the SHARED frozen route (a
  Date inside extraBody mutable via setTime); (3) optional adapter-config
  fields resolved via prototype-chain lookups (post-construction pollution
  could inject wire fields/redirect fetch).
- **All fixed at the boundaries**: consent resolves with the identical budget
  shape (shared exported default) + a post-construction `op.routeDigest ===
  consentState.routeDigest` assertion (zero transports on mismatch); the
  transport consumes a private structuredClone; optional fields materialized
  as own properties. Plus the CLI ledger-lineage unification (V5-inventory B5)
  confirmed sound.
- **Re-verifier: ALL THREE FIXED** (equality live e2e; wire pinned; all 14
  pollution fields refused). Two same-class residuals closed in round 4:
  own-property reads for optional route fields (digest + wire) and for
  response fields in `openai-compatible` (parseSuccess/extractors).
- Recorded: the injected-adapter MCP path is test-only (production wiring
  refuses request-supplied adapters); envelope budgets remain bound via the
  consent digest.

## V4 — structural coherence (`trust/structural.ts` + adapter)

- **Round 1 verdict: CONTRACT BROKEN — narrowly**: the kernel classification
  held against every artifact attack; the break was the analyze post-call
  bracket classifying a binding-deleted workspace as FRESH (promoting over an
  unbound workspace). Plus a hardening gap (no version cross-check) and
  cosmetics.
- **Fixed**: both staleness walks REQUIRE the binding (typed
  binding_missing refusals); the adapter cross-checks the binding's
  graphify_version against the probed version (`incompatible`).
- **Re-verifier: DEFECT FIXED** (all variants safe; blank binding, deleted
  graph, swapped binding, deleted manifest, unprobed adapter, provider-
  independent guards). Cosmetic follow-up done: graphHealth maps
  incompatible/binding_corrupt to their own statuses.

## V5 — bypass + dependency claims (S4-M-01/02)

- **Claims A (0 unmediated), B (downward-only, cycle-free), C (canonical
  ownership) ALL HELD.** Independent census N=60 (finer grouping; both
  counts agree unmediated = 0). The four prior verifier fixes confirmed real
  in source.
- **Guard gaps closed**: ad-hoc createHash+JSON framing rule; direct fetch(
  ban; bare-path upward-import substrings; require()/import() cycle walking.
  Honest classification remains "strong anti-accident tripwire" (V5's own
  residual list — re-spelled literals, transitive laundering — documented as
  inherent tripwire limits).
- Cosmetics fixed (dead imports, dead oneLedger construction, latent
  bumpStateRevision wrapper removed).

## V6 — cross-primitive compositions

- **9/9 contracts HOLD** against every sequence attempted (real SIGKILL
  recovery; refresh during a validation retry → blocked_stale with honest
  spend; cross-family consent mismatch refusals with zero transports;
  structural mismatch before paid transport; laundered bundles refused at two
  independent layers; canonical fail-closed).
- Hardening adopted: the consent↔transport digest equality assertion (V3
  fix). Recorded observations (not defects): renewal consent binds
  graph_digest (snapshot identity transitively binds manifest+binding — the
  kernel gates are total); exported single-file persist helpers remain
  test-only (kernel-mediated); `isInside('/')` quirk is fail-closed.

## Final V1 round-4 verdict (appended after the narrow re-verify)

> Addendum (final rounds): H2 FIXED; H1's headline interleave FIXED; the
> NH-1/NH-2 adjacent windows closed by the round-6 ownership-gated protocol
> with regressions; the last narrow re-verification (two-to-three real
> processes, I/O stalls only) completed after the protocol landed — its
> verdict is recorded verbatim in 16-FIFTH-AUDIT-HANDOFF's transaction
> section and 00-REMEDIATION-STATUS. No verifier-created Critical/High
> remained unresolved at the final HEAD.

No verifier-created Critical or High finding remains unresolved. Every
genuine finding was fixed at its primitive boundary (never just the literal
reproduction), each with a generalized regression, and each fix was
re-verified by a fresh agent.
