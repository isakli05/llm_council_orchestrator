# Browser-Based Business Clarification Workspace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Execution ruling (owner spec §43 + repo precedent):** INLINE execution by the orchestrator agent. The main agent owns architecture, shared contracts, integration, invariant preservation, and final testing; sub-agents only for bounded isolated work (here: one independent fresh-context adversarial review at the end, owner §40).

**Goal:** Turn LCO's existing business-language clarification mechanism into an interactive, loopback-only browser workspace: natural-language intent → missing decisions detected → browser questionnaire (suggested options + instant consequence previews + option/Other/custom answers) → multi-round re-evaluation → deterministic Project Behavior Review → multi-change review requests → explicit approval with immutable revision baselines — while the CLI/`--answers` headless path, every existing gate, the frozen PROD-003 record, and the fail-closed security posture remain byte-for-byte intact.

**Architecture:** The browser is NOT a second spec engine. A canonical clarification domain module (`src/clarify/`) extends the existing `ClarificationQuestion`/`UserAnswerForPrompt` contracts; both surfaces (CLI `--answers`, browser workspace) serialize into the SAME `UserAnswerForPrompt` evidence wrapped by the SAME `withUserAnswers` appendix, so every answer — CLI or browser — enters generation through the identical validated path (`runPipeline`). A server-owned session state machine (`src/clarify/session/`) orchestrates explicit multi-round re-evaluation in-process; a loopback HTTP server (`src/server/`) serves Zod-validated JSON API + offline static assets; a dependency-free TypeScript client (native ES modules, no framework, no bundler) renders the wizard. The final review is a DETERMINISTIC projection of the canonical `SpecBundle` (no second LLM pass, no second specification), with stable segment identities bound to canonical ids; review change sets apply as one transaction through a new attributed prompt appendix and a full pipeline re-run; approval writes `spec/` through the existing atomic writer plus immutable approval-baseline records.

**Tech Stack:** TypeScript 5 strict; zod ^3.22 (still the sole RUNTIME dependency); vitest ^2 + jsdom (devDeps; DOM-level UI tests); node:http (loopback server; no server framework); native ES modules compiled by a second tsc project (no bundler, no CDN, no React). Node >= 22.

**Spec:** The owner's 43-section prompt + appendices (2026-09-01), binding as §N. Baseline recorded at `3114de3d31cb41dcff968888e7f9cd17109fc31a` (branch `feat/multi-provider-council`, clean tree, all gates green: 1460/1460 tests in 91 files, build clean; coverage ratchet 91/89/96/91 enforced by CI).

## Global Constraints (binding, from owner spec + repo rules)

- **PROD-003 immutability:** `src/eval/prompts.ts`, `src/eval/constraints.ts`, `src/eval/score.ts` are FROZEN (`corpus-lock.json`). NEVER edit their bytes. `verifyCorpusLock()` must pass after all changes. No new council-advantage claim anywhere.
- **No paid calls / no publish / no merge:** no live provider request during implementation; no `npm publish`; no merge/push. All automated tests use fake adapters. Owner-gated live smoke documented, not run.
- **Fail-closed everything; unknown ≠ 0; secrets never serialized, logged, or sent to the browser.**
- **Blocked generation writes NOTHING to `spec/`.** Interactive sessions persist only at explicit approval (§31/§21).
- **Historical behavior compatibility:** `lco generate` without `--interactive`, the `--answers` file format, `runPipeline` signatures/semantics for single/fused/decomposed, MCP digests, doctor, models, accounting, prompt lineage (`lco-prompts/v3`, `v3+answers-v1`, `v4`) — unchanged. Browser clarification is strictly additive.
- **New prompt lineage is attributable:** enrichment/change-request appendices carry their own protocol ids (`lco-clarify/enrich-v1`, `lco-clarify/review-changes-v1`); existing protocol strings never change meaning. Old outcomes stay interpretable; corpus locks keep verifying.
- **Loopback only:** bind `127.0.0.1`, dynamic port, session token never in an HTTP-sent URL, Origin/Host/`Sec-Fetch-Site` checks, CSP `default-src 'none'` + `script-src 'self'` etc., no GET mutations, Zod validation on every payload, unknown session ids rejected.
- **Coverage ratchet ≥ 91/89/96/91** (statements/branches/functions/lines); never lower.
- **No Kanban/task/agent dashboard in this milestone** (§33): only the clarification workspace + future-shell-friendly module boundaries.
- Commands scoped: `pnpm --filter ./packages/spec-core …` from repo root.

