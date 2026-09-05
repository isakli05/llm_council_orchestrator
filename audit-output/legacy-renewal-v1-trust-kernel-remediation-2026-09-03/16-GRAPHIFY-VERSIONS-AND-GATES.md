# 16 — Graphify Version Matrix (Phase 16, execution-time)

Checked fresh on 2026-09-03 (program execution date):

| leg | version | evidence | result |
|---|---|---|---|
| supported floor | 0.9.50 (globally installed) | `graphify --version`; `npx vitest run src/renew/intel/graphify-adapter.integration.test.ts` | **7/7 PASS** (real subprocess integration) |
| newest compatible | 0.9.53 | PyPI `pypi.org/project/graphifyy/` (latest 0.9.53, 2026-08-30; no 0.10.x/1.0.0) + GitHub Releases (v0.9.53 Latest, commit 33362d9); isolated venv install `graphifyy==0.9.53`, global untouched, PATH-scoped integration run | **7/7 PASS** |

CI (`ci.yml`) pairs Node 22 + Graphify 0.9.50 with Node 24 + Graphify 0.9.53 and asserts the integration canary actually runs; publish (`publish.yml`) installs 0.9.53 before coverage + packed smoke — parity with CI verified. Supported range `>=0.9.50 <0.10.0` unchanged; Graphify remains an external pinned subprocess (no vendoring).
