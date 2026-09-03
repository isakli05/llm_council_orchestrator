# 01 — Baseline

## Audited base (verified before any change)

```text
branch at start   fix/legacy-renewal-v1-trust-kernel-remediation
HEAD              0a5cee799f1c6ee0027183a8b36121e6f02d3156   (exact expected Fourth-Audit HEAD)
working tree      clean except user-owned audit-output dirs (untouched)
git diff --check  PASS
tools             node v24.14.0 · pnpm 10.17.1 · claude 2.1.259 · graphify 0.9.50 (global, untouched)
```

## Baseline gates at the audited HEAD (reproduced before coding)

```text
build             PASS
lint              PASS
test              168 files / 2338 tests PASS
coverage          statements 93.10% · branches 89.05% · functions 96.05% · lines 93.10%
                  (matches the Fourth Audit's 89.04 branches within measurement noise)
```

## Final gates (closure HEAD)

```text
build             PASS
lint              PASS
test              172 files / 2437 tests PASS  (+4 files / +56 tests: the closure matrices)
coverage          statements 92.99% · branches 89.00% · functions 96.29% · lines 92.99%
                  thresholds UNCHANGED (91/89/96/91); no exclusions/ignores added
schema freshness  PASS (generated/spec-schema.json byte-identical)
git diff --check  PASS
packed smoke      PASS — 292 files; lco init, help/version, doctor, MCP
                  initialize/notification/parse-error handshake, browser
                  clarification, Renewal help + offline non-project refusal
frozen fixture    node dist/cli/index.js verify fixtures/pre-renewal-frozen-spec → exit 0
graphify matrix   installed 0.9.50: full suite green (real integration 7/7);
                  isolated venv 0.9.53: real integration 7/7 (global untouched)
coverage delta    statement/line −0.19pt vs baseline: the added kernel surface
                  (journal machinery, binding verification, sealed bundles)
                  is intentionally exercised by invariant tests, not
                  line-touch tests; branches stayed above threshold
```

## Snapshot/digest format changes (locked compatibility policy)

- `snapshot_id` is now `domainDigest('LCO:SNAPSHOT', v1)` derived (RSN-16hex
  shape kept). Pre-closure snapshot.json fails the reload recomputation with
  the existing tamper-evident `snapshot_corrupt` refusal whose remedy is
  `lco renew refresh` — pre-release dev state fails closed and is rebuilt,
  never silently reinterpreted.
- Snapshot schema gains a REQUIRED-nullable `graph.binding_digest` (one format
  change total; identity payload includes it).
- Consent digests moved to `domainDigest('LCO:CONSENT', v1)` — ephemeral by
  design (process opt-in window); byte-pins updated deliberately with
  anti-regression assertions.
- Workspaces built pre-closure lack `lco-binding.json` → typed
  `binding_missing` with the refresh remedy (fail closed + rebuild).
- Approval v3 digests, frozen-spec artifact bytes/hash v1/v2, and the
  compiler's canonical serialization are UNCHANGED (fixture verify stays exit 0).
