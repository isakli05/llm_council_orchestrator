# 02 — Filesystem Boundary (TRACK A)

**C-01 CLOSED · C-02 CLOSED · M-05 CLOSED** (commit `2623d0d`)

- `assertDisjointRealRoots` (storage/paths.ts): realpath-resolved disjointness — equal roots, either ancestry direction, symlink aliases, `..`/`.`/relative-absolute textual aliases all refuse. Path-component-aware (`isInside`), never string prefixes. Enforced in `cmdRenewInit` BEFORE any directory creation, and inherited by `cmdRenewRefresh` (which delegates with force).
- Export: MCP `lco_renew_export` has no `out` (schema rejects it, runtime returns content — read-only, tree-hash-proven zero writes). CLI `resolveContainedOutputPath`: strictly inside the project root, never the target (belt+braces), no symlink components, no-clobber.
- M-05: guarded copy 0600/0700 (files/dirs), `.lco/renewal` + analyses + approvals 0700.

Tests: `src/renew/isolation.test.ts` (15) + MCP read-only tests in `src/mcp/server.test.ts`.