## Current architecture (baseline facts, verified)

- **Pipeline:** `runPipeline(task, variant, llm|plan, nowIso, budget?, opts?)` (`src/eval/runner.ts`) gates LLM output: JSON → `SpecBundleSchema` → lifecycle (fresh draft v1) → `lintBundle` → retry policy (schema + non-L08 lint; L08 is a legitimate terminal state). Blocked outcomes MAY carry in-memory `clarifications: ClarificationQuestion[]` — distilled ONLY from a schema+lifecycle-valid bundle blocked by per-decision L08 (`clarificationsFromBundle`). NEVER persisted.
- **Clarification question shape today:** `{ claimId, question, impact, alternatives: [{option, rejected_because}][] }` — the bundle decision's own wording; `alternatives` are plain-language options whose `rejected_because` explains the trade-off in behavior terms (v4 `CLARIFY_RULES`).
- **Answers:** `parseAnswersFile` (`src/eval/answers.ts`) — `{ "DEC-0000": "text" }`, ≤50 entries, ≤4000 chars each, DEC-regex keys, sha256 evidence hash; `withUserAnswers` (`src/eval/prompts-v4.ts`) wraps EVERY prompt of the run verbatim with binding rules (an answer resolves ONLY its named decision; un-answered UNRESOLVED decisions must survive; new gaps may surface as NEW UNRESOLVED). One CLI invocation = one round; protocol `lco-prompts/v3+answers-v1` on single/fused.
- **CLI:** `args.ts` pure parser (USAGE single source; `--help` per command extracted from it); `index.ts` boundary (env/file reads, clock injection, exit codes 0/1/2); `commands/generate.ts` owns defaults (`single`, `p-standard`), no-clobber precheck, budget resolution, plan construction, blocked-run rendering.
- **Persistence:** `writeSpecDir` (`commands/write-spec.ts`) — no-clobber, `acquireSpecRootLock`, `createDirAtomically` (staged dir + one rename). Lifecycle (`compiler/lifecycle.ts`): generate→draft v1; freeze draft→frozen; change frozen→draft (+1). `compileSpecDir` reads FIXED section files; extra files under spec/ are ignored.
- **Schemas:** strict zod; id namespaces DEC-/REQ-(+OPS/UX/ARC/DAT/SEC/LGC)/TASK-/TST-/E-/CON-/AS- are already stable machine-readable identities; `TraceEdge` kinds exist.
- **Multi-provider:** `LlmPlan.forRole(role)` → `{adapter, identity}`; provider factories on one transport; `lco.config.json` stores env-var NAMES only.
- **Tests/build:** vitest, coverage include `src/**` (excludes `**/*.test.ts` + export-json-schema.ts); build = `tsc -p tsconfig.json` + bins + schema export; `files: ["dist", …]`; packed smoke proves bins from the real tarball.

## Proposed architecture

