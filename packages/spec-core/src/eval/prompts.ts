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

/** Compact map of the SpecBundle top-level shape (full JSON Schema lives in generated/spec-schema.json). */
const BUNDLE_SHAPE = [
  'SpecBundle top-level shape (lco-spec/1.0):',
  '- manifest: { spec_schema:"lco-spec/1.0", spec_version:1, project:{name, mode:"greenfield"|"legacy"}, complexity_profile, evidence_snapshot:{pack_hash:"sha256:<64 hex>", collected_at}, state:"draft"|"blocked" for this pipeline, council_run:{run_id, config_fingerprint}, artifact_hashes:{}, unresolved_count, blocking_count, target_runtime:{platform, stack} }',
  '- intent: { statement, normalized }',
  '- glossary: [{ term, definition }] — define every domain term used in requirement statements',
  '- assumptions: [{ id:"AS-0000", statement, evidence:["E-0000"], impact_if_wrong }]',
  '- evidence: [{ id:"E-0000", kind, source, hash:"sha256:<64 hex>" }]',
  '- requirements: [{ id:"REQ-0000", statement, priority:"must"|"should"|"could", evidence:["E-0000"] (min 1), acceptance_refs:["TST-0000"] (min 1), terms_used }] — ids follow the pattern PREFIX-0000',
  '- decisions: [{ claim_id:"DEC-0000", decision, rationale, evidence, confidence:0..1, impact:"low"|"medium"|"high", assumptions, alternatives, status:"proposed"|"accepted"|"rejected"|"UNRESOLVED" }]',
  '- contracts: [] (interface contracts if any)',
  '- tasks: [{ task_id:"TASK-0000", title, purpose, refs:{requirements, architecture, decisions}, depends_on (task ids only), preconditions (min 1), permitted_scope (min 1), protected, interface_changes, invariants (min 1), instructions, tests (min 1: {kind:"unit"|"integration"|"property"|"e2e", file, cases}), verification (min 1: {command, expect}), acceptance (min 1), rollback, completion_evidence, risk, complexity:"xs"|"s"|"m"|"l" }] — keep depends_on acyclic',
  '- test_files: every distinct tasks[].tests[].file path, listed here (L03 checks this)',
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
 * Council call 1 — classifier. Given the intent and the expected profile,
 * decide whether the request must be blocked. Output: ONLY
 * `{"profile":"p-mini"|"p-standard"|...,"must_be_blocked":boolean}`.
 */
export function classifySingle(intent: string, profile: EvalTaskProfile): string {
  return [
    'ROLE: You are the classifier step of a spec-producing council. You do not write the spec; you only classify the request.',
    intentBlock(intent, profile),
    CLASSIFY_RULES,
    JSON_ONLY,
    'TASK: classify the intent.',
    'Output ONLY this JSON object (nothing else): {"profile": "<complexity profile>", "must_be_blocked": <true|false>}',
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
    intentBlock(intent, profile),
    BUNDLE_SHAPE,
    CLASSIFY_RULES,
    JSON_ONLY,
    'TASK: produce the SpecBundle as a single JSON value. Every requirement must be covered by at least one task (refs.requirements), every task must carry tests and a verification command, and manifest.state must be "draft" or, if you marked anything UNRESOLVED, "blocked".',
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
    intentBlock(intent, profile),
    BUNDLE_SHAPE,
    [
      'PROCEDURE (internal; do not narrate it):',
      '1. Draft your OWN independent proposal for the intent first. Do not anchor on A: where you disagree, your draft must reflect your own reading.',
      '2. Merge your draft with proposal A into ONE final bundle: prefer the option with better justification from the intent; adopt A\'s content only where it is right.',
      '3. Where A and your draft conflict on a high-impact point and the intent\'s evidence cannot resolve the conflict, do NOT pick a winner silently: emit a decision with status "UNRESOLVED" for that point, set manifest.unresolved_count to the number of such decisions, and set manifest.state to "blocked".',
    ].join('\n'),
    `PROPOSAL A (verbatim, from the other council member):`,
    '"""',
    proposalAJson,
    '"""',
    JSON_ONLY,
    'TASK: output ONLY the final merged SpecBundle as a single JSON value.',
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
    intentBlock(intent, profile),
    BUNDLE_SHAPE,
    `PROPOSAL A (verbatim):`,
    '"""',
    proposalAJson,
    '"""',
    `PROPOSAL B (verbatim):`,
    '"""',
    proposalBJson,
    '"""',
    [
      'PROCEDURE (internal; do not narrate it):',
      '1. Prefer the option with better justification from the intent on each contested point.',
      '2. Where A and B conflict on a high-impact point and the intent\'s evidence cannot resolve the conflict, do NOT pick a winner silently: emit a decision with status "UNRESOLVED" for that point, set manifest.unresolved_count to the number of such decisions, and set manifest.state to "blocked".',
    ].join('\n'),
    JSON_ONLY,
    'TASK: output ONLY the final merged SpecBundle as a single JSON value.',
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
    intentBlock(intent, profile),
    BUNDLE_SHAPE,
    CLASSIFY_RULES,
    JSON_ONLY,
    'TASK: apply the classification silently and produce the SpecBundle as a single JSON value. If your classification would set must_be_blocked=true, mark the affected points as UNRESOLVED decisions (manifest.unresolved_count accordingly, manifest.state "blocked") instead of inventing resolutions; otherwise manifest.state is "draft". The final output is ONLY the bundle JSON — no separate classification object.',
  ].join('\n\n');
}
