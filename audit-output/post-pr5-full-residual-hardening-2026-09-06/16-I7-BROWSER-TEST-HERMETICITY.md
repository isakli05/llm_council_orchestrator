# 16 — I7 (RD2): browser-asset test environment dependence

Investigator: MAO seat D (read-only Phase 1). Scratch mirror at
`/tmp/lco-pr5-hardening/d/` (byte-copy, dist deleted, node_modules symlinked;
repo untouched).

## 1. Census (test file → dependency class)

| Test file | Env | Class |
|---|---|---|
| `browser-client/state.test.ts` | node | hermetic |
| `browser-client/api.test.ts` (6) | jsdom | fetch stubbed — hermetic |
| `browser-client/screens.test.ts` (13) | jsdom | pure render — hermetic (pins `.approved-banner` deterministically :254-258) |
| `browser-client/app.test.ts` (2) | jsdom | real loopback server + orchestrator + scripted LLM + real disk writes; **inline ASSETS (:24-27) — dist-INDEPENDENT**; fixed `settle()` sleeps; `waitFor()` exists (:217-224) but used once (:151) |
| `browser-client/app-errors.test.ts` (6) | jsdom | same vertical-slice class; inline ASSETS; `settle(1400)` for the 900 ms poll cadence (app.ts:44-56) |
| `src/server/assets.test.ts` (2) | node | **hard dist/browser read** (assets.ts:19-26 throws when absent) |
| `src/renew/clarify/round-trip.test.ts` (2) | node | **hard dist/browser read** (:95, :180) |
| `src/renew/review-interactive.test.ts` (4; 3 dist-dependent) | node | renew.ts:957-964 dynamic-imports `loadWorkspaceAssets` (its :132, :198, :227; NOT :277) |
| 12 dist-bin spawn tests | node | spawn/require real `dist/cli/index.js` / `dist/mcp/server.js` |

## 2. Facet (a) — no-dist failures REPRODUCED (with attribution correction)

Scratch mirror, `vitest run --no-coverage`: **8 files failed / 183 passed (191);
19 tests failed / 2605 passed; 3 unhandled rejections** — exactly the historical
count. Attribution: **7/19 browser-asset class** (server/assets.test.ts:10,27;
renew/clarify/round-trip.test.ts:66,163; renew/review-interactive.test.ts:132,198,227
— all die at assets.ts:22) + **12/19 dist-bin spawn class** (build/bin-contract.test.ts:25-26;
cli/commands/doctor.test.ts:~625; cli/commands/init-concurrency.test.ts:22;
mcp/server.test.ts:1270,1703,1804,1894; release/prepublish-check.boundary.test.ts:20)
+ 3 unhandled rejections = async cmdRenewReview at renew.ts:964.
**Correction:** prior re-audit report 09:129 attributed all 19 to missing browser
assets — only 7/19 are that class.

Guard (in-repo idiom: `describe.skipIf(!available)` in
graphify-adapter.integration.test.ts:21-24; `it.skipIf` in doctor/change/server tests):

```ts
const DIST_BROWSER = existsSync(join(__dirname, '../../dist/browser/asset-manifest.json'));
if (!DIST_BROWSER) process.stderr.write('[skip] dist/browser absent — run `pnpm build` …\n');
describe.skipIf(!DIST_BROWSER)('loadWorkspaceAssets', () => { … });
```

- assets.test.ts:9 + round-trip.test.ts:65: describe-level guard.
- review-interactive.test.ts: `it.skipIf` on :132/:198/:227 only (:277 stays
  unguarded — passes without dist).
- Bin-spawn 12: same pattern keyed on `dist/cli/index.js` presence.
- skipIf over conditional-import: keeps the failure mode loud when dist SHOULD
  exist (packed/publish paths); stderr notice bounds the invisible-skip risk;
  CI always builds first (`test:coverage` = build && vitest, package.json:30).

## 3. Facet (b) — Node22 jsdom banner flake: genuine fixed-sleep race, NOT dist

- `settle()` (app.test.ts:86-88) is a fixed sleep, not polling; `waitFor()`
  (:217-224, 40×30 ms predicate poll) is the file's real sync primitive but not
  used at the flake site.
- Banner contract: `confirmYes.click()` → app.ts:154 `confirmOpen=false; void
  submitApprove()` → `act()` (app.ts:195-225): busy render → real HTTP POST +
  server-side artifact writes (spec/manifest.json, approvals/APPR-0001.json,
  clarify-answers.json) + response → `render()` → screens-review.ts:37-38
  `.approved-banner`. No exposed promise (`void`, private method); the only
  observable completion signals are the DOM predicate and the disk files. A
  fixed 60 ms window races a loopback round trip + N file writes.
- **Dist overlap: none** — app.test.ts passed in the no-dist run (inline ASSETS);
  the CI failure occurred with build green. Audit trail: PR-integration audit
  04a — Node22 job 101484595540 attempt 1, `querySelector('.approved-banner')` →
  null at app.test.ts:188; byte-identical test on main; sibling Node24 leg and
  prior-day Node22 leg green; attempt-2 rerun green. Also pre-observed on Node24
  (release-condition-closure-round2 00-STATUS.md:27) → runtime-independent
  runner contention.

## 4. Deterministic fix (no sleep inflation)

```ts
confirmYes.click();
const banner = await waitFor(() => document.querySelector('.approved-banner'));
expect(banner?.textContent).toContain('revision 1');
```
(same idiom as :151; banner presence ⇒ response returned ⇒ server files already
written ⇒ :189-193 assertions race-free). Optional same-class hardening:
app.test.ts:175 (`.change-outcomes`), :209 (`.review-title`); app-errors.test.ts:112
`settle(1400)` (lower priority — 1400 > 900 ms cadence + margin).

## 5. Multi-runtime

Node v22.23.2 + v24.14.0 both under `~/.nvm/versions/node/`; switching via PATH
prefix. Real-repo `vitest run src/browser-client/app.test.ts --no-coverage`:
**Node 22 → 2/2 ×4 runs; Node 24 → 2/2 ×3 runs** — flake not reproduced locally
(consistent with runner-contention transient; CI retry-green).

## 6. Mutation proof required

Restore timing dependence (replace `waitFor` with `settle(60)`-equivalent) →
the deterministic predicate contract is gone; the mutation check demonstrates
the flake class by construction (test then depends on a 60 ms window vs real IO).

## 7. Disposition

**CLOSED_BY_TEST_HARDENING** — facet (a) skipIf guards (19 no-dist failures,
zero product impact) + facet (b) waitFor replacement of the racing settle; the
historical CI instance itself is NOT_REPRODUCIBLE_ON_CURRENT_SOURCE locally
(7 clean runs + retry-green CI evidence), so the fix pins the CLASS
deterministically rather than chasing the instance. Attribution correction
(7+12) recorded for the prior re-audit's report 09.

## 8. Risks

(1) skipIf could hide a broken publish build if pretest is bypassed — bounded by
stderr notice + CI build-first. (2) `waitFor` returns null rather than throwing —
genuine regression still fails, same signature after 1.2 s instead of 60 ms
(matches file idiom). (3) Remaining fixed-settle sites stay non-deterministic
until optional hardening lands — observed flake sites are covered.
