# 03 — FilesystemCapability (trust/fs.ts)

Closes at the primitive: S3-C-01 (export `out.tmp` symlink), S3-C-02 (hard-link `.tmp` aliases), S3-H-02 (trusted descendant reads), S3-M-05 (archive collisions), S3-L-02 (swap cleanup deleting foreign occupants). Reopens closed at the root: C-01, C-02, C-01/S2-C-01 universal.

## The one write API

```
authorizedWrite({projectDir, targetDir?, path, content, mode?, noClobber?})
  1 authorizeProjectDestination — resolved containment inside the realpath'd
    project root + per-component no-follow walk (final component included,
    dangling links included)
  2 refuseIfInsideTarget — destinations resolving into the analyzed target
    refuse (the target has no write API at all)
  3 staging: `.<name>.lco-<24-hex>.tmp` via openSync('wx', 0o600) in the
    destination directory
      - EEXIST ⇒ typed staging_collision; the foreign occupant is never
        opened, never truncated, never deleted
  4 write + fsync through OUR handle only (no existing inode is ever opened
    for write anywhere in the kernel)
  5 write-time re-authorization: re-walk the chain; lstat the staging entry
    (must still be the regular file we created)
  6 atomic rename onto the destination (directory-entry replacement)
  7 on failure: unlink ONLY the staging entry we created
```

## Why the historical attack classes are structurally gone

- **Hard-link alias at a fixed `.tmp`** (S3-C-02): staging names are random and exclusively created; we never open a pre-existing `.tmp`. A pre-planted `state.json.tmp` is untouched and irrelevant.
- **Hard-link alias at the destination**: replacement is a rename; the OLD inode (and every link to it, including one planted in the analyzed target) keeps its bytes. Proven by `fs.test.ts` "replaces an existing destination ATOMICALLY": the target-side alias still reads `OLD` after the write.
- **Export `out.tmp` symlink** (S3-C-01): export calls `authorizedWrite` with `noClobber` after the contained-output preflight; the staging temp is internal and random — there is no fixed `out.tmp` to pre-plant, and a symlinked final destination refuses at step 1/2.
- **Trusted descendant reads** (S3-H-02): `authorizedRead` lstats the final path (regular file required) and walks the chain below the root; symlinked graph.json/slice/record children refuse.
- **Archive collisions** (S3-M-05): `authorizedRenameNoClobber` refuses an existing destination; refresh supersession refuses rather than overwriting earlier history.
- **Foreign-file deletion** (S3-L-02): `swapFilesAtomically` (storage/revision.ts) now registers temps with a created-flag flipped only after the exclusive open succeeds; failure cleanup unlinks only entries the call created; backup paths likewise. Staging/backup names carry pid+counter+8 random bytes.

## Companion APIs

`authorizedCreateExclusive` (immutable approvals/analyses; `wx`, symlink occupants refused identically), `authorizedEnsureDir`, `authorizedRenameNoClobber`, `authorizedRemoveTree` (refuses a symlink at the root), `authorizedCopyWrite` (guarded-copy fresh files), `authorizedCreateDirAtomically` (renewal spec staging), `authorizedStat`. `preflightRenewalSurface` is the UX preflight over the fixed state surface — diagnostic only; per-write enforcement is the API above.

## Consumers (old → new)

All nine former write implementations are gone from production paths: export `atomicWrite` → `authorizedWrite`; `persistRenewalProject`/`persistSnapshotFile`/`bumpStateRevision` → `authorizedWrite` wrappers; `persistOverlay`/`persistParity`/`persistStrategy` → `authorizedWrite` (projectDir-first signatures); `writeRenewalApproval`/`persistAnalysisRecord` → `authorizedCreateExclusive`; `supersedeRenewalStores` → `supersedeStoresForRefresh` (kernel, archives spec too); workspace `rmSync`/`mkdirSync` → `authorizedRemoveTree`/`authorizedEnsureDir`; guarded-copy `writeFileSync` → `authorizedCopyWrite`; `writeSpecDir` renewal path → `stageSpecDir` inside the state transaction. The spec swap engine (`storage/revision.ts`) remains the single staging/rollback implementation product-wide, hardened in place.

## Residual (documented, not claimed solved)

Micro-TOCTOU between step 5's re-walk and step 6's rename — a racing LOCAL writer with concurrent write access to the project tree swapping a chain component in that instant. Not closable portably in Node (no dirfd/O_NOFOLLOW). This is the third-audit residual acceptance narrowed to a single rename instant; the former MINUTES-wide authorization gaps (paid call, interactive review, graph subprocess) are closed by write-time re-authorization inside the API.

## Verification

- Unit/permutation matrix: `npx vitest run src/renew/trust/fs.test.ts` (23 tests: the T3-1-era alias classes — symlink chain/final/dangling/parent, in-project-alias legality, hard-link destination replacement proof, planted fixed `.tmp` irrelevance, noClobber, outside-root escapes, target containment, inventory-preservation on every rejected mutation).
- Architecture guard: `src/renew/trust/architecture.test.ts` forbids direct write primitives across the renewal production surface.
- Immutability at the workflow level: the Phase-9 E2E asserts target byte/mode/symlink identity across the whole journey.