```
                        CANONICAL LCO CORE (unchanged gates)
  ┌──────────────────────────────────────────────────────────────────────┐
  │ runPipeline (single|fused|decomposed) · SpecBundleSchema · lint ·    │
  │ lifecycle · withUserAnswers · LlmPlan/forRole · budget ledger        │
  └───────────────▲──────────────────────────────────▲───────────────────┘
                  │ UserAnswerForPrompt[] (SAME evidence shape)          │
  ┌───────────────┴────────────────┐   ┌─────────────┴──────────────────┐
  │ CLI renderer (today)           │   │ src/clarify/ + src/server/     │
  │  --answers file → parseAnswers │   │  session orchestrator          │
  │  one invocation = one round    │   │  (multi-round, in-process)     │
  └────────────────────────────────┘   └───────────────▲────────────────┘
                                                       │ loopback JSON API + static assets
                                         ┌─────────────┴────────────────┐
                                         │ Browser client (ES modules)  │
                                         │ wizard · review · changes    │
                                         └──────────────────────────────┘
```

**Trust boundaries:** browser = untrusted presentation; server = authoritative state + the ONLY writer; core = only through validated contracts. The client never sees provider config, env values, filesystem paths beyond the project name, or the bundle's raw engineering fields it does not need (projector emits a curated view).

### Canonical clarification domain (extends, never duplicates)

`src/clarify/model.ts` — pure, no DOM, no node APIs:

```ts
/** Presentation-ready question distilled from a blocked round + enrichment. */
export interface ClarificationQuestionView {
  claimId: string;                       // DEC-NNNN — the stable identity
  question: string;                      // business-language (bundle decision text)
  impact: 'low'|'medium'|'high';         // exists for UI weighting only, never shown as a label
  context?: string;                      // enrichment: short business context (optional)
  options: ClarificationOptionView[];    // from bundle alternatives (+ enrichment preview)
  outcomeUnknowns?: string[];            // enrichment: consequences this does NOT determine
  dependsOn: string[];                   // enrichment-declared dependencies (validated claimIds)
  firstSeenRound: number;                // orchestrator provenance
  status: 'open'|'answered'|'contradicted'|'stale';
}
export interface ClarificationOptionView {
  option: string;                        // VERBATIM bundle alternative text (identity anchor)
  preview: { source: 'bundle'|'enriched'; text: string }; // Layer-0 deterministic | Layer-1 validated
}
/** The canonical structured answer — one representation for CLI + browser. */
export interface ClarificationAnswer {
  decisionId: string;
  kind: 'option'|'other';
  selectedOption?: string;               // required iff kind='option'; must EXACTLY match an offered option
  freeText?: string;                     // required iff kind='other'; ≤4000 chars; optional addition for 'option'
}
export function answerToUserAnswer(a, sourceLabel): UserAnswerForPrompt;  // deterministic serialization
```

- **Layer-0 preview (free, always, zero hallucination):** `preview = { source:'bundle', text: option.rejected_because }` — verbatim bundle wording of the trade-off ("what happens then"), rendered under a neutral "What this choice means" label.
- **Layer-1 enrichment (interactive sessions only, ONE completion per round):** new protocol `lco-clarify/enrich-v1` (`src/clarify/enrich.ts`). Input: the blocked round's validated UNRESOLVED decisions + intent. Output (strict zod): per claimId `{ context?, options: [{option, outcomePreview}], unknowns?, dependsOn? }`. VALIDATION BINDS IDENTITY: enriched `option` strings must EXACTLY equal the bundle's alternative texts (mismatch → that option keeps Layer-0; enrichment is per-option additive); `claimId`/`dependsOn` must reference the round's own question set; lengths capped. Enrichment failure/malformed output → degrade to Layer-0 silently-with-note (previews never block answering). Enrichment text is PRESENTATION metadata — never user evidence, never persisted into spec artifacts.
- **Answer serialization (canonical for both surfaces):**
  - `option` + text → `Selected: "<option>". Additional instruction from the product owner: "<text>"`
  - `option` only → `Selected: "<option>".`
  - `other` → `<text>` verbatim.
  Hash over the serialized string (same rule as `parseAnswersFile`); source label `clarify-web:<sessionId>/round<N>` vs `answers:<file>`. `parseAnswersFile` maps to `kind:'other'` trivially — both surfaces share `answerToUserAnswer`.
