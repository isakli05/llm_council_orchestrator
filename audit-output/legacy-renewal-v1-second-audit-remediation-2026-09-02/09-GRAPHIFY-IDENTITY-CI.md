# 09 — Graphify Identity + CI/Publish (INV-G)

Closes S2-H-06 (High), S2-H-09 (High); H-11, M-08, H-13-publish reopened originals. Commit `b8fa189`.

## G1 — Strict manifest identity

`parseGraphManifestStrict` (snapshot.ts) now rejects, each as typed `manifest_invalid` naming the offending path:
- `{}` (zero entries — a built graph always records at least one file);
- non-object entries (scalars, null, arrays);
- entries without a non-empty STRING `ast_hash`.

Identity over malformed state is no longer representable (the old code mapped malformed entries to `''` and blessed them). `digestGraphManifest`'s explicit empty-constant fallback is documented as non-load-bearing-only.

## G2 — Graph uniqueness

`parseGraphFile` (graph-reader.ts): duplicate node ids ⇒ `graph_invalid`, up to 5 duplicates named (+N more) — every downstream join is id-keyed; duplicates are silent loss. Dangling-link rejection retained.

## G3 — Health semantics

`graphHealth` (graphify-adapter.ts) returns typed `status: healthy | missing | malformed | incompatible` (additive field; failures carry it on `IntelFailure`): graph absent → missing; graph/manifest malformed (JSON, schema, `{}`, entry shape, duplicate ids, dangling) → malformed; unsupported version → incompatible; both valid with ≥1 entry → healthy with accurate counts. A malformed manifest can no longer render as healthy `manifest_entries: 0`.

## G4 — Version compatibility (execution-time verification)

| Check | Result (2026-09-02) |
|---|---|
| installed | 0.9.50 (global untouched) |
| declared range | `>=0.9.50 <0.10.0` |
| official PyPI `graphifyy` newest in-range | **0.9.53** (2026-08-30, not yanked; only yanked release in history is 0.8.48, out of range) |
| official GitHub latest release | v0.9.53 (2026-08-30); v1.0.0 tag exists but is out of range and is not the PyPI/GitHub release |
| integration 0.9.50 | 7/7 PASS (installed env) |
| integration 0.9.53 | 7/7 PASS (isolated venv `/tmp/twf-venv` via PATH override; global install unmodified) |
| ci.yml matrix | floor 0.9.50 + newest 0.9.53 — already current; no change required |

## G5 — Publish workflow parity (S2-H-09)

`.github/workflows/publish.yml`:
- NEW step installs the pinned Graphify (0.9.53) using the exact ci.yml idiom (`python3 -m pip install --user --disable-pip-version-check "graphifyy==0.9.53"` + `$GITHUB_PATH` + `graphify --version` verification), placed before the test steps — the renewal integration canary can actually run and pass on a clean runner;
- `pnpm --filter ./packages/spec-core test` → `test:coverage` (the release-quality coverage policy ci.yml already enforces);
- OIDC/trusted-publishing, frozen lockfile, schema freshness, packed smoke, release-readiness gates untouched.

Validation performed locally: clean-venv pin resolution (0.9.53), YAML parse, and the canary's exact detection mechanism probed with the venv bin prepended to PATH (proving the `$GITHUB_PATH` mechanism). A full clean-runner execution of the publish job is inherently a CI-time proof — flagged as such for the third audit.
