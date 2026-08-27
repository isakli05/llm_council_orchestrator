# Maintainability and Technical Debt

## Six-month modification assessment

Spec-core alone is reasonably maintainable: 53 production TypeScript files, cohesive directories, strict TypeScript, one production dependency, deterministic cores, and broad tests. Safe modification is harder than the file count suggests because semantic invariants are distributed among schema, lint, prompts, commands, README, generated schema, and fixtures.

Largest production files are `cli/index.ts` (419 lines), `eval/report.ts` (392), `mcp/server.ts` (341), `eval/tasks/index.ts` (298), and `check/runner.ts` (250). Only CLI exceeds the prior plan's 400-line split rule; decomposition is P3, not a readiness blocker.

The repository as a whole is not maintainable as one product. Legacy code, plans, audits, reports, generated coverage, test outputs, and two incompatible product narratives create high search and ownership noise. Keeping ~50.6k lines of known-broken legacy code in the active root hurts unless extraction owners and retirement criteria exist.

## Prior-fix verification

At least five historical fixes were checked against current behavior:

| Past fix/decision | Result | Assessment |
| --- | --- | --- |
| Zod unknown-key stripping fixed across schema surfaces (`5e8d89f`) | Current bundle/nested objects are strict; generated schema aligned | Root-cause fix for product bundle surfaces; classifier intentionally remains non-strict |
| Task patch strictness (`03e160d`) then top-level changeset strictness (`00e7fe8`) | Both levels reject typos; merged task revalidated | Second fix closed a real missed layer; current result sound |
| CI name filter no-op fixed to path filter (`f0698ea`) | Workflow uses `./packages/spec-core`; local sequence ran | Sound local fix; still no remote execution |
| Verify-on-draft framing (`9a2485e`) | Runtime draft verify short-circuits exit 1 before hashes | Sound behavior/documentation fix |
| MCP stdout purity (`eab38f9`, final docs `4faa7af`) | Real stdio output was JSON-only; stderr diagnostics separated | Sound; retain |
| Trailing-space shadowing documented (`9a2485e` context) | Runtime confirmed verify exit 0 | Honest limitation, not a fix; acceptable only if semantic hashing remains explicit |
| “Publish-ready npm package” (`1373876`) | Pack contents narrow, but bins lack shebang and exit 126 | Surface fix without end-to-end release validation |
| “Council exactly 3 calls” product plan (`2026-08-25`, Task 1) | Happy path is 3; retries allow 6 completions/24 attempts | Test/documentation pinned a happy-path implementation, not the cost contract |
| Change write-error handling (`a15610e`) | Error returns exit 2, but runtime left a partial non-retryable draft | Failure is reported, not recovered; root cause remains |

## Documentation truth and archaeology

Package README is unusually candid about mock vs live, canonical hashing, L03, classifier strictness, and descendants. It is nevertheless wrong about fixed call counts, draft generation guarantee, first help command, maxBuffer status, and current-product discoverability at root.

Prior `audit-output/evidence-index.md` was explicitly frozen before spec-core and remains historically useful; it should not be read as current product status. The migration roadmap correctly required root README/CI/secret/legacy cleanup before a usable claim, but the productization plan prohibited root changes, creating the current split-brain.

## Unknown unknowns pass

The final unprompted pass identified these additional risks:

1. **Installed-bin failure** was absent from the requested known limitations and escaped 576 tests.
2. **Re-freeze laundering** turns drift detection into a one-command acknowledgment without version/rationale.
3. **Mock good fixtures are not check-ready**, so “good” means only schema/lint, not end-to-end usability.
4. **Root tests can make live paid calls** because a tracked key feeds a real API test.
5. **Concurrent init can physically corrupt JSON**, not merely last-writer-win.
6. **Missing usage can make G4 cost pass at zero**, a false evidence condition.

These are precisely the kinds of cross-boundary defects that module-local tests miss.

## Findings

ARCH-001/002, TEST-001 through TEST-004, PROD-002/003/005, DATA-003.