- **Validation rule (§9/§10):** an answer is valid iff (`kind:'option'` AND selectedOption exactly matches a currently-offered option) OR (`kind:'other'` AND trimmed freeText ≥ 10 chars); either kind may add freeText ≤ 4000. Empty/whitespace/unknown-option → rejected (server-side always).

### Session orchestrator + state machine (server-owned)

`src/clarify/session/state.ts` (pure transition table + guards, tested as data) and `orchestrator.ts`:

```
STARTING → SPEC_READY ────────────────────────────────┐ (first pass already clean)
STARTING → CLARIFICATION_REQUIRED ⇄ ANSWER_APPLYING → REVALIDATING
  REVALIDATING → CLARIFICATION_REQUIRED (new/remaining questions)   [round N+1]
  REVALIDATING → CLARIFICATION_COMPLETE → FINAL_REVIEW
  FINAL_REVIEW → CHANGE_APPLYING → REVALIDATING (change reopened clarification)
  FINAL_REVIEW → CHANGE_APPLYING → FINAL_REVIEW (v2, changes incorporated)
  FINAL_REVIEW → APPROVED   (explicit action ONLY; never on mere completion)
  any → CANCELLED | FAILED (terminal; NOTHING written)
```

- ANSWER_EDITING/CHANGE_REQUEST_EDITING are client-local drafting states; the server stores only submitted artifacts (§22 note).
- Round = ONE `runPipeline` call with the ACCUMULATED answers (`withUserAnswers` sees the full set each time). Rounds are bounded: `MAX_CLARIFY_ROUNDS = 10` → FAILED (honest non-convergence message; nothing written). Every round is explicit user action — the loop NEVER answers with an LLM (§14).
- Outcomes per round: `spec` (lint re-checked) → review path; `blocked`+clarifications → next round (NEW claimIds = "newly discovered"; answered-but-resurfaced claimId → status `contradicted` — surfaced as a conflict requiring correction, never silently re-asked); `blocked` without clarifications / thrown infra error → FAILED with reasons (no guessed continuation).
- Dependency invalidation: when a submitted answer CHANGES a previously-applied answer X, stored answers whose questions enrichment declared `dependsOn: [X]` become `stale` (must be re-confirmed); identity tracked via claimIds.
- Usage accounting: every completion (generation + enrichment) charges the SAME run ledger per round; the session aggregates per-round usage honestly (unknown stays unknown) and the terminal prints totals.
- Change-set application (see below) re-enters at CHANGE_APPLYING → runs one pipeline regeneration → routes like a round.

### Final review projector (deterministic)

`src/clarify/review.ts` — pure `SpecBundle → BehaviorReview`; NO LLM, NO second spec:

```ts
interface ReviewSegment { segmentId: string; sectionKey: string; title?: string;
  body: string; sourceRefs: string[]; contentHash: string; }   // sha256(body)
interface BehaviorReview { reviewVersion: number; specDigest: string;
  sections: { key: string; title: string; segments: ReviewSegment[] }[]; }
```

Sections render only when non-empty (§17): purpose (intent), actors/terms (glossary), primary workflows & behavior (REQ), user experience (UX), access & security (SEC), data (DAT), operational rules (OPS), business logic (LGC), structure (ARC — business-tone title), business rules & approvals (accepted decisions), explicitly excluded (rejected alternatives), remaining assumptions (AS + impact_if_wrong), planned work summary (task titles). `segmentId` derives from canonical ids (`SEG-REQ-0001`, `SEG-DEC-0003`, `SEG-AS-0001`, `SEG-TERM-<hash8(term)>`, `SEG-PURPOSE`, `SEG-TASK-0007`) so identity never depends on render order/position (§19). `contentHash` per segment anchors stale-edit detection.

### Review change sets (appendix: multi-change transactions)

