# 06 — S5-M-04 Pre-Fix Reproduction

**Finding**: Persistent abort-evidence write failure can leave no durable marker.
**Repro**: committed in `fe6eeac`; the disclosure assertion was RED against pre-fix source (demonstrated live).

## Exact persistent-failure schedule (deterministic)

1. Renewal state transaction on a real fixture project; journal written (write 1), overlay write (write 2) begins.
2. `__txFault.interleaveAndFail.onWrite: 2, only: true` — inside A's write window, concurrent writer B: parks its own foreign journal at the journal path, bumps `state.json` to R+1, swaps the writer lock; A's write then proceeds and its NEXT fence aborts (`revisionMoved` + `!ours` + B's journal on disk + `performed > 0`).
3. A's abort path attempts the sidecar `tx-abort-evidence.json` — `__txEvidenceFault.evidenceFailures: 3` kills **all three** bounded attempts (persistent, not transient; the pre-existing suite only ever armed 1).
4. Zero real paid provider calls anywhere (fault injection at the trusted-write seam only).

## Observed pre-fix behavior (live run)

The transaction rejected with the typed in-process error — fail-closed held — but:

```
message: "…the concurrent writer owns the journal path (abort evidence retained separately); inspect the state after review before re-running."
```

while simultaneously:

- `existsSync(tx-abort-evidence.json) === false` — **no marker exists**;
- all three attempts were consumed (`evidenceWrites === 3`);
- the abort message **claimed retention** — factually false;
- after "restart" (B's journal removed, simulating B completing + cleaning up): `loadActiveState` returned **healthy** at R+1 — the combined state (A's zombie overlay byte over B's commit) read as clean. With B's journal still parked, the S5-H-01 C>B join itself retires it and proceeds healthy — the sidecar was the ONLY thing that could block that, and it never landed.

That is precisely S5-M-04: failure-of-failure with no durable marker and a
message asserting the opposite. Sibling of the same class: the superseded-marker
write loop (state.ts:542-553 pre-fix) — same swallow, same dishonest-message
risk, fixed in the same remediation.
