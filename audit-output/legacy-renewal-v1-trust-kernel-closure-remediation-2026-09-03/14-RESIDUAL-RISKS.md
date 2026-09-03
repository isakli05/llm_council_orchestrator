# 14 — Residual Risks (reassessed at closure HEAD)

| Risk | Fourth-audit classification | Closure reassessment |
|---|---|---|
| Same-state consent replay / no nonce | ACCEPTABLE | UNCHANGED. Consent authorizes the same effectual immutable state within the process opt-in window; the operation identity cannot drift (S4-H-03), so replay still authorizes exactly what was consented. Bounded, documented. |
| rename-instant micro-TOCTOU | ACCEPTABLE FOR V1 | UNCHANGED (FilesystemCapability internals untouched by mandate). The transaction journal narrows the consequence window: an interleaver's first trusted read during a commit hits the journal and fails closed/recovers instead of trusting partial state. |
| Pattern-based secret detection | ACCEPTABLE | UNCHANGED — known fields sanitized; novel shapes best-effort by design. |
| Architecture guards are lexical tripwires, not containment | MATERIAL LIMITATION | IMPROVED BUT STILL TRIPWIRES: the guard suite now includes import-graph rules (upward-import ban, cycle-free walk) and a rule per known bypass class — the known classes are caught. Honest classification remains "strong anti-accident tripwire"; the kernel API is the containment (and the fresh inventory found 0 unmediated units). |
| Approval v3 cutover (pre-release dev state) | ACCEPTABLE | UNCHANGED policy family, now joined by: pre-closure snapshots (LCO:SNAPSHOT digest format) and pre-closure workspaces (no binding) fail closed with refresh remedies. No silent reinterpretation. |
| Re-plan requires refresh / stricter state semantics | ACCEPTABLE | UNCHANGED (intentional safer behavior). |
| Recovery precision/recall unbenchmarked | ACCEPTABLE | UNCHANGED (no product claim). |
| Transaction-lock stale window (~10s) | (new, documented) | A crashed committer's recovery waits ≤ the existing stale-break window when the lock file survives; deterministic and bounded. A synchronous commit sequence outliving the window (small JSON writes) is not realistic on a healthy FS. |
| Long-lived-process journal marker | (new, closed during development) | The in-flight marker is cleared on `recovery_required`, so an MCP server process recovers on its next trusted read (regression-tested). |
| Council | OUT OF SCOPE | UNCHANGED — locked V1 decision. |
| Remote CI/publish proof | CONDITION AFTER FIX | UNCHANGED — first real clean-runner/dry-run/OIDC proof remains external; workflows statically reviewed, unchanged. |

No residual contradicts a kernel contract; none is Critical/High. The NO-GO
drivers (the four High source defects + the two Medium architecture defects)
are closed at their primitive boundaries.