Client accumulates pending changes (any number); ONE explicit `Apply N changes` submits a `ReviewChangeSet { reviewVersion, changes: [{changeId, segmentId, selectedText, segmentContentHash, instruction}] }`. Server, transactionally:
1. Validate: reviewVersion == current (else 409, whole set); every segment exists AND `segmentContentHash` matches (else 409 naming the stale change); `selectedText` is a verbatim substring of that segment's body; instructions non-empty ≤ 4000. Duplicate identical instructions on one segment rejected. No "last change wins" — contradictory instructions are NOT auto-merged (§12/appendix): the regeneration prompt requires conflicts to surface as NEW UNRESOLVED decisions → CLARIFICATION_REQUIRED presents them in business language.
2. Record the change set (immutable session history entry; each change preserved verbatim as explicit user evidence).
3. ONE regeneration: full pipeline re-run with intent + ALL accumulated answers + change-instruction appendix (`lco-clarify/review-changes-v1`, `withReviewChangeRequests` in `src/clarify/review-changes.ts`) instructing: treat as binding user_input evidence; preserve canonical ids of unchanged requirements/decisions; a changed requirement MAY keep its id only if semantics continue; genuinely new requirements take NEW ids.
4. `spec` → new candidate bundle → review vN+1 → response lists per-change outcome: `incorporated` (targeted canonical ids survive / evolved), `replaced` (id vanished — named), or — if blocked+clarifications — `needs_decisions` + the new questions.
5. Any failure → review stays at vN, change set stays PENDING, nothing written (transactional; §30).
No regeneration happens per `Change this` — only on explicit set submission (appendix; also §36 cost).

### Approval baselines (future execution readiness)

`src/clarify/approvals.ts` — approval is explicit (`POST /api/approve`; available only in FINAL_REVIEW with zero pending changes and zero open questions). On approve:
1. `writeSpecDir(dir, bundle, nowIso)` — the existing atomic writer (first approval; session pre-checked no-clobber at start).
2. Immutable approval record `<dir>/approvals/APPR-<NNNN>.json` (atomic single-file write under the spec-root lock, mode 0600): `{ schema, specId (stable: sha256 over project name+intent), revision, parentRevision?, approvedAt, digest (sha256 over canonical bundle JSON), bundle (FULL approved content), evidence: [every user answer + change instruction with source+hash], promptProtocol, rounds, requirementInventory: [{id, contentHash}], decisionInventory, session: {id} }`. Later approve-again in the same session writes APPR-N+1 with `parentRevision` and swaps `spec/` atomically under the lock — historical revisions stay immutable and attributable.
3. Answers export `<dir>/clarify-answers.json` in the EXACT `--answers` format (headless reproducibility of the evidence set).
Requirements/decisions already carry stable ids (namespace schemas) — the baseline record binds them with content digests; traceability chain `intent → decision → answer/evidence → requirement → revision` is preserved via the existing bundle cross-refs + `sourceRefs` + `evidence` ledger (§ appendix). NO task-execution relationships implemented.

### Local server + API (loopback security boundary)

