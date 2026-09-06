# 07 — L5 (RC1): marker-write journal-clobber TOCTOU

Investigator: MAO seat C2 (read-only Phase 1). Scratch drivers at
`/tmp/lco-pr5-hardening/c2/` (drive the REAL state machine via dist through a
require-cache wrapper on `dist/renew/trust/fs.js` — exact equivalent of the
repo's `vi.mock('./fs')` seam, transaction-atomicity.test.ts L33-107). Projects
created by real `cmdRenewInit`; readers are genuinely separate OS processes.

## 1. The window (current source)

Abort path of `applyStateMutation` (`renew/trust/state.ts` L450-639),
`revisionMoved` branch:

1. L523-527 `revisionMoved` check; L529 `ours = journalIsOurs(...)` (journal read #1)
2. L538 sidecar condition `journalOnDisk(...) !== undefined` (read #2)
3. **L544 gate `if (ours || journalOnDisk(...) === undefined)` — read #3, the TOCTOU read**
4. L545 → `markJournalSuperseded` (L689-701): rebuild journal with
   `superseded:true`, recompute integrity, then up to 3 attempts of
   `persistTrustedJson` (L694)
5. L277-289 → `trust/fs.ts` L168-241 `authorizedWrite`: staging 'wx' + fsync +
   re-authorize + **`renameSync` REPLACE (L230)** — no noClobber

Window = [read #3 `existsSync`=false] → [`renameSync` L230, attempt 1]. The
aborting writer holds NO effective lock (`revisionMoved` implies stale-broken
lock; `releaseLock` identity-conditioned, storage/revision.ts L235-244). Any
writer B2 whose journal begin (L466, also replace semantics) lands in the window
is overwritten. The 3-attempt retry loop WIDENS the window across three staging
cycles under transient faults.

## 2. Deterministic reproduction (forced window, no sleeps)

`l5-clobber.js <variant>` — window forced exactly like the repo's
`interleaveAndFail` seam; a marker-hook parks a legitimate B2 journal
(integrity-valid, real `domainDigest('LCO:STATE_TX',1,…)`) before the marker's
`authorizedWrite` proceeds.

- **crashed (clobber)**: B2 parked (base==current) then dies → A's marker
  overwrites it; journal on disk: `holder.pid: A | superseded: true`; B2 journal
  survived: false; **FRESH READER: REFUSED `recovery_required`** ("journal … is
  SUPERSEDED — … Recovery refuses to auto-rollback over the newer revision…") —
  auto-recovery converted to MANUAL.
- **crashed-control** (marker write fails instead, B2 untouched): fresh reader
  `OK revision 2` — B2's journal honored as rollback authority (auto-recovery).
  The clobber is the delta.
- **stale journal substitution** (old base R parked at current R+1): stale
  journal rejected as authority in both arms; clobber converts auto-retire into
  manual refusal (S5-H-01 C>B retire arm preserved otherwise).
- **concurrent legitimate writer, alive**: B2's `removeJournal` (L787-813,
  ownership check L802) correctly LEAVES the foreign marker → B2 commits cleanly
  at rev 3 yet every reader lands MANUAL. Control: healthy rev 3.

Caveat (same as prior audit report 08): the concurrent park is simulated at the
FS seam in one process; the reader side is fully real (separate process); durable
bytes identical to a real interleave (marker write is a pure function of A's
in-memory journal + path state at rename time).

## 3. Failure direction (proven)

- **No authority wrongly regained**: B's committed revision and overlay bytes
  stand after A's abort in every variant; the marker journal is refused by
  recovery before the join (`state.ts` L968-975 precedes L1004); a non-superseded
  journal with base < current hits the C>B retire arm (L1004-1020; verified:
  `c-gt-b` non-superseded → retire, committed bytes survive).
- **No false claims**: A's retention phrase true; reader's SUPERSEDED message
  truthful about the class. Only gap: message doesn't attribute that a third
  writer's authority was destroyed — availability wording, not a durability lie.
- Fail-closed only: availability/recovery degradation in a narrow window.

## 4. Design space (constraints: no 2nd journal / widened rollback / pre-arm
store / unbounded locking)

| Option | Protects | Residual window | Constraint check |
|---|---|---|---|
| (a) **CAS-on-absent marker write**: `authorizedCreateExclusive` (fs.ts L260-296, O_EXCL 'wx', typed `record_exists` refusal L285-292), ours-case preceded by ownership-conditioned `removeJournal` | Everything — a parked journal physically occupies the path; O_EXCL fails atomically; racer wins, A's marker doesn't land | Zero clobber; ours-case remove→create gap can leave NO marker (evidence loss) → must be DISCLOSED with a new truthful phrase | Passes all four |
| (b) re-verify journalOnDisk before rename | narrows only; check→rename still two steps | insufficient alone |
| (c) fencing token verified at commit | nothing at write time (clobber occurs before); read-side already covered by integrity + superseded + S5-H-01 join | pointless alone |
| (d) re-acquire writer lock around marker write (`acquireSpecRootLock` revision.ts L138-177, fail-fast `LockHeldError`) | all lock-respecting writers | stale-break >10s unreachable for sub-second marker; on LockHeldError marker skipped = NO evidence at all in empty-path case (worse than (a)) | bounded but inferior |

**Chosen: (a)** — (b)'s intent subsumed (O_EXCL create IS the re-verify);
existing production primitive (already used by `renew/clarify/approvals.ts` L59,
`renew/recovery/analysis-store.ts` L34).

Fix sketch:
- `markJournalSuperseded` (L689-701): replace `persistTrustedJson` with
  `authorizedCreateExclusive({projectDir, path: paths.journal, content, mode:0o600})`;
  ours-case: first `removeJournal(projectDir, paths, holder)` (L787, re-checks
  ownership internally); transient I/O keeps bounded 3 attempts;
  `TrustFsError code==='record_exists'` breaks immediately → outcome
  `{landed:false, reason:'race'}` (extend `MarkerWriteOutcome` L654).
- L544-546: pass `ours` down (removes read #3 entirely).
- L550-577 disclosures/retention: add the `race` arm — truthful phrase:
  "the superseded marker was NOT written: a concurrent writer's journal occupied
  the path (its rollback authority preserved)".
- Regression test (deterministic, no sleeps): extend the `vi.mock('./fs')` seam
  in transaction-atomicity.test.ts to wrap `authorizedCreateExclusive` — on the
  marker create, park B2's valid journal (same builder as the NH-1 test L848-870)
  before calling through. Assert: race outcome typed; B2 journal byte-identical
  afterward; fresh read auto-recovers (crashed B2) or lands clean (alive B2);
  A's message discloses the race; zero `.tmp` leakage. Negative cells: marker
  lands normally when path empty and when ours.

## 5. S5-H-01 protected contracts (re-verified live)

C==B non-superseded → rollback authority granted (arm executed — proven via
restored-bytes then typed `store_corrupt` on read). C>B → retire, committed
revision + stores survive, NEVER rolled back. C<B → fail-closed AHEAD refusal
(L1021-1031). C unreadable → fail-closed join refusal (L986-1003). Superseded
journals at ALL three relations → manual refusal, never auto-rollback (superseded
check L968-975 precedes the join; `superseded` covered by the integrity digest
L381-390, so a marker cannot be silently un-marked). The fence cannot re-grant
rollback authority to a superseded journal: the marker never gains authority
itself; CAS only preserves whatever authority legitimately occupies the path.

**Invariant:** *The abort path may never destructively write the journal path
unless it has proved — through an atomic create / ownership-conditioned remove —
that the bytes it is replacing are its own or absent.*

## 6. Mutation proof required

Remove the CAS (revert to replace-semantics marker write) → the forced-window
regression test fails (B2 journal clobbered again).

## 7. Disposition

Investigator proposal: OPEN_REQUIRES_OWNER_DECISION (constraint-compliant fix
sketched; becomes VERIFIED_CLOSED once landed). **PM determination:** design (a)
uses an existing production FS primitive, introduces no new authority store, and
is squarely within the program charter → implement; target final disposition:
**VERIFIED_CLOSED**.

## 8. Risks

Ours-case remove→create gap trades "clobber" for "marker may not land"
(fail-safe, disclosed — otherwise a new wording-race is born); B's own journal
begin (L466) still replaces an existing marker by design (accepted next-tx
behavior, unchanged); the race disclosure phrase must not be confusable with the
channel-failure phrase (different prefix).
