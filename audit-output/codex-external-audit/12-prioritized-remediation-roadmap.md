# Prioritized Remediation Roadmap

This is decision sequencing, not an implementation estimate. “Architectural” changes alter cross-command invariants or trust boundaries; “local” changes are contained. Breaking-change potential describes existing specs/automation, not semantic version policy.

## P0 — Before any “usable” or publish-ready claim

| ID | Action | Depends on | Why this order / risk retired | Scope | Breaking potential |
| --- | --- | --- | --- | --- | --- |
| P0-1 | Verify credential revocation, rotate if uncertain, remove both tracked copies, purge history where feasible, quarantine real-API tests | none | Security incident hygiene precedes further release activity | Repo/process | Medium history rewrite |
| P0-2 | Repair shebang/executable bin entry points and add clean packed-install smoke for `lco`/`lco-mcp` | none | Restores the actual distribution boundary; retires PROD-001 | Local + release gate | Low |
| P0-3 | Replace root README/quick start with current product truth; label/archive legacy; remove false badge until remote CI | P0-2 | Users must be directed to a working entry point | Repo/product | Medium documentation/workflow |
| P0-4 | Define one lifecycle invariant validator: legal states/transitions, generation draft+profile, frozen drift rejection, version semantics | none | Prevents further commands/tests from encoding the wrong state model | Architectural | High for permissive specs |
| P0-5 | Make blocking evidence monotonic across classifier, proposals, and retries | P0-4 | Restores the differentiator before using council as default | Architectural | Medium |
| P0-6 | Implement atomic per-root revision writes and locking for init/generate/change/freeze | P0-4 | Prevents confirmed corruption/stranded state before users entrust specs | Architectural persistence | Medium |
| P0-7 | Add semantic closure and executable verification validation: namespace/existence checks, duplicate task rejection, unknown dependency block, structured/validated exit expectation | P0-4 | Ensures frozen/plan/check artifacts are operationally coherent | Architectural/schema | High for existing invalid specs |
| P0-8 | Make every good/generated fixture pass the full compile→lint→freeze→verify→plan→dry-check contract; dry must flag unjudgeable expects | P0-7 | Converts the repaired invariants into a release gate | Tests/local | Low |

## P1 — Before an external pilot

| ID | Action | Depends on | Risk retired | Scope | Breaking potential |
| --- | --- | --- | --- | --- | --- |
| P1-1 | Redesign MCP execution consent: remove default `yes` capability or require server opt-in, frozen+verified preview hash, human client approval, env scrubbing | P0-4, P0-7 | Prompt-injected arbitrary shell execution | Architectural security | High |
| P1-2 | Add safe MCP init/generate/change after mutation/paid consent policies exist | P0-5, P0-6, P1-1 | MCP-first product dead end | Product surface | Medium |
| P1-3 | Publish honest call/request envelopes; add global request/token/time budgets, cancellation, attempt accounting; decide whether single should default | P0-5 | Runaway paid cost and retry latency | Architectural adapter/UX | Medium |
| P1-4 | Replace G4 structural-only claims with intent-specific assertions, invention checks, repeated runs/uncertainty, and complete usage requirement | P0-5, P0-7, P1-3 | Unsupported “council more correct” claim | Eval architecture | Medium |
| P1-5 | Push only repaired code and execute Node 22/24 CI remotely; require scoped status; gate generated diff, clean dist, pack/install | P0-2 through P0-8 | No clean/remote/release evidence | CI/release | Low |
| P1-6 | Archive old orchestrator/MCP and remove legacy from root runnable scripts; make explicit go/no-go extraction list for indexer/discovery/shared modules | P0-3 | Active dead weight, vulnerable dependencies, product ambiguity | Repo architecture | High for legacy users |

## P2 — Before production/commercial use

| ID | Action | Depends on | Risk retired | Scope | Breaking potential |
| --- | --- | --- | --- | --- | --- |
| P2-1 | Add allowed-root/realpath policy, no-follow writes, restrictive evidence modes, redaction, immutable run-addressed evidence | P1-1 | Path escape and secret-bearing evidence | Security architecture | Medium |
| P2-2 | Execute checks in isolated process groups/sandboxes with closed stdin, descendant cleanup, resource ceilings, and clear trust UX | P1-1 | Orphans/resource abuse/workspace compromise | Security architecture | High/platform-specific |
| P2-3 | Bound MCP frames/in-flight work, serialize mutations, honor backpressure, drain/cancel gracefully, complete JSON-RPC conformance | P0-6, P1-1 | Long-running server exhaustion/corruption | MCP architecture | Medium |
| P2-4 | Define schema compatibility and migration/rollback policy for `lco-spec/1.x` | P0-4, P0-7 | Frozen artifact obsolescence | Data architecture | High |
| P2-5 | Define signed/root provenance only if commercial claims require tamper evidence; otherwise keep accidental-drift wording | P0-4 | Misrepresented integrity guarantee | Data/product | Medium |
| P2-6 | Establish release ownership: CI-only publish provenance, rollback, changelog, supported platform/provider matrix, no local dirty publish | P1-5 | Unreproducible commercial releases | Operations | Medium |

## P3 — Hardening

| ID | Action | Depends on | Risk retired | Scope | Breaking potential |
| --- | --- | --- | --- | --- | --- |
| P3-1 | Benchmark 10/100/1,000-task bundles; optimize L12/dedup only against measured thresholds; add input ceilings | P0-7 | Large-spec and hostile-input cliffs | Performance | Low-Medium |
| P3-2 | Add a doctor command for runtime/provider/write/bin/schema checks without secret values | P1-3, P1-5 | Poor field diagnosability | Local UX | Low |
| P3-3 | Split CLI parsing/usage and eval report/rendering; move lint rule type out of engine | stable contracts | Change friction | Maintainability | Low |
| P3-4 | Add coverage thresholds and property/fault testing after missing system boundaries are represented | P0/P1 tests | Regression blind spots | Tests | Low |
| P3-5 | Correct remaining documentation details: maxBuffer class, usage unknown, actual retry/call counts, trust boundaries | P1-3, P2-2 | Operator confusion | Docs | Low |

## P4 — Optional capability work

- Add a documented local/free OpenAI-compatible model recipe only after measuring output quality.
- Implement legacy modernization beyond schema only if a real pilot demands it.
- Consider the full 12-stage council only if the repaired eval proves incremental value within budgets.
- Extract indexer/discovery libraries only from a signed salvage inventory with isolated tests.
- Add a GUI only if CLI/MCP usability research demonstrates need; it is not a current gap.

## Why the order matters

Do not add more council stages, providers, or MCP write tools before lifecycle, persistence, and consent are correct. Otherwise new surfaces multiply the same unsafe invariants. Do not optimize large-spec algorithms before repairing current paid prompt overhead and collecting representative profiles. Do not publish merely because pack dry-run succeeds; the installed executable and end-to-end semantic contract are the release unit.