`src/server/http.ts` on `node:http` (no framework):
- Binds `127.0.0.1:0` (dynamic port; NEVER `0.0.0.0`; family checked). One session per server process.
- Session token: 256-bit `crypto.randomBytes`, delivered via URL FRAGMENT (`http://127.0.0.1:<port>/#<token>`) — fragments are never sent to the server, never in server logs, never in Referer; client strips it (history.replaceState), keeps it in sessionStorage, sends `x-lco-session` on every call. All mutating endpoints require the exact token. (§24: no secrets in URLs — satisfied in the only sense that matters for HTTP: the credential never travels in any request.)
- Request guards (defense in depth, ALL of): `Host` must be `127.0.0.1:<port>`/`localhost:<port>` (DNS-rebinding kill); `Origin` when present must match the session origin; `Sec-Fetch-Site` when present must be `same-origin` (reject `cross-site` always); `Content-Type: application/json` + body ≤ 1 MiB on POST; Zod-parse every payload (unknown keys rejected); unknown session id → 404. GET endpoints are pure reads; ALL mutations are POST. Static assets served from an EXACT-NAME allowlist manifest (no path traversal, no filesystem-derived paths), `text/javascript`/`text/css`/`text/html` MIMEs, immutable cache headers for assets, `no-store` for API.
- Headers on every response: `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin`.
- API: `GET /api/session` (state, progress: resolved/remaining counts, review?, pending-change echo — never secrets); `POST /api/answers` (submit draft answers for the round; per-answer validation, stored server-side); `POST /api/round/apply` (validate all open questions answered → ANSWER_APPLYING → pipeline round → REVALIDATING → resulting state); `POST /api/review/apply-changes` (change-set transaction); `POST /api/approve`; `POST /api/cancel`. Long-running operations are asynchronous: applying endpoints return immediately with state + the client polls `GET /api/session` (keeps the API simple, avoids WebSocket infra; §36 no paid calls for presentation).
- Inactivity shutdown: no successful authenticated request for 30 min → CANCELLED (nothing written), server closes. SIGINT → CANCELLED. Completion (approve/cancel/fail) → server closes; CLI prints the terminal summary.
- Browser open: `xdg-open`/platform equivalents, `--no-open` to suppress; URL ALWAYS printed to the terminal as fallback (§5).

### Browser client (stack decision + tradeoff)

