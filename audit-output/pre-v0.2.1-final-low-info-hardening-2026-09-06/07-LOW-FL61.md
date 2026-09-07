# 07 — Low F-L6-1: L6 entry-probe early placement unpinned

- Fresh-audit ref: report 16 §New-Low row F-L6-1; detail report 12 (Lane F) + 15 (V-L4).
- Reproduction on main: CONFIRMED as a TEST GAP — implementation correct (probe at
  renew.ts before staleness/paid/journal), but a late-placement mutation passed the
  entire committed suite; the re-audit's counting cell was never committed (existed only
  in the leftover Lane F worktree).
- Change: committed the counting cell (adapted from the re-audit's Lane F verification)
  into transaction-atomicity.test.ts: dead channel ⇒ refusal with providerCalls=0 and
  gitCalls=0. caps.provider() is constructed eagerly by the staleness check and every
  later stage routes through it before the journal write — any placement at/after it
  trips the counter. Root guard included (root gets no EACCES from mode bits) and
  backfilled onto the pre-existing entry-probe cell (commit 753db8e).
- M-2 closure: the same cell (structured counters + the two honest prose anchors kept;
  no full-string pinning).
- Mutation: M-FL61 (probe moved after the staleness provider construction) CAUGHT.
- Boundary honesty: the pin does NOT overclaim — probe success is health disclosure,
  not a future write guarantee (L6 physics boundary unchanged).
- Final: CLOSED_BY_TEST_HARDENING (F-L6-1) + CLOSED_BY_TEST_HARDENING (M-2, Info).
  Reopen: any reorder of the analyze entry sequence must consciously update the pin.
