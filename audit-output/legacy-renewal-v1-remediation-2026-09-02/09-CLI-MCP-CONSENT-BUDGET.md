# 09 — CLI / MCP / Consent / Budget (TRACK H)

**H-04 CLOSED · H-05 CLOSED · H-10 CLOSED · M-04 CLOSED · L-01 CLOSED · L-02 CLOSED** (commit `8e850ee`)

- M-04: per-subcommand grammar tables (allowed/required/value-vs-bool/conflicts/prerequisites); flags of other subcommands error with the allowed list; value flags require real values (flag-shaped values error); `--answers`⊥`--interactive`; `--no-open` requires `--interactive`.
- H-05: `--max-attempts/--max-tokens/--max-wall-ms` (positive-int validated) + documented default envelope (8 attempts / 15 min wall) at BOTH boundaries; the MCP profile ledger is injected into the recovery core.
- H-04: `variant: 'renewal'` is a first-class config variant (exactly `renew_recover`) — validated/named/resolvable through `resolveProfile`; CLI + MCP consume the TYPED resolved role; every `as never`/`as unknown as` on this path was removed (diff-verifiable).
- H-10: `renewConsentDigest` binds consent protocol version, normalized root, ACTIVE snapshot + graph digest, scope, profile fingerprint, resolved model, and budget envelope — computed from live project state; the refusal advertises the digest for the exact effectual operation. A root-only digest no longer authorizes (test-proven, zero calls). Residual: run/nonce replay limiting documented as future work in the handoff.
- L-01: `lco renew <sub> --help` prints subcommand-specific help with class labels (PAID/offline/interactive/read-only/writes-LCO-state); no models prose.
- L-02: one quiet git probe per init (stdio-suppressed), structured `repo_kind:'plain'`.
- H-02 (also here): analyze probes Graphify (installed + supported) BEFORE any LLM route construction at both boundaries.

Tests: `src/cli/args.test.ts` (8 renew grammar tests), server.test.ts consent/binding tests, config suites.
