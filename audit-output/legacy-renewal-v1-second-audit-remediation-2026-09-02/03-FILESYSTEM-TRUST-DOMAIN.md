# 03 — Filesystem Trust Domain (INV-A)

Closes S2-C-01 (Critical), C-01 reopened, S2-M-04 (MCP facet), M-05-positive-flow retained. Commit `17086aa` (primitive + command wiring) + `d0a9b06` (MCP transitive).

## Shared primitive

`storage/paths.ts`:
- `authorizeRenewalPaths({projectDir, destinations})` — resolves the project root once (realpath; a not-yet-existing root authorizes trivially: nothing can be pre-planted below it), then walks EVERY component of EVERY destination relative to that root with `assertNoSymlinkBelow` (lstat no-follow, dangling links included, final component included) and rejects lexical escapes.
- Destinations enumerated once: `renewalStateDestinations(renewalPaths(dir))` — project/snapshot/overlay/parity/strategy/state JSONs + each `.tmp` atomic sibling + graph-workspace + analyses + approvals + spec.

## Enforcement points (every renewal IO surface)

| Command | Check placement |
|---|---|
| init (and refresh via init --force) | BEFORE any write, including before the workspace `rmSync` |
| status / export | entry (trusted-state reads never traverse a link) |
| analyze | entry (before probe/staleness walk) |
| review / finishReview | entry (approvals read/write + fold) |
| plan [--freeze] | entry (spec write + state reads) |
| MCP `lco_renew_*` | command cores as above + `transitiveRenewalRootCheck` at the RPC boundary (recorded target root and graph workspace must resolve inside the effective pin; -32602) |

## The audit reproduction, as a committed invariant test

`src/renew/root-invariants.test.ts` "THE REPRO": pre-existing `<project>/.lco/renewal` symlink → target subdirectory; `cmdRenewInit` exits 2 naming the symlink; the target's full inventory (bytes, modes, symlinks, directory entries — treeHash oracle) is byte-identical before/after.

## Negative matrix (committed)

`.lco/renewal` symlink (repro) · `.lco` symlink · `analyses` symlink · `approvals` symlink · `graph-workspace` symlink · `spec` symlink · store FILE as symlink (`overlay.json`) · `.tmp` sibling symlink (`parity.json.tmp`) · clean project authorizes · nonexistent root authorizes · MCP target-outside-pin -32602 (+ inside-pin control runs).

## Mutation sensitivity

Removing `authorizeRenewalPaths` (or its call in init) fails the INV-A repro and the neighbor-variant block (11+ assertions); removing the MCP transitive check fails `renew-consent-effectual.test.ts` (-32602 expectation).

## Residual risk

Check-then-write TOCTOU with a racing LOCAL writer (documented spec-write residual; dirfd/O_NOFOLLOW not portable in Node). A project root reached through symlinked ANCESTORS is legitimate and unchanged: the walk resolves the root once and polices only BELOW it.
