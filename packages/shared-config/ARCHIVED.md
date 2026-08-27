# ARCHIVED — do not use, fix, or publish

`@llm/shared-config` is a legacy shared package consumed only by the archived
`apps/*` services. It predates the spec-core pivot, is **broken by design**, and
is **not imported by `packages/spec-core`** (audit ARCH-001). It stays on disk
only so the archived apps keep their historical shape.

The active product is **`lco-spec`** (`packages/spec-core`). See the root README
section ["Legacy (archived) — do not run"](../../README.md#legacy-archived--do-not-run)
and [docs/legacy-salvage-list.md](../../docs/legacy-salvage-list.md).
