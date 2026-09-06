# 08 — Cross-Contract Composition (Composition H, commit `f088997`)

## Paid operation × ContextBundle (H1)

Header mutation moves the `LCO:CONSENT` route digest ONLY; item mutation moves
the `LCO:PAID_CONTEXT` bundle identity ONLY; neither domain leaks into the
other; both recomputes deterministic. **The two are distinct authorities by
design** — the resolved paid operation is what the system CONSENTS to transport;
the ContextBundle identity is what the MODEL is allowed to see and cite.
Headers describe the transport envelope, not the model-visible context;
merging them would couple a re-consent trigger (route change) to context
identity and vice versa. No consent/identity drift: H2 additionally proves a
header-bearing route that fails at a controlled local fake transport keeps its
route + digest frozen through the failure.

## ContextBundle × Abort Evidence (H3)

Abort-evidence payloads carry state identity (holder, base_revision, performed)
and never embed ContextBundle digests — the domains do not intersect (verified;
no coupling to protect). H3 proves bundle identity is deterministic ACROSS a
state-transaction abort/restore cycle: same items → same `bundle_id` before and
after a strict-tx abort, membership proof recomputing.

## Paid operation × Abort Evidence (H2)

A header-bearing paid route resolves, then the local fake transport throws:
the ATTEMPTED wire carried the consented sentinel headers; no provider call
succeeded; the ledger charged the attempts; the immutable route and its digest
survived unchanged — the abort-side machinery (state tx) aborts against exactly
this frozen value, and the S5-M-04 matrix proves persistent evidence failure
stays fail-closed with disclosure. Zero real paid calls in any composition arm.

## Remaining composition gap (disclosed)

A single end-to-end analyze run combining header-bearing transport + injected
tx abort + evidence failure in ONE flow is not a single test; it is covered
piecewise (H2 + the S5-M-04 matrix + the renew E2E suite). Fresh-auditor
attention welcome; not a trust hole (each boundary is independently enforced
before the next can be reached).
