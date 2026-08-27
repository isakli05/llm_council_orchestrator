import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { EvalTaskProfile } from './tasks';

/**
 * Prompt templates for the evidence-gate pipeline (Task 10 binding).
 *
 * Four templates per the plan — `classifySingle`, `propose`, `proposeB`,
 * `judgeMerge` — plus `classifyAndProposeSingle`, the merged template the
 * 'single' variant binds to ("classifySingle+propose merged template: one
 * prompt doing classification+proposal").
 *
 * Shared rules baked into every template:
 * - JSON-only output matching the SpecBundle (or classifier) shape.
 * - "do not include hidden chain-of-thought; provide only concise auditable
 *   rationale fields per the schema" — rationale lives in schema fields
 *   (decisions[].rationale, assumptions[].impact_if_wrong, risk.note), never
 *   in free prose.
 * - For ambiguous or conflicting intents: mark the affected items
 *   status 'UNRESOLVED' (and set manifest.unresolved_count) rather than
 *   inventing a resolution. The lint layer (L08) then blocks the run.
 *
 * Templates are pure string functions of their arguments: no clock, no
 * randomness, no environment. The runner prepends the run context (nowIso).
 */

/** Output rules shared by every template (kept textually identical). */
const JSON_ONLY = [
  'OUTPUT CONTRACT (binding):',
  '- Output ONLY a single JSON value. No prose before or after, no markdown, no code fences, no explanations.',
  '- Reasoning stays internal: do not include hidden chain-of-thought; provide only concise auditable rationale fields per the schema (e.g. decisions[].rationale, assumptions[].impact_if_wrong, tasks[].risk.note).',
  '- Never invent facts, requirements, evidence, or decisions to fill a gap. If the intent is ambiguous or self-contradictory on a point that materially affects the design, mark the affected item(s) UNRESOLVED instead: set decisions[].status to "UNRESOLVED", set manifest.unresolved_count to the number of unresolved items, and set manifest.state to "blocked".',
].join('\n');

/**
 * The EXACT machine-generated JSON Schema of SpecBundle, embedded verbatim
 * (live attempt-2 fix): the first live run's greenfield outputs failed
 * schema validation 24/24 because the previous hand-written shape summary
 * disagreed with the real schema in five nested-shape details
 * (alternatives/interface_changes/completion_evidence as strings, contract
 * field names, evidence.kind enum). Embedding the same artifact the
 * validator uses makes prompt↔schema drift structurally impossible.
 * Loaded fail-closed at module init; resolves identically from src/ (vitest)
 * and dist/ (node) — both sit two levels below the package root.
 */
const SCHEMA_TEXT: string = readFileSync(
  path.resolve(__dirname, '../../generated/spec-schema.json'),
  'utf8',
);

const SCHEMA_BLOCK = [
  'The EXACT JSON Schema of the required output (authoritative — follow it field by field, including every nested object shape; the validator enforces this schema literally):',
  '"""',
  SCHEMA_TEXT,
  '"""',
].join('\n');

/** Pitfall warnings distilled from the observed live failure modes (belt + suspenders on top of the schema). */
const PITFALLS = [
  'SHAPE PITFALLS (all observed as real failure modes — do not repeat them):',
  '- decisions[].alternatives items are OBJECTS {"option": string, "rejected_because": string} — never plain strings.',
  '- tasks[].interface_changes items are OBJECTS {"symbol": string, "file": string}; tasks[].completion_evidence is an OBJECT {"required": string[]} — never plain strings.',
  '- contracts[] items are OBJECTS with ALL of: id, kind ("openapi"|"json-schema"|"ts-signature"|"grpc"), symbol, definition.',
  '- evidence[].kind must be exactly one of: user_input, code, runtime, doc, constraint.',
  '- Every id is PREFIX-0000 with FOUR digits, and the PREFIX must match the field it sits in: E- for evidence (every evidence[] reference), DEC- for decisions, REQ- (or OPS-/UX-/ARC-/DAT-/SEC-/LGC-) for requirements and tasks[].refs.requirements, TASK- for task_id/depends_on, TST- for tests[].id and requirements[].acceptance_refs, CON- for contracts, AS- for assumptions. A right-prefix-for-the-wrong-field id (a DEC- id in an evidence list) is REJECTED by the schema.',
  '- Give every tasks[].tests[] entry an id: "TST-0001" style, unique across the whole bundle — requirements[].acceptance_refs resolve against those test ids, and an unresolvable acceptance_ref is a lint error (L13).',
  '- tasks[].verification[].expect MUST state the expected exit code as "exit N" (e.g. "exit 0", "exit 1") — the first "exit N" in the string is the contract the checker judges. Prose like "exit code 0, all cases pass" is unparseable: it is a lint error (L14) and it can never be judged or executed.',
  '- manifest.evidence_snapshot.pack_hash must look like "sha256:" followed by exactly 64 hex characters.',
].join('\n');

