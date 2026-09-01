# Browser-Based Business Clarification Workspace — Implementation Report

**Program:** owner spec 2026-09-01 (43 sections + appendices, binding as §N)
**Branch:** `feat/clarification-workspace` (off `feat/multi-provider-council`; not merged; PR/merge is an owner decision)
**Starting HEAD:** `3114de3d31cb41dcff968888e7f9cd17109fc31a` (clean tree; baseline gates: 1460/1460 tests, build clean, coverage ratchet 91/89/96/91, packed smoke PASS)
**Ending HEAD:** this report's commit (18 implementation commits, `dd5497c..51f8cc4` + report)
**Plan:** `plans/2026-09-01-clarification-workspace.md` (committed before any code, §39)

## 1. What was built (the vertical slice, §43)

`lco generate <dir> --intent "…" --interactive` opens a loopback-only browser
workspace that carries a natural-language intent all the way to an approved,
immutable specification baseline:

```
intent → generation blocked by UNRESOLVED business decisions
      → browser questions (suggested options + instant consequence previews)
      → option+explanation / Other-only answers (canonical evidence, verbatim)
      → per-round revalidation through the SAME evidence gate
      → new/contradictory decisions surfaced honestly (never auto-resolved)
      → Project Behavior Review (deterministic projection, stable SEG- ids)
      → multi-change request sets applied as ONE transaction per set
      → spec revalidation; clarification re-opens when a change demands it
      → explicit two-step approval → spec/ + approvals/APPR-NNNN + answers export
```

Everything works with every generation configuration (legacy `LCO_LLM_*`,
`--llm-profile`, single, fused, decomposed) — clarification never touches
provider mechanics.

## 2. Architecture before → after

**Before:** clarification existed as in-memory `ClarificationQuestion[]` on
blocked outcomes + the CLI text renderer + `--answers` (one round per
invocation). No browser surface, no previews, no review, no change requests,
no approval artifacts.

**After (all additive):**

```
canonical clarification domain (src/clarify/) — extends, never duplicates
  model.ts          question views (stable DEC- identity, verbatim options,
                    Layer-0 previews = the bundle's own rejected_because),
                    structured answers, serialization → UserAnswerForPrompt
  enrich.ts         lco-clarify/enrich-v1: ONE validated pass per round; exact
                    option-identity binding; degrade-to-Layer-0 on any failure
  review.ts         SpecBundle → BehaviorReview (pure projection; SEG-* ids,
                    content hashes, canonical digest)
  review-changes.ts version-bound change sets; stale anchor rejection;
                    lco-clarify/review-changes-v1 appendix (no last-change-wins)
  approvals.ts      Spec→SpecRevision→Requirement baselines; immutable APPR
                    records (digest, lineage, evidence ledger); atomic writers
  session/          data-driven state machine + multi-round orchestrator
server (src/server/)  loopback node:http server: token (URL fragment), Host/
                    Origin/Sec-Fetch-Site guards, CSP default-src 'none',
                    exact-name asset allowlist, GET-pure, Zod-validated API
client (src/browser-client/) dependency-free ES modules (own tsc project →
                    dist/browser): wizard, review, pending changes, approval
CLI                 --interactive/--no-open (generate-interactive.ts) with the
                    same gates as headless generate
```

The one pipeline change: `PipelineOptions.extraPromptWrap` (additive; undefined
for every historical caller — single/fused/decomposed prompt bytes unchanged).

## 3. Data contracts

- **Answer (canonical, shared):** `{decisionId, kind: option|other,
  selectedOption?, freeText?}`; serialized verbatim as `Selected: "<option>".
  Additional instruction from the product owner: "<text>"` (or the bare text
  for Other) with sha256 + source (`clarify-web:<session>/roundN`), wrapped by
  the SAME `withUserAnswers` appendix as `--answers`. The answers export
  (`clarify-answers.json`) round-trips through `parseAnswersFile` (tested).
- **Question view:** claimId/question/impact/context/options[option+preview]/
  outcomeUnknowns/dependsOn/firstSeenRound/status
  (open|answered|contradicted|stale).
- **Review:** sections (business-language keys) of segments
  `{segmentId: SEG-<canonical-id>, body, sourceRefs, contentHash}`; review
  version + canonical spec digest.
- **Change set:** `{reviewVersion, changes[]: {changeId, segmentId,
  selectedText, segmentContentHash, instruction}}`; server re-validates every
  anchor (409 on stale, named), substring verbatim-ness, instruction bounds.
- **Approval record:** `{schema: lco-approval/1, specId, revision,
  parentRevision?, approvedAt, digest, bundle (full), evidence: {answers,
  changes}, promptProtocol, rounds, requirements/decisions inventories}` —
  written atomically at approval only.
- **API:** `GET /api/<sid>/session`; `POST …/round/apply {answers}`;
  `POST …/review/apply-changes {reviewVersion, changes}`;
  `POST …/approve {pendingChangeIds}`; `POST …/cancel`. Every payload Zod-
  validated server-side; the client's TS types mirror the wire contract.

## 4. Protocol lineage (§29)

