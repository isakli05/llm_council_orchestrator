# Interactive Clarification Workspace (browser)

`lco generate <dir> --intent "…" --interactive` turns LCO's clarification
mechanism into a browser experience: when generation discovers that a required
**business decision is missing**, LCO refuses to invent it and asks you a
plain-language question in a local web workspace — with suggested options,
instant consequence previews, and room for your own rules — until the
specification is unambiguous, shows you a **Project Behavior Review** you can
annotate with change requests, and writes the spec **only when you explicitly
approve it**.

```bash
lco generate app --intent "I need a B2B ordering platform for textile dealers." --interactive
# → interactive clarification workspace: http://127.0.0.1:<port>/#<session-token>
#   (opens your browser; the URL is printed as the fallback; --no-open suppresses launching)
```

## Why LCO asks instead of guessing

The evidence gate's product principle: an unresolved business decision is
surfaced to the product owner, never silently resolved. A generation that
cannot proceed honestly comes back **blocked**, carrying its unresolved
decisions as questions. The workspace is the interactive rendering of that
contract; the headless `--answers` flow is its scriptable twin.

## The session lifecycle

1. **Questions** — one decision per screen. Suggested options (from the
   bundle's own alternatives) render as selectable cards; selecting one
   immediately shows a business-language **consequence preview** ("With this
   choice…"). Previews come from the bundle's own trade-off wording and one
   validated enrichment pass per round (`lco-clarify/enrich-v1`) — never from
   per-click model calls.
2. **Your own rules** — every question offers **Other — describe your own
   rule**, and you may add an instruction ON TOP of a selected option. Both
   facts are preserved verbatim as user evidence; neither is dropped or
   paraphrased.
3. **Re-check after each round** — submitting answers re-runs generation with
   all accumulated answers wrapped into every prompt (`withUserAnswers`). New
   ambiguity may surface as new questions; an answer that conflicts with other
   evidence comes back flagged as a **contradiction** for you to correct — LCO
   never picks a side.
4. **Project Behavior Review** — once nothing required is unresolved, the
   workspace shows how the application will operate, in business language,
   projected deterministically from the canonical spec (no second LLM pass, no
   second specification). Sections carry stable identities traceable to
   canonical requirement/decision ids.
5. **Change requests** — select any part of the review, click **Change this**,
   describe the change. Collect as many pending changes as you like (edit or
   delete them in the tray), then **Apply N changes** — ONE regeneration for
   the whole set, applied transactionally: stale anchors are rejected by name,
   conflicts surface as new questions instead of being merged, and a failed
   regeneration leaves the previous review intact. Incorporated changes are
   listed on the new review version.
6. **Approval** — **Approve specification** (a distinct, two-step action —
   merely finishing the questionnaire is never approval) writes the artifacts:

```
<dir>/spec/                    the spec/ tree (atomic write — same writer as headless generate)
<dir>/approvals/APPR-0001.json immutable approved revision (digest, requirement
                               inventory, full evidence ledger, parent lineage)
<dir>/clarify-answers.json     your answers in --answers format (headless replay)
```

   After approval you can still request changes; each later approval creates
   revision N+1 with `parentRevision` lineage. Revisions are immutable.

## Security model (local server)

- The workspace server binds **127.0.0.1 only**, on a dynamically allocated
  port. It is never exposed on the LAN.
- The session token is 256-bit, delivered in the URL **fragment** (`#token`) —
  fragments are never sent to any server, never logged, never in `Referer`.
  The browser stores it in `sessionStorage` and sends it as a header on every
  API call. Without it every API request is refused.
- Every request is guarded: `Host` must be this loopback origin (DNS-rebinding
  kill), `Origin` (when present) must match, `Sec-Fetch-Site: cross-site` is
  refused, mutations are POST + JSON only with a 1 MiB ceiling, and GET is
  read-only.
- Pages carry `Content-Security-Policy: default-src 'none'; script-src 'self';
  …` — no remote scripts, no CDNs, works fully offline. All assets ship inside
  the npm package.
- No provider API key, gateway credential, secret configuration value, or
  model-routing detail ever reaches the browser. The API surface exposes only
  product data: questions, your answers' effects, the review, honest usage
  counts.
- Cancelling (the button, closing the terminal, inactivity) writes **nothing**.
  Abandoned sessions cannot corrupt spec artifacts — writes happen only at
  approval, atomically, under the same revision lock as every other LCO writer.

## `--interactive` vs `--answers`

| | `--answers <file>` | `--interactive` |
|---|---|---|
| Where | terminal / CI | browser workspace |
| Rounds | exactly one per invocation | many explicit rounds per session |
| Answer shape | `{"DEC-0004": "text"}` | option + explanation, Other-only, corrections |
| Extras | — | previews, behavior review, change requests, approval baselines |
| Persistence | spec written on a clean re-run (headless `generate` semantics) | spec written only at explicit approval |

Both channels produce the SAME canonical evidence (`UserAnswerForPrompt`,
hash-attributed, wrapped verbatim into every prompt). The workspace even
exports `clarify-answers.json` so a browser session can be replayed headless.
The flags are mutually exclusive (they are two answer channels for the same
loop). Works with every generation configuration — legacy `LCO_LLM_*`,
`--llm-profile`, single, fused council, decomposed council: clarification is a
product concern, not a provider concern.

## Architecture (maintainers)

```
canonical clarification domain        src/clarify/
  model.ts       question views (stable DEC- identity, verbatim options, Layer-0
                 previews), structured answers, serialization → UserAnswerForPrompt
  enrich.ts      lco-clarify/enrich-v1 (one validated pass per round; identity-bound;
                 Layer-0 fallback on any failure — presentation only, never evidence)
  review.ts      deterministic SpecBundle → BehaviorReview projector (stable SEG- ids,
                 content hashes, canonical digest)
  review-changes.ts  lco-clarify/review-changes-v1 (version-bound change sets, stale
                 anchor rejection, one-regeneration transaction)
  approvals.ts   Spec→SpecRevision→Requirement baselines (immutable APPR records,
                 revision lineage, evidence ledger, atomic writers)
  session/       state machine (data-driven transitions; APPROVED is quiescent,
                 re-openable ONLY by a change cycle) + orchestrator (multi-round loop,
                 contradiction surfacing, dependency staleness, session-wide budget)
server (loopback API)                src/server/  (node:http, no framework; token/
                 origin/host/fetch-metadata guards; CSP; exact-name asset allowlist)
browser client                       src/browser-client/ (dependency-free ES modules,
                 compiled by tsconfig.browser.json → dist/browser; no framework,
                 no bundler, no CDN; jsdom-tested + real-Chrome-verified)
CLI                                  src/cli/commands/generate-interactive.ts
                 (--interactive/--no-open; same gates as headless generate)
```

Invariants worth knowing before touching anything:

- **One spec engine.** The browser is a presentation layer. Every answer —
  browser or `--answers` — enters generation through the same
  `withUserAnswers` evidence channel; the review is a pure projection of the
  canonical bundle; change requests re-enter through the pipeline's evidence
  gate, never by editing prose.
- **Prompt lineage is additive.** Generation prompts are untouched (v3 frozen
  by PROD-003; v4 published). New structured traffic carries its own protocol
  ids (`lco-clarify/enrich-v1`, `lco-clarify/review-changes-v1`) and is
  recorded in run/approval attribution.
- **Nothing persists before approval.** Blocked and abandoned sessions write
  nothing; approval artifacts go through the atomic writers under the
  spec-root lock.
- **Previews cannot invent.** Layer-0 previews are verbatim bundle wording;
  enrichment output is adopted only on exact option-identity match and is
  presentation metadata, never evidence.

## Testing

- Domain: `src/clarify/*.test.ts` (options/Other/serialization/contradiction/
  conditionals/rounds/review/change sets/approvals — fake adapters only).
- Session + API security: `src/clarify/session/*.test.ts`, `src/server/http.test.ts`
  (loopback-only bind, token/origin/host/fetch-site guards, GET purity, payload
  validation, path-traversal-proof assets, full lifecycle over real HTTP).
- UI: `src/browser-client/*.test.ts` — jsdom screen tests plus a full-stack test
  booting the REAL app against the REAL server + orchestrator.
- Real browser: the vertical slice is verified in Chromium (CDP-driven) with a
  scripted adapter — see the implementation report under `audit-output/`.
- Packed install: `pnpm --filter ./packages/spec-core smoke:packed` launches
  the workspace from the actual tarball against a loopback mock LLM (offline,
  no paid calls).

## Limitations

- One session per CLI process; the tab must reach the same machine (the
  server is loopback-only — use `--no-open` + the printed URL over SSH port
  forwarding).
- Refresh survives (state is server-owned); a server restart ends the session
  honestly (nothing was written).
- Enrichment previews are optional decoration: if the enrichment call fails,
  questions still carry the bundle's own trade-off wording.
- No Kanban/task/agent dashboard — that is a later milestone.