/** Classification guidance shared by classifySingle and the merged single-variant template. */
const CLASSIFY_RULES = [
  'CLASSIFICATION RULES:',
  '- Determine whether the intent is sufficiently specified to design against, or is ambiguous / internally conflicting.',
  '- It is ambiguous if a material design decision is left open (storage, auth scheme, scale, retention, platform, rules) AND the intent provides no way to resolve it.',
  '- It is conflicting if it demands two mutually exclusive outcomes at once (e.g. keep everything forever AND erase everything on request).',
].join('\n');

const intentBlock = (intent: string, profile: EvalTaskProfile): string =>
  [`USER INTENT (verbatim):`, '"""', intent, '"""', `EXPECTED COMPLEXITY PROFILE: ${profile}`].join('\n');

/**
 * PROD-003 / RESIDUAL PROD-003: constraint fidelity is a SCORED, GROUNDED
 * property — every concrete constraint the intent names must be carried into
 * the requirement statement that states it, and that requirement must be
 * traceable to a task with a related test case and a judgeable exit-code
 * verification. Mere presence of the keyword anywhere in the bundle (a
 * glossary entry, an instruction list) does not score.
 */
const CONSTRAINT_FIDELITY = [
  'CONSTRAINT FIDELITY (scored, grounded):',
  '- Every concrete constraint the user intent names — commands, flags, technologies, formats, ports, quotas, limits, status codes, proper nouns — must appear VERBATIM inside the REQUIREMENT STATEMENT that states it, not merely mentioned in glossary, decisions, or task instructions.',
  '- Each such requirement must be referenced by at least one task (refs.requirements), and that task must carry a test case naming the constraint and a verification entry whose expect states an exit code ("exit 0" style).',
  '- Numeric bounds keep the intent\'s exact values ("at most 3", "under 300 ms"): do not re-scale, round, or widen them.',
  '- Do not paraphrase named values away ("PostgreSQL" is not "a relational database"); do not invent first-class entities, behaviors, or architecture the intent never mentioned or explicitly ruled out.',
].join('\n');

/**
 * Council call 1 — classifier. Given the intent and the expected profile,
 * decide whether the request must be blocked. Output: ONLY
 * `{"profile":"p-mini"|"p-standard"|...,"must_be_blocked":boolean}`.
 *
 * BACK-001: the prompt teaches the model that must_be_blocked=true is FINAL
 * (the runner enforces monotonicity in code — a true verdict blocks the run
 * regardless of later outputs; this copy only keeps the model aligned with it).
 */
export function classifySingle(intent: string, profile: EvalTaskProfile): string {
  return [
    'ROLE: You are the classifier step of a spec-producing council. You do not write the spec; you only classify the request.',
    intentBlock(intent, profile),
    CLASSIFY_RULES,
    JSON_ONLY,
    'TASK: classify the intent.',
    'Output ONLY this JSON object (nothing else): {"profile": "<complexity profile>", "must_be_blocked": <true|false>}',
    'must_be_blocked=true is FINAL: the pipeline will block this request and no later output can overrule the verdict. Set it exactly when the classification rules require it — do not defer the decision to later council members.',
  ].join('\n\n');
}

/**
 * Council call 2 — independent proposal. Produces a complete draft SpecBundle
 * for the intent. Also serves as the proposal half of the merged single-variant
 * prompt (see classifyAndProposeSingle).
 */
export function propose(intent: string, profile: EvalTaskProfile): string {
  return [
    'ROLE: You are a spec author. Turn the user intent into a complete, evidence-gated SpecBundle.',
    SCHEMA_BLOCK,
    PITFALLS,
    CLASSIFY_RULES,
    JSON_ONLY,
    CONSTRAINT_FIDELITY,
    'TASK: produce the SpecBundle as a single JSON value. Every requirement must be covered by at least one task (refs.requirements), every task must carry tests and a verification command, and manifest.state must be "draft" or, if you marked anything UNRESOLVED, "blocked".',
    intentBlock(intent, profile),
  ].join('\n\n');
}

/**
 * Council call 3 — proposal B + judge/merge fused into one call (the binding's
 * "proposeB+judge variant"). Receives proposal A verbatim; must FIRST draft its
 * own independent proposal (not a copy of A), THEN merge A and its own view
 * into the final bundle. High-impact conflicts that evidence cannot resolve are
 * emitted as decisions with status "UNRESOLVED" and counted in
 * manifest.unresolved_count (the lint gate then blocks the run — by design).
 *
 * Ordering (Task 10 review amendment): the "draft your OWN independent
 * proposal first / do not anchor on A" instruction comes BEFORE the embedded
 * proposal A JSON — instruction first, then A — so the anti-anchoring rule is
 * already in force when the model starts reading A.
 */