Frozen PROD-003 bytes untouched — `git diff 3114de3..HEAD -- prompts.ts
constraints.ts score.ts` is EMPTY and `verifyCorpusLock()` passes. Existing
protocol strings unchanged (`lco-prompts/v3`, `v3+answers-v1`, `v4`). Two NEW
attributable lineages: `lco-clarify/enrich-v1` (presentation-only previews)
and `lco-clarify/review-changes-v1` (change-request evidence appendix); both
recorded in snapshot/approval attribution (e.g. the verified run carried
`lco-prompts/v3+answers-v1+lco-clarify/review-changes-v1`).

## 5. Security design (§24)

Loopback-only bind (127.0.0.1, dynamic port — test-enforced), 256-bit session
token delivered in the URL fragment (never sent to any server; timing-safe
header comparison), Host allowlist (DNS-rebinding kill), Origin check when
present, `Sec-Fetch-Site: cross-site` refused, mutations POST+JSON with 1 MiB
ceiling, GET pure, exact-name static allowlist (no traversal), CSP
`default-src 'none'` + nosniff + no-referrer + CORP/COOP, API no-store,
unknown sessions/ops 404, malformed request targets 400. No
credential-shaped material reaches responses, assets, events, or logs
(tested). Cancelling (button, inactivity sweep, SIGINT at the CLI boundary)
writes nothing.

## 6. Frontend stack decision (§25)

No framework, no bundler, no CDN, zero new runtime dependencies: strict TS
compiled by `tsconfig.browser.json` to native ES modules under `dist/browser`,
served offline from a build-time manifest. jsdom (devDependency) enables DOM
tests without a browser download. Trade-off documented: more explicit DOM code
(~1.4k lines client) in exchange for a zero-dependency graph consistent with
the package's zod-only runtime. Design: notary-grade decision workspace
(cool paper/ink/evergreen stamp accent; serif decision text; honest progress
language; answer-stamp signature; near-zero motion, reduced-motion honored).

## 7. Compatibility results (§32)

- Full suite 1602/1602 (baseline 1460 + 142 new, incl. review regressions); no existing assertion loosened (one progress-count expectation updated to the corrected honest semantics, documented in the commit).
- Headless `generate` byte-compatible: `generate.test.ts` 46/46 after the
  shared-runtime extraction (one documented ordering refinement: no-clobber
  now precedes profile-disagreement — both exit 2; found by the suite itself).
- `--answers` semantics unchanged; `--interactive` + `--answers` rejected as
  two answer channels.
- MCP/doctor/models/accounting untouched; corpus lock verifies; schema
  export/publish gates untouched.

## 8. Verification evidence

- **Domain/contract:** `src/clarify/*.test.ts` — options, option+text,
  Other-only, empty rejection, identity stability, contradiction surfacing,
  dependency staleness, round accumulation, projector determinism, change-set
  validation (stale 409s, substring enforcement), approval lineage, answers
  round-trip.
- **Session + API/security:** `src/clarify/session/*.test.ts`,
  `src/server/http.test.ts` — loopback-only bind, token/origin/host/
  fetch-site guards, GET purity, malformed payload rejection, path-traversal
  404s, no-credential responses, inactivity shutdown, HEAD, full lifecycle
  over real HTTP (fake adapter).
- **UI:** jsdom screens + a FULL-STACK test (real app booted against the real
  server + orchestrator: questions→preview→answers→review→change set→approval
  artifacts on disk) + app error paths (expired link, unreachable+retry,
  validation focus/alert, approve-decline, cancel, busy polling).
- **Real browser:** the vertical slice verified in Chromium (CDP-driven)
  against a scripted-adapter session — enriched instant previews, keyboard
  arrow selection, pending-change flow, review v2 with the canonical
  requirement text updated, two-step approval, artifacts verified on disk.
  One a11y finding fixed during the run (preview described per-option →
  scoped to the selected radio).
- **Packed install:** `smoke:packed` now also launches the workspace from the
  installed tarball against a loopback mock OpenAI endpoint (offline, zero
  paid calls): URL/token fragment, HTML+CSP, packed JS asset MIME, session API
  question, clean cancel (exit 1, nothing written) — PASS.
- **Gates:** build clean; lint (both tsconfigs) clean; coverage
  93.53/89.26/96.16/93.53 vs ratchet 91/89/96/91; corpus lock OK.
- **Audit:** `pnpm audit --prod` CLEAN (runtime deps still zod-only — no new
  runtime dependency). Dev-toolchain advisories (19, incl. a vitest<3.2.6
  critical requiring `vitest --ui`, which this repo never runs) all route
  through the PRE-EXISTING vitest 2.x toolchain; the jsdom devDependency adds
  none. Upgrading the vitest major is an owner toolchain decision, deferred.

## 9. Independent adversarial review (§40)

A fresh-context reviewer (general-purpose agent, read-only, no memory of the
implementation) attacked all 15 checklist areas over the full range
(`92196ba..HEAD`): raw-socket Host/Origin/Sec-Fetch probes, path-traversal
experiments, token-transport inspection, evidence round-trip experiments
against a running server with fake adapters, frozen-file diffs, the full test
suite, and the packed smoke.

