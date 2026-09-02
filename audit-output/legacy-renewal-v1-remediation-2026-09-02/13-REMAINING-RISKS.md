# 13 — Remaining Risks

1. **H-01 coverage gate (OPEN).** branches 86.56% < 89% (131 points short), functions 95.12% < 96% (7 short). Thresholds untouched. Report 11 has the measured per-file pools and a concrete closure plan. This is the sole blocker to a second audit.
2. **Consent replay residual.** The digest binds effectual state (source/model/profile/budget/protocol) so a digest cannot authorize a DIFFERENT operation, but re-use against identical state is possible until a server-side nonce/run store exists (documented future work; matches the audit's "if supported safely" framing).
3. **M-07 scope.** File-backed lock + staged atomic writes protect the renewal store pairs; there is no cross-store WAL beyond those pairs. Within the file-backed architecture this is the audit-appropriate depth.
4. **Dev-state snapshot migration.** The snapshot schema gained a required `graph_digest`; pre-remediation snapshot files fail schema → corrupt → refresh required. Acceptable for unpublished dev state; a published format would need an explicit migration path.
5. **Runtime-only coverage material** (DB triggers, stored procedures, reflection, generated code) is surfaced as manual-review tasks/assumptions — honestly unresolved, not machine-verified. Any claim of full coverage would still be wrong; the product now says so.
6. **Real-world evaluation** remains NOT READY exactly as audit report 14 described — that is post-merge program work, unchanged by this remediation.
