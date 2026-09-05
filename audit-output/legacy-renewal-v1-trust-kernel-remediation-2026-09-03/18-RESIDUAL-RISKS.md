# 18 — Residual Risks (re-evaluated after kernel implementation)

The program requires residuals to be RE-EVALUATED after the kernel exists, not grandfathered. Each row: the third-audit residual, the post-kernel re-evaluation, and the verdict.

| residual | re-evaluation after the Trust Kernel | verdict |
|---|---|---|
| Same-state consent replay / no nonce | Unchanged mechanism: consent digests bind the resolved route + effectual state, are recomputed per request, and are replayable for IDENTICAL state within the operator's opt-in window. The kernel did not introduce replay surface (the route digest NARROWED what a replayed digest authorizes: any effectual drift invalidates). A nonce would add revocation semantics the V1 operator model (env opt-in per server start) does not promise. | ACCEPTABLE FOR V1 (documented; the binding defects that made it Critical-adjacent are closed) |
| micro-TOCTOU between authorization and write | NARROWED from minutes-wide windows (paid call, interactive review, graph subprocess — all previously authorization-at-entry) to the single instant between `authorizedWrite`'s write-time re-walk and the rename. The kernel cannot close it portably in Node (no dirfd/O_NOFOLLOW); it is documented at the primitive, not hidden. Requires a racing LOCAL writer with concurrent write access to the project tree — outside the threat model. | ACCEPTABLE FOR V1 (as the third audit itself framed the truly-immediate window) |
| Pattern-based redaction limits | All KNOWN repository-derived fields now flow the single sanitizer (identities included); persisted diagnostics scrubbed; the PEM region bounded with measured scaling. Novel secret shapes without credential-tail names can still pass — inherent to pattern-based defense-in-depth; bounded by the ingest deny-list and the human gates. | ACCEPTABLE FOR V1 (as before, but with the known-bypass class closed) |
| digest-v1 development-record rejection | Unchanged policy: pre-release dev state fails closed with a re-approve instruction (v1→v2→v3 consistently). | ACCEPTABLE FOR V1 (unchanged rationale) |
| First real publish clean-run/OIDC proof | External GO CONDITION by nature (clean-runner CI evidence after source blockers close; the untagged remediation branch does not publish by design). | GO CONDITION (external) |
| Recovery precision/recall | No quality claim made; fixtures are mechanics evidence, not recall evidence. The kernel does not change the claim. | ACCEPTABLE FOR V1 (unchanged) |
| Council topology | OUT OF SCOPE (locked decision — no council in Renewal V1). | OUT OF SCOPE |
| Windows junction/reparse semantics | POSIX remains the product target; the kernel uses POSIX primitives (O_EXCL, rename, hardlink) with the same platform posture as before. | OUT OF SCOPE (unchanged) |

## New residuals introduced by this program (honest disclosure)

| residual | detail | verdict |
|---|---|---|
| Interactive-clarify session budget semantics | Unifying the adapter and session on ONE session-sized ledger means the interactive session's transport attempts count against the session envelope (maxRounds × per-run) rather than an unbounded implicit budget — a TIGHTENING, but operators relying on the old (uncounted) transport spend may hit the session cap earlier. | Behavior change, safer direction; documented |
| Refused plan writes no `--strategy` | A `plan --strategy X` whose plan validation fails no longer persists strategy.json (previously written before validation). Re-run plan after fixing blockers. | Behavior change, safer direction; documented |
| Approval v3 cutover | On-disk v2 renewal approvals fail closed; re-run the review to re-approve. Pre-release dev-state policy (identical to v1→v2). | ACCEPTABLE FOR V1 |
| Recovery model-output anchors are context ids | Any EXTERNAL consumer of persisted analysis records must read the server-resolved anchors (persisted shape unchanged) — the model's raw claims are not persisted at all (previously they were). | Improvement, not a residual; noted for consumers |
