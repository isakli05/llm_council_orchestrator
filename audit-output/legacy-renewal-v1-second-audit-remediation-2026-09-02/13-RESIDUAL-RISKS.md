# 13 — Residual Risks

| Risk | Classification | Disposition |
|---|---|---|
| Same-state consent replay without nonce | ACCEPTABLE FOR V1 (documented) | Effectual-state binding is closed (S2-H-02); a same-state replay by the same operator is the documented limitation. Not a new exposure. |
| Check-then-write TOCTOU on renewal state paths | ACCEPTABLE FOR V1 (inherited) | The spec-write residual of the design (portable Node lacks dirfd/O_NOFOLLOW). Pre-planted symlinks, dangling links, and every shipped write path are covered; a racing LOCAL writer with project-tree write access is outside the threat model. |
| Pre-remediation development approval records under digest v1 | ACCEPTABLE FOR V1 (explicit migration) | Fail closed with an actionable message; unpublished pre-release state; re-review after refresh regenerates records. No silent acceptance. |
| Redaction is pattern-based | ACCEPTABLE FOR V1 (bounded) | L1 deny-list + L2 secret shapes + L3 credential assignments + human gates; novel secret shapes without a credential-tail name can pass — defense-in-depth, not a guarantee. |
| Recovery recall/precision unproven | ACCEPTABLE FOR V1 (unchanged) | Fixture mechanics are not recall evidence; the pre-registered eval corpus remains a post-merge experiment (per the second audit's own residual list). |
| Publish-workflow clean-run proof is CI-time | GO CONDITION (evidence provided) | Local: pin resolution in a clean venv, YAML validity, canary-detection mechanism probe; the full job runs on the next dispatch. ci.yml remains green by inspection + matrix. |
| Older-approval re-fold by a hypothetical non-newest loader | THEORETICAL | Every shipped caller folds the newest on-disk APPR record (finishReview). No shipped path loads an arbitrary approval for folding. Flagged for third-audit probing. |
| Council topology | OUT OF SCOPE (unchanged) | Remains MODERATE_REFACTOR_REQUIRED; untouched by this remediation. |
| Windows junction/reparse-point semantics | OUT OF SCOPE (documented) | POSIX is the product target (pre-existing). |

No residual above blocks `READY_FOR_THIRD_INDEPENDENT_AUDIT`. The release GO/NO-GO belongs to the third audit.