`src/browser-client/` (excluded from the main tsconfig; compiled by `tsconfig.browser.json` → `dist/browser/`; ES2022 modules + DOM lib; `.js`-suffixed relative imports). **No framework, no bundler, no npm deps** — tradeoff documented: the UI is a bounded wizard/review surface (~2k lines) where native ES modules + a small typed state-store/render layer keep the npm dependency graph at zero (React+esbuild would add dev-only weight and a build pipeline the repo does not otherwise have; the repo's runtime deps stay zod-only). Screens: welcome/why-asking → question cards (fieldset/legend, radio cards, Other, instant preview, additional-instruction textarea, progress "N decisions resolved · M remaining") → applying/revalidating states → final review (sections, selectable segments, pending-changes tray, Apply N changes) → change-conflict/clarification loops → approved. All chrome strings centralized in `strings.ts` (i18n-ready separation from LLM/user content; Unicode end-to-end; no silent translation). Accessibility: semantic landmarks, fieldset/legend per question, labels tied to controls, `aria-describedby` previews, `aria-live` progress/errors, visible focus, full keyboard path (tested), 44px+ targets, AA contrast, responsive single column. Offline: assets served from the package; zero external requests (CSP enforces).

### CLI integration

- `lco generate <dir> --intent … --interactive [--no-open]` (naming per owner §3 examples + repo kebab style; explicit opt-in; headless default UNCHANGED). `--interactive` + `--answers` = usage error (two answer channels). `--interactive` requires a TTY-less-safe fallback: it works over SSH/no-browser via printed URL (`--no-open` implied behavior documented).
- `src/cli/commands/generate-interactive.ts` (`cmdGenerateInteractive`): reuses generate.ts's exact gates (intent preflight, profile/variant agreement, no-clobber precheck, budget resolution, fail-closed LLM/plan construction — extracted shared helpers, no behavior change to cmdGenerate) then runs orchestrator + server; returns the same `{code, output}` contract; exit codes 0 approved / 1 blocked-unresolved-at-cancel or failure / 2 usage-infra.
- USAGE/README/docs updated (incl. the currently-missing `--answers` line in USAGE's generate block — noticed during orientation; fixing is additive docs).

## Persistence & lifecycle guarantees (§31)

- Nothing is written to disk before approval except: nothing. Session state (rounds, answers, reviews, change sets) is in-memory; a crash/abandon leaves at most the process's own memory. `spec/` appears ONLY via the approval write (atomic); approval records + answers export appear only with it.
- Refresh survivability (in-tab): client re-fetches full session state from `GET /api/session` (server is authoritative; sessionStorage token survives reload). Server restart = session gone = honest failure page (no zombie artifacts).
- Cleanup: server close releases the port; no temp files; approval records are the only additions and are deliberate user-visible artifacts.

## Compatibility strategy (§32)

All existing commands/flags/env semantics unchanged; `parseArgs` additions are new optional flags only; MCP digests untouched (no MCP surface changes in this milestone); doctor gains NO new required checks (interactive is optional); accounting semantics extended only by session-level aggregation in interactive output; packed npm artifact gains `dist/browser/` (files list already covers `dist`).

## Test matrix (§34)

**Domain/contract (`src/clarify/*.test.ts`):** question-view distillation (identity preserved, options verbatim); Layer-0 preview = verbatim rejected_because; enrichment validation (option-identity mismatch → Layer-0 fallback; unknown claimId/dependsOn rejected; length caps; malformed JSON → degrade); answer validation (option, option+text, other-only ≥10 chars, empty rejected, unknown option rejected, 4000 cap); serialization preserves BOTH option and instruction verbatim; hash/source correctness; round accumulation (all answers in every round's prompts — asserted via prompt-capturing fake adapter); new-vs-carried question classification; answered-id resurfaced → contradicted (not silent); dependsOn staleness invalidation on answer change; multi-round convergence (fake adapter scripts); non-convergence cap → FAILED; review projection (sections, stable segment ids, contentHash, empty-section omission, digest determinism); change-set validation (stale reviewVersion → 409 path, stale segment hash named, substring enforcement, duplicate rejection); change application (one regeneration for the set; ids preserved when unchanged; conflicts → new UNRESOLVED → clarification reopen; failure → transactional rollback); approval record shape (revision lineage, digests, evidence ledger, parent chain on second approval); answers export equals `--answers` format (parseAnswersFile round-trips it).

**API/security (`src/server/http.test.ts` + session e2e):** binds 127.0.0.1 only (assert address family/port; assert `0.0.0.0` never used — code review + test that server.address() is loopback); token required on every mutation; wrong/missing token 401/403; unknown session 404; bad Origin rejected; cross-site Sec-Fetch-Site rejected; wrong Host rejected; GET performs no mutation (state snapshot compare); malformed JSON/oversized body/unknown keys rejected; no path traversal on assets (allowlist only); responses carry CSP/nosniff/no-referrer/CORP headers; API responses contain NO env/config/secret material (snapshot keys); loopback reachability from the test via real HTTP.

**UI (`src/browser-client/*.test.ts`, jsdom environment docblock):** loads and renders from session JSON; progress counts; option selection → instant preview swap (no network); option+explanation preserved in submit payload; Other-only path; validation messages accessible (`aria-live`, `aria-describedby`); prev/next + keyboard-only full path; conditional questions appear after dependency answered; revalidation states; final review renders sections; selection → pending change tray (add/edit/delete/count); stale-anchor rejection surfaced; apply-changes → regenerated review diff; approve disabled until legal; approval confirmation state.

**Real-browser verification (development-time, recorded in the report):** full happy-path + a keyboard-only pass + the change-request loop driven in Chromium via the chrome-devtools MCP against the real server with a fake adapter (screenshots archived under `audit-output/clarification-workspace/`). Automated CI stays jsdom+HTTP (no browser download added to CI — documented decision).

**Regression:** the full existing 1460-test suite green; corpus lock verifies; coverage ratchet enforced; packed smoke extended.

## Packaging

`files` already ships `dist`; browser assets build into `dist/browser/`. `smoke:packed` extended: after install from the tarball, start the interactive server with a mock LLM env (`--no-open`), assert the port serves the workspace HTML + assets + a session handshake, then cancel cleanly — proving offline asset resolution from the packed artifact (§35).

## Explicit non-goals (§33 + appendix scope)

No task/agent/Kanban/cost dashboards; no coding-agent integrations; no WebSocket/SSE push; no multi-user/collaborative editing; no remote/LAN serving; no new server framework/database; no MCP changes; no changes to frozen PROD-003 bytes or existing protocol semantics; no live provider calls; no publish/merge.

---

## Task waves

### Wave A — canonical domain (pure, fully unit-tested before any server/UI)
- **A1** `src/clarify/model.ts` + tests: question-view distillation from blocked outcome (`ClarificationQuestion[]` + bundle → views), Layer-0 previews, answer types + validation + serialization + hashing, new/carried/contradicted/stale classification, dependency invalidation. Commit.
- **A2** `src/clarify/enrich.ts` + tests: prompt builder, strict output schema, identity-bound validation, degradation paths; protocol id constant `lco-clarify/enrich-v1`. Commit.
- **A3** `src/clarify/review.ts` + tests: projector, sections, stable ids, hashes, digest. Commit.
- **A4** `src/clarify/review-changes.ts` + tests: `withReviewChangeRequests` appendix (protocol `lco-clarify/review-changes-v1`), change-set record types + validation logic. Commit.
- **A5** `src/clarify/approvals.ts` + tests: baseline records, digests, lineage, specId, atomic writer (uses storage/revision), answers export. Commit.

### Wave B — orchestration
- **B1** `src/clarify/session/state.ts` + tests: transition table/guards as data. Commit.
- **B2** `src/clarify/session/orchestrator.ts` + tests: round loop with fake adapters (converge, re-ask, contradict, cap-out, infra-fail), accumulation, enrichment invocation + accounting, change-set transaction, approval write. Commit.

### Wave C — server + API + security
- **C1** `src/server/tokens.ts` (token/fragment URL helpers) + tests. Commit.
- **C2** `src/server/http.ts` + `src/server/assets.ts` + `http.test.ts`: loopback bind, guards, headers, routes wired to orchestrator, asset allowlist, lifecycle (inactivity, close). Commit.

### Wave D — client
- **D1** tsconfig.browser.json + build wiring + copy step; strings.ts; api client; state store. Commit.
- **D2** Questionnaire screens + styles + jsdom tests. Commit.
- **D3** Review screen + pending changes + change flow + jsdom tests. Commit.
- **D4** Approval/terminal/failure screens; full keyboard path test. Commit.

### Wave E — CLI + packaging + docs
- **E1** args.ts `--interactive/--no-open` + USAGE + mutual exclusion; `generate-interactive.ts` (shared helpers extracted from generate.ts with zero behavior change); index.ts dispatch + SIGINT; tests. Commit.
- **E2** packed smoke extension; `pnpm build` wiring for browser assets; verify tarball offline launch. Commit.
- **E3** README(s) + `docs/clarification-workspace.md` (user + maintainer); CLI help examples. Commit.

### Wave F — verification + audit
- **F1** Full suite + coverage + lint + corpus lock + smoke; real-Chrome E2E via MCP (fake adapter) with archived evidence. Commit fixes.
- **F2** Independent fresh-context adversarial review (subagent, §40 checklist) → fix real findings + regression tests → record. Commit.
- **F3** Final report `audit-output/clarification-workspace/IMPLEMENTATION-REPORT-2026-09-01.md`; graphify update; clean tree. Commit.

## Self-review notes (spec coverage)

Owner §1–§43 + appendices are each addressed by: canonical model (§3/§7/§8/§9/§10/§16), previews Layer-0/1 (§11), contradiction routing (§12), conditional deps (§13), multi-round (§14), progress honesty (§15), review projection (§17), selection→change (§18/§19), reopen (§20), approval (§21/§31), state machine (§22), API (§23), security (§24), stack decision (§25), UX direction (§26), a11y (§27), i18n separation (§28), protocol lineage (§29/§11), failure states (§30), compat (§32), non-goals (§33), tests (§34), packaging (§35), cost (§36), observability (§37), docs (§38), plan=this file (§39), review (§40/F2), DoD (§41), deliverables (§42/F3), discipline (§43/F1), multi-change appendix (change sets), traceability appendix (approval baselines; no task exec).
