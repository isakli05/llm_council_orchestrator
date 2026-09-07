# 03 — Residual Dependency Map and Workstream Classification

## Lane derivation (from source overlap)

| Lane | Findings | Source surface | Parallel-safe? |
|---|---|---|---|
| A config/canonicalization | NF-1, NF-2, NF-3, NF-4, G-2 | llm-config.ts, models.ts | investigation parallel; implementation sequential (one file cluster) |
| B evidence/recovery | E-1, E-2, E-3, F-I5-1, F-I5-2, G-1 | trust/state.ts abort/recovery machinery | investigation parallel; implementation sequential (single function cluster) |
| C probe/trust boundary | F-L6-1, M-2, C-1, C-2, B-1, B-2 | renew.ts, architecture.test.ts, consent seam | pins additive; boundaries documented |
| D durable boundary + docs | D-F-01, D-OBS-1..4, M-1, H-3, F-L7-1 | state.ts I6 block, store-records.ts, committed reports | D-F-01 shared state.ts with lane B → sequenced after B |
| E browser/CI | H-1, H-2 (+3 same-class new sites) | browser-client tests, dist-guarded suites | independent files |

## Dependency graph (executed)

```
ledger → investigation wave → adjudication
  → impl 1 config (68d3504)      [NF-1, NF-2, +models third site]
  → impl 2 evidence (3f7e732)    [E-1, E-3, INFO-A arm, E-2 doc + S8/S8b/S9/S10]
  → impl 3 boundary (b05b54a)    [D-F-01 — same file as impl 2, sequenced]
  → impl 4 pins (753db8e)        [F-L6-1, M-2, B-2, M-1]
  → impl 5 browser (616f4ed)     [H-1 + structural double-boot fix + 2 server MASKs]
  → impl 6 CI (fb71c14)          [H-2: stdio spy + 8 canaries + doctor notice]
  → impl 7 docs (053ce3f)        [H-3, F-L7-1, D-OBS-1 comment]
  → composition (fb30d6d)        [C1–C4 + C5 cell]
  → S2a pin (1e73633)            [ownership-conditioning catcher, from mutation design]
  → mutations (disposable worktree, no commits) → gates → Node22 matrix → verifiers
```

## Authority domains (unchanged owners)

Filesystem ownership: FilesystemCapability/O_EXCL create/ownership-conditioned remove
(state.ts). Durable state: applyStateMutation reader-first boundary (I6). Identity:
ContextBundle seal (I2/I4). Consent: routeBinding preimage + total gate (L2).
Canonicalization: null-prototype container (L1). Recovery: C-matrix (S5-H-01).
No new trust primitives introduced by this program.
