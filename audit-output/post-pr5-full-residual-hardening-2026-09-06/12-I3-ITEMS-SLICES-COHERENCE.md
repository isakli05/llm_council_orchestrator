# 12 — I3 (RB3): items-vs-slices cross-check

Investigator: MAO seat A2 (read-only Phase 1). Repro: `/tmp/lco-pr5-hardening/a2/i3_matrix.js`.

## 1. Reproduction (API level, all ten incoherence shapes ACCEPTED)

text divergence (record AAA vs item CCC); whole_file_hash divergence; range
mismatch; path mismatch; node_id mismatch; file_line_count mismatch; fabricated
redactions; slice record with NO matching item (citable, invisible); item with NO
slice record (visible, not citable); item slice_text_hash lying about own text.
Each accepted with identity-totality `true` (both sides digested — no identity
attack, exactly as the residual states). Sharp demo: model-visible item.text
"CCC\nDDD" while record.slice_text_hash = sha256("AAA\nBBB") and
record.whole_file_hash ≠ item.content_hash.

## 2. Census and construction

`rg sealContextBundle` over src: exactly ONE non-test call site —
`renew.ts:628` (~40 others are tests). Sole production `resolveCitation` caller:
`pipeline.ts:542`. renew.ts coherent BY CONSTRUCTION: L631–642 derives `slices`
from `bundle.items.filter(kind==='file_slice').map(...)` — every record field
copied from the corresponding item of the SAME array also passed as `items`
(L643), synchronously; F-9 pre-seal check (L587–600) re-hashes the guarded
workspace against every `item.content_hash`; GraphContextProvider emits at most
one file_slice per path (windows map L220–240), so the seal's dedupe branch
(L166–174) cannot merge conflicting texts in production.

## 3. Ownership decision (per program guidance: do not duplicate semantic authority in two layers)

**(b) — the constructor owns coherence; architecture-guard it.** A primitive-level
cross-check (match each file_slice item to a record with equal (path,
whole_file_hash, start_line, end_line) + `sha256Content(item.text) ===
record.slice_text_hash` — the only non-circular comparisons available) would
break legitimate test semantics (evidence.test.ts L112–118 fixes slices and
varies items; tranche5 L79 / pipeline L180 seal `slices: []` with items;
composition H1 seals deliberately-divergent slices) and add a heuristic matcher
the production site never needs.

## 4. Hardening (PM-approved)

1. Architecture guard test (convention exists: `architecture.test.ts` reads
   production source, L105–266): every non-test `sealContextBundle` call site
   (currently exactly renew.ts:628) must derive `slices` and `items` from the
   same array expression (source-scan assertion); any new non-test seal site
   fails the guard, forcing an explicit owner decision.
2. Documentation line at `evidence.ts:149–161`: the coherence invariant
   (items↔records correspondence) is owned by the CALLER; the seal binds both
   sides independently.
3. Behavioral mirror already exists (`root-invariants.test.ts` sealedFor
   L672–687; pipeline.test.ts L95) — no duplication.

## 5. Mutation proof required

Remove the guard assertion / introduce a second production seal site deriving
slices independently → architecture guard fails.

## 6. Disposition

**ACCEPTED_INVARIANT_BOUNDARY**, mechanically represented: the boundary is
"primitive binds two independent identity lists; coherence belongs to the sole
production constructor" — enforced by the architecture guard + caller-ownership
doc, so it cannot be confused with a defect.

## 7. Risks

Guard test must stay accurate as call sites evolve (fails-loud on new sites is
the intended behavior).
