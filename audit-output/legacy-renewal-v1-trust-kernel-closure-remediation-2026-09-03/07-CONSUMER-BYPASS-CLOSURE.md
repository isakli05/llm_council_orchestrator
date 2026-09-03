# 07 — Consumer Bypass Closure (S4-M-01)

## Fresh inventory (delegated read-only auditor, pre-migration)

- Fresh PM/delegated count: **N = 52** trust-bearing consumer units
  (Fourth Audit: 50 — delta: the journaled mutation path, the binding-seal
  build step, and the split of the paid-route units across boundaries are new
  semantic groupings; no units were dropped).
- Mediated by the intended primitive: 49; boundary-policy layers above the
  kernel (MCP dir pinning; consent state assembly): 2.
- Deviations found by the fresh inventory beyond the original eight: **B1**
  (raw `readFileSync` approval reader — zero production callers, latent),
  **B2** (adapter default workspace reader was raw fs), **B3** (ad-hoc
  `context_digest`), **B4** (ad-hoc MCP profile fingerprints), **B5** (CLI
  split-ledger lineage — the pipeline envelope was a second ledger instance
  next to the operation's own).

Final state: **trust-bearing consumers: 52 · unmediated: 0.**

## The original eight + the fresh five

| # | Consumer / effect | Old path | Authoritative primitive | New path | Old bypass removed? | Architecture guard | Test |
|---|---|---|---|---|---|---|---|
| 1 | project metadata reads | `loadRenewalProject` readFileSync | FilesystemCapability | `authorizedRead` chain-validated read | YES (raw read deleted) | raw-read rule (project/analysis-store/approvals files) | project.ts paths exercised across suites |
| 2 | snapshot reads | `loadSnapshotFile` readFileSync | FilesystemCapability | `authorizedRead` | YES | same | snapshot-trust suite |
| 3 | analysis-ID collision recovery | live `loadAnalysisRecords` raw reader | FilesystemCapability / storage boundary | trusted analysis-store reader (`authorizedRead`, projectDir-scoped) | YES (the diagnostics-only exception is gone) | same | analysis-store.test, renew collision path |
| 4 | planning support gate | `parityGate` inline `support_status !== 'human_confirmed'`; `assertSupportPolicy` dead | EvidenceCitation | `parityGate` calls `assertSupportPolicy('planning_input', …)` | YES (inline rule deleted) | ONE-policy rule (literal banned outside trust/evidence + parityGate must call the kernel) | verifier-fixes C-2, ledger.test |
| 5 | destructive parity ruling map | local `CANONICAL_PARITY_RULINGS` + `canonicalRuling` | AuthorityGrant | parity consumes authority's map (local definitions deleted; re-exports only) | YES | definition-locality rule | canonical ruling corpus tests |
| 6 | CLI named-profile transport | `buildRoleAdapter + wireCap` | ResolvedPaidOperation | `resolveRoleConfig → routeFromConfig → createPaidOperation` | YES | MCP-server no-factory rule + createPaidOperation co-presence on both boundaries | paid-immutability, runcli suites |
| 7 | MCP named-profile transport | same reconstruction; consent from parts | ResolvedPaidOperation | same construction; consent binds the SAME routeDigest | YES | same | server.test consent arms |
| 8 | graph for context/planner/export | `GraphifyAdapter.graph()` raw `parseGraphText` | StructuralIdentity | `loadGraph` → `requireStructuralGraph` (bound triple) | YES | parseGraphText locality rule | structural-coherence suite |
| B1 | approval record reads | `loadRenewalApproval` readFileSync (latent, 0 prod callers) | FilesystemCapability | `authorizedRead` (projectDir-scoped) | YES | raw-read rule incl. approvals.ts | approvals.test, tranche6/7, root-invariants |
| B2 | structural trust triple reads | adapter default reader raw fs (channel) | FilesystemCapability | default reader = `authorizedRead` (content was already coherence-verified; now the channel is too) | YES | adapter source assertion | integration + adapter tests |
| B3 | persisted context identity | `sha256Content(JSON.stringify(bundle))` | CanonicalDigest | `domainDigest('LCO:PAID_CONTEXT', 1, bundle)` | YES | ad-hoc digest idiom rule (caught it in CI-red state) | pipeline tests |
| B4 | MCP profile fingerprints | ad-hoc `createHash(sha256(JSON.stringify))` | CanonicalDigest | `domainDigest('LCO:CONSENT', 1, payload)` | YES | same rule | server/consent tests |
| B5 | CLI pipeline budget envelope | second `createBudgetLedger` next to the op-owned ledger | ResolvedPaidOperation | `sharedLedger = op.ledger` on both route families | YES | (kernel API shape; verified by V3 verifier + source) | paid-immutability, runcli |

## Additional latent hazards (documented, deliberately not counted as bypasses)

- `setRuling` (parity headless twin) machine-sets `human_confirmed` — it IS
  the recorded-human-act API (flag twin of the workspace act), zero
  production callers; the CLI review path routes through approvals + kernel
  validation.
- `parityGate`'s approval loader takes the active snapshot from the caller —
  production callers pass kernel-validated loaders with active scope; the
  kernel validator itself enforces project+snapshot scope on every record.
- Pre-bind `structuralIdentity` (pair-level, no binding) remains a legitimate
  KERNEL function for build-time sealing; every trusted CONSUMER path goes
  through the required-binding variants (V4/V5 verifiers checked consumers).

## Guard suite

`src/renew/trust/architecture.test.ts` — 16 rules, all green: write-primitive
scan; transport-constructor ban; MCP no-factory + both-boundaries-via-op;
deprecated-loader ban; command-core active-view; authority digest locality;
no fallback digest idiom; kernel upward-import ban; state cycle-free walk;
ad-hoc digest idiom ban; raw-read bans (project/analysis-store/approvals);
ONE support policy; ONE ruling vocabulary; parseGraphText locality;
journal write-set API (no write-performing commit callbacks). Classification
remains honestly "strong anti-accident tripwire" — the kernel API is the
containment; the guards catch every known bypass class (V5 verifier checked
guard coverage per class).