export function proposeB(
  intent: string,
  profile: EvalTaskProfile,
  proposalAJson: string,
): string {
  return [
    'ROLE: You are the second council member acting as merger and judge. Another member already produced proposal A; you will draft independently, then merge.',
    SCHEMA_BLOCK,
    PITFALLS,
    [
      'PROCEDURE (internal; do not narrate it):',
      '1. Draft your OWN independent proposal for the intent first. Do not anchor on A: where you disagree, your draft must reflect your own reading.',
      '2. Merge your draft with proposal A into ONE final bundle: prefer the option with better justification from the intent; adopt A\'s content only where it is right.',
      '3. Where A and your draft conflict on a high-impact point and the intent\'s evidence cannot resolve the conflict, do NOT pick a winner silently: emit a decision with status "UNRESOLVED" for that point, set manifest.unresolved_count to the number of such decisions, and set manifest.state to "blocked".',
    ].join('\n'),
    JSON_ONLY,
    CONSTRAINT_FIDELITY,
    'TASK: output ONLY the final merged SpecBundle as a single JSON value.',
    intentBlock(intent, profile),
    `PROPOSAL A (verbatim, from the other council member):`,
    '"""',
    proposalAJson,
    '"""',
  ].join('\n\n');
}

/**
 * Degraded-merger fallback (audit BACK-008): proposal A failed bundle schema
 * validation twice, so its unvalidated text is WITHHELD from the merger —
 * unvalidated prose must never reach the judge. The second member produces the
 * final bundle alone from its own independent proposal; the run is marked
 * councilDegraded downstream. Same schema, pitfalls, and invention ban as
 * proposeB; the only structural difference is the absent PROPOSAL A block.
 */
export function proposeBDegraded(intent: string, profile: EvalTaskProfile): string {
  return [
    'ROLE: You are the second council member acting as merger and judge. The council leg is DEGRADED: the other member\'s proposal failed schema validation twice, and its unvalidated output is withheld from you. You will produce the final bundle alone, from your own independent proposal.',
    SCHEMA_BLOCK,
    PITFALLS,
    [
      'PROCEDURE (internal; do not narrate it):',
      '1. Draft your OWN independent proposal for the intent. There is nothing to merge — your draft IS the final bundle.',
      '2. Where the intent is ambiguous or self-conflicting on a high-impact point and its evidence cannot resolve it, do NOT pick a winner silently: emit a decision with status "UNRESOLVED" for that point, set manifest.unresolved_count to the number of such decisions, and set manifest.state to "blocked".',
    ].join('\n'),
    JSON_ONLY,
    CONSTRAINT_FIDELITY,
    'TASK: output ONLY the final SpecBundle as a single JSON value.',
    intentBlock(intent, profile),
  ].join('\n\n');
}

/**
 * Judge/merge template for the decomposed council flow (proposal A and
 * proposal B each produced in their own call). Not used by the 3-call binding
 * above — proposeB fuses B-drafting and judging into one call — but exported
 * because the council report and any 4-call variant consume exactly this
 * template: both proposals verbatim, one final merged bundle, unresolved
 * conflicts as "UNRESOLVED" decisions.
 */
export function judgeMerge(
  intent: string,
  profile: EvalTaskProfile,
  proposalAJson: string,
  proposalBJson: string,
): string {
  return [
    'ROLE: You are the judge of a two-member council. Merge the two proposals into one final SpecBundle.',
    SCHEMA_BLOCK,
    PITFALLS,
    [
      'PROCEDURE (internal; do not narrate it):',
      '1. Prefer the option with better justification from the intent on each contested point.',
      '2. Where A and B conflict on a high-impact point and the intent\'s evidence cannot resolve the conflict, do NOT pick a winner silently: emit a decision with status "UNRESOLVED" for that point, set manifest.unresolved_count to the number of such decisions, and set manifest.state to "blocked".',
    ].join('\n'),
    JSON_ONLY,
    CONSTRAINT_FIDELITY,
    'TASK: output ONLY the final merged SpecBundle as a single JSON value.',
    intentBlock(intent, profile),
    `PROPOSAL A (verbatim):`,
    '"""',
    proposalAJson,
    '"""',
    `PROPOSAL B (verbatim):`,
    '"""',
    proposalBJson,
    '"""',
  ].join('\n\n');
}

/**
 * Single-variant prompt ("classifySingle+propose merged template"): one call
 * doing classification and proposal. The classification is applied INSIDE the
 * bundle (unresolved points → UNRESOLVED decisions, state "blocked"), and the
 * final output is the bundle JSON alone.
 */
export function classifyAndProposeSingle(intent: string, profile: EvalTaskProfile): string {
  return [
    'ROLE: You are a one-shot spec pipeline: classify the request, then turn it into a complete, evidence-gated SpecBundle.',
    SCHEMA_BLOCK,
    PITFALLS,
    CLASSIFY_RULES,
    JSON_ONLY,
    CONSTRAINT_FIDELITY,
    'TASK: apply the classification silently and produce the SpecBundle as a single JSON value. If your classification would set must_be_blocked=true, mark the affected points as UNRESOLVED decisions (manifest.unresolved_count accordingly, manifest.state "blocked") instead of inventing resolutions; otherwise manifest.state is "draft". The final output is ONLY the bundle JSON — no separate classification object.',
    intentBlock(intent, profile),
  ].join('\n\n');
}
