# ARCHIVED — do not run, fix, or deploy

This is the legacy code **indexer** service (repository discovery, embedding,
semantic search over a REST API on port 9001). It predates the spec-core pivot
and is **broken by design**: it has no build script, its former Dockerfile
referenced scripts and `dist/` entrypoints that do not exist, and it is not
maintained. There is no supported way to start it from the root.

The active product is **`lco-spec`** (`packages/spec-core`). Some discovery
utilities here may be worth extracting, but only after the verdicts recorded in
[docs/legacy-salvage-list.md](../../docs/legacy-salvage-list.md). See the root
README section
["Legacy (archived) — do not run"](../../README.md#legacy-archived--do-not-run).