**Verified clean:** loopback binding + all request guards (DNS-rebinding,
CSRF, token timing-safe compare, GET purity), asset traversal surface, token
never in URLs-to-server/HTML/assets/logs/events, no credential-shaped data in
any response, evidence integrity end-to-end (option+instruction and
Other-only preserved verbatim through DOM→API→serialization→appendix→approval
record; answers export round-trips `parseAnswersFile`), enrichment never
persisted as evidence, identity/staleness of change anchors, prompt lineage
(frozen diff empty; protocol attribution composes correctly), backward
compatibility, packaging, a11y structure. Its exact checks: 1595/1595 tests
(at review time), corpus lock PASS, frozen diff empty, packed smoke PASS.

## 10. Findings and fixes

Eight findings — all fixed in `51f8cc4` with regression tests (suite
1595 → 1602; coverage ratchet held; packed smoke re-run PASS):

| id | severity | defect (confirmed unless noted) | fix |
|----|----------|--------------------------------|-----|
| F1 | High | re-approval swapped the live spec/ BEFORE writing the approval record; a mid-transaction failure left unapproved content in spec/ with no rollback (reproduced with an unwritable approvals dir) | write order reversed — approval record + answers export first, spec/ swap LAST (the commit point); rollback restores prior answers bytes and removes anything this call created; regression test reproduces the failure and asserts the live spec keeps the approved revision |
| F2 | Medium | conditional staleness dead end-to-end: records were merged from pre-enrichment views (dependsOn always []), and stale answers kept riding prompts as evidence | enrichment runs BEFORE record merging (declared dependencies reach records); stale/contradicted answers are excluded from the evidence set until re-confirmed; regression test drives the full dependOn → change → stale → prompt-without-stale-evidence path |
| F3 | Medium | approve() ignored unanswered decisions: a partial answer set + clean re-run approved a spec whose decision was resolved without user evidence | a clean round now marks non-resurfaced questions superseded (§13 moot — the human-reviewed bundle is the resolution; records keep history and reopen on resurfacing); approve() additionally refuses while any open/stale/contradicted record remains (the state table's own guard); the approval ledger contains only real answers (regression asserts it) |
| F4 | Low | an instruction typed BEFORE selecting an option was dropped on the option click (client draft layer) | the live textarea is the source of truth when an option is selected (jsdom regression) |
| F5 | Low | `questions.presented` emitted twice per first-round transition | single emission per transition (counted regression) |
| F6 | Low | snapshots at FINAL_REVIEW/APPROVED still carried stale question views and misleading remaining counts | views cleared on clean rounds; progress = answered∪superseded resolved, live-views remaining |
| F7 | Low | glossary-anchored change requests always reported 'incorporated' (vacuous empty-refs check) | outcomes for ref-less segments judged against the NEW review's stable segment ids |
| F8 | Low | cancel() bypassed the transition table; APPROVED→CANCELLED absent | cancel routed through canTransition; APPROVED/CLARIFICATION_COMPLETE/SPEC_READY → CANCELLED rows added |

Post-fix gates: **1602/1602 tests**, coverage 93.41/89.31/96.16/93.41
(thresholds 91/89/96/91), lint clean (both tsconfigs), corpus lock PASS,
packed smoke PASS.

## 11. Paid-call / publish attestations

- **No paid calls:** every automated test, smoke phase, and browser
  verification used fake adapters or a loopback mock endpoint; no request left
  the machine to any LLM provider.
- **No publish / no merge:** nothing pushed, published, or merged; the branch
  awaits the owner's decision.

## 12. Owner live-smoke procedure (authorized separately, not run)

1. `pnpm --filter ./packages/spec-core build`
2. `export LCO_LLM_BASE_URL=… LCO_LLM_API_KEY=… LCO_LLM_MODEL=…` (or prepare
   `lco.config.json` + `--llm-profile <name>`)
3. `node packages/spec-core/dist/cli/index.js generate ./my-project --intent
   "<real intent>" --interactive` (add `--variant council` / `--llm-profile`
   as desired)
4. In the opened browser: answer with suggested options or your own rules,
   read the behavior review, try a change request, approve.
5. Inspect `my-project/spec/`, `my-project/approvals/APPR-0001.json`,
   `my-project/clarify-answers.json`; Ctrl-C mid-session proves nothing is
   written.
6. Optional replay: `lco generate ./replay --intent "<same>" --answers
   my-project/clarify-answers.json` (headless, same evidence).

## 13. Known limitations / deferred

- One session per CLI process; the browser must reach the same machine
  (loopback-only; use `--no-open` + the printed URL over SSH forwarding).
- Enrichment previews degrade to bundle wording if the enrichment call fails
  (by design — answering is never blocked).
- The review's per-segment text selection uses the segment-level Change-this
  affordance with the browser selection captured when present (a floating
  selection popover remains future polish).
- No Kanban/task/agent dashboard (§33) — deliberately out of scope; the
  approval baseline contract (stable spec/requirement identity, immutable
  revisions, traceability) is the only future-execution groundwork laid.
