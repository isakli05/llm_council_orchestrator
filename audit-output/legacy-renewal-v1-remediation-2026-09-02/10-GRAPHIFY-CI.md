# 10 — Graphify & CI (TRACK I)

**H-11 CLOSED · H-13 CLOSED · M-06 CLOSED · M-08 CLOSED** (commit `cea5fbf`)

- H-11: dangling links in graph.json are `graph_invalid` (count + bounded sample + rebuild hint) — load-bearing graph state never proceeds on partial success. Malformed/absent manifests were closed in TRACK B (`parseGraphManifestStrict`).
- M-08: `graphHealth` reports REAL manifest entries (reads the manifest; 0 only when truly absent); `godNodes` returns `GodNode[] | IntelFailure` — provider errors never collapse to an empty result (interface + both implementations + callers).
- M-06: POSIX children spawn as process-group leaders; timeout/output-cap kills the WHOLE group (`process.kill(-pid)` with direct-kill fallback; Windows documented fallback). Real-process test: a grandchild sharing the group never writes its marker after the kill.
- H-13: CI installs a pinned Graphify per matrix leg — floor `0.9.50` (Node 22) and current `0.9.53` (Node 24; current-ness re-verified on PyPI THIS session before pinning). The integration suite carries a CI canary that FAILS when the promised availability is missing, so the real integration can never silently skip in release CI. Local runs keep the documented skipIf.

Tests: graph-reader dangling test, adapter health test, `subprocess.test.ts` (real processes), integration canary.
