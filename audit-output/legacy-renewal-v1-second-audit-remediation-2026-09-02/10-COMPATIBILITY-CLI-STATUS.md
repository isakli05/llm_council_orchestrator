# 10 — Compatibility / CLI / Status Truth (INV-H)

Closes S2-H-08 (High), S2-M-03 (Medium), S2-L-01..L-04 (Low); status truth shared with INV-B4. Commits `db29fe5`, `b3fce5c`, `d0a9b06`.

## H1 — Frozen-spec backward compatibility (S2-H-08)

- **Hash v2**: `artifactHashes` hashes each section over `canonicalJson` (recursively key-sorted, arrays preserved); `freeze` stamps `manifest.hash_version: 2`.
- **Compatibility verification**: `verifyFrozen(bundle, rawSections?)` accepts a stored hash when it matches the v2 canonical hash OR — for pre-v2 records only — the legacy hash `sha256(JSON.stringify(rawSection ?? zodSection, null, 2))` over the section AS PARSED FROM FILE (key order preserved; `compileSpecDir` now returns `rawSections`). `hash_version >= 2` ⇒ canonical-only strict mode. Zod output ordering can never drift a semantically-unchanged artifact again.
- The MCP check/consent path threads `rawSections` through (`validation.ts` → `loadCheckBundle` → `authorizeExecution`).

**Runtime acceptance on the audit's own fixture** (`/tmp/lco-base-compat-AuKMbq`: base verify exit 0, remediation-base verify exit 1 "drifted sections: evidence"):

| Probe (current build) | Result |
|---|---|
| verify on the untouched pre-Renewal fixture | **exit 0 — verify OK** |
| one real semantic value change | **exit 1 — drifted sections: intent** |
| key-reorder-only equivalence (unit matrix, `hash-compat.test.ts`) | PASS (7 tests: legacy-compat, v2 reorder-stability, semantic drift, strict mode, rawSections fidelity) |

## H2 — CLI grammar (S2-M-03)

`parseRenew` rebuilt as a strict left-to-right walk:
- whitespace-only `<dir>` and value-flag values are errors (reject, never trim-and-use);
- duplicate flags (value or bool) error — never first-wins;
- extra positionals error;
- membership/value-cardinality/numeric/required/conflicts semantics retained.

65 table-driven tests across all seven subcommands; canonical invocations parse to byte-identical objects.

## H3 — Status truth (S2-M-05)

`open_questions` derives from ACTIVE unresolved work (see 04-VERSIONED-STATE-CONCURRENCY §B4). The audit's healthy-flow shape (parity resolved 0 unresolved, 1 counted question) now reports 0.

## H4 — Git stderr (S2-L-02)

MCP `renewCaps.gitCommit` uses `stdio: ['ignore','pipe','ignore']` (CLI parity). Plain targets: structured `repo_kind:'plain'`, no raw `fatal:` leakage.

## H5 — Documentation truth (S2-L-03, S2-L-04)

- Main help: the models entry's description no longer spliced under the renew family entry (continuation prose fixed).
- README MCP table: `lco_renew_export` documented as `{dir}` content-only — no `out` parameter; file export is CLI-only.
- S2-L-04 reconciliation: first-remediation report 13's "H-01 open" was stale; reports 00/11/12 were correct (H-01 closed at coverage-gate green, 93.64/89.19/96.08/93.64). This remediation's report set states the reconciliation explicitly and supersedes the first remediation's closure claims wherever they conflict.

## H6 — Diff hygiene (S2-L-01)

The four trailing-whitespace test lines removed; `git diff --check` clean at HEAD AND against `feat/legacy-renewal-v1`.
