import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { EvalTaskProfile } from './tasks';

/**
 * PROMPT PROTOCOL v4 — the DECOMPOSED-council prompts (owner spec §2/§8/§10/
 * §12/§19). This file is a SEPARATE lineage from src/eval/prompts.ts, whose
 * bytes are FROZEN by the PROD-003 corpus lock (the closed live experiment
 * ran under them; its record must stay verifiable). v4 exists so product
 * prompts can evolve without touching the frozen v3 bytes:
 *
 *   v3 (frozen, PROD-003): classifySingle / propose / proposeB(+fused judge) /
 *       proposeBDegraded / classifyAndProposeSingle  — prompts.ts, immutable
 *   v4 (this file): decomposed classifier → independent proposal A ∥
 *       adversarial proposal B → judge, plain-language clarification wording,
 *       and the user-answers appendix
 *
 * Run metadata records PROMPT_PROTOCOL_VERSION so a future experiment can
 * freeze exactly this version and old results can never be silently re-scored
 * under new prompts.
 *
 * Templates are pure string functions: no clock, no randomness, no env.
 */

export const PROMPT_PROTOCOL_VERSION = 'lco-prompts/v4';

// --- shared blocks (v4-owned copies; v3 stays untouched) ------------------------

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

const JSON_ONLY = [
  'OUTPUT CONTRACT (binding):',
  '- Output ONLY a single JSON value. No prose before or after, no markdown, no code fences, no explanations.',
  '- Reasoning stays internal: do not include hidden chain-of-thought; provide only concise auditable rationale fields per the schema (e.g. decisions[].rationale, assumptions[].impact_if_wrong, tasks[].risk.note).',
  '- Never invent facts, requirements, evidence, or decisions to fill a gap. If the intent is ambiguous or self-contradictory on a point that materially affects the design, mark the affected item(s) UNRESOLVED instead: set decisions[].status to "UNRESOLVED", set manifest.unresolved_count to the number of unresolved items, and set manifest.state to "blocked".',
].join('\n');

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
  '- LIFECYCLE CONTRACT: manifest.state MUST be exactly "draft" — or "blocked" ONLY if you marked UNRESOLVED items. NEVER "reviewed", "frozen", or any other value: generation produces a FRESH DRAFT only; review and freezing are separate LATER steps the engine performs, never you.',
  '- manifest.artifact_hashes MUST be the empty object {} — never compute, guess, or fill any hash (the engine pins hashes at freeze time). manifest.frozen_at MUST be absent. A bundle that arrives pre-hashed or pre-frozen is rejected before anything else is looked at.',
  '- When the intent does not name a technology and you must ASSUME a stack for verification executability, prefer the newest current-stable/LTS line you know (e.g. the newest Node.js LTS), name the exact version, and record the choice as an assumption with impact_if_wrong — never an EOL or near-EOL line.',
].join('\n');

const CONSTRAINT_FIDELITY = [
  'CONSTRAINT FIDELITY (scored, grounded):',
  '- Every concrete constraint the user intent names — commands, flags, technologies, formats, ports, quotas, limits, status codes, proper nouns — must appear VERBATIM inside the REQUIREMENT STATEMENT that states it, not merely mentioned in glossary, decisions, or task instructions.',
  '- Each such requirement must be referenced by at least one task (refs.requirements), and that task must carry a test case naming the constraint and a verification entry whose expect states an exit code ("exit 0" style).',
  "- Numeric bounds keep the intent's exact values (\"at most 3\", \"under 300 ms\"): do not re-scale, round, or widen them.",
  '- Do not paraphrase named values away ("PostgreSQL" is not "a relational database"); do not invent first-class entities, behaviors, or architecture the intent never mentioned or explicitly ruled out.',
].join('\n');

/**
 * §10 — the product differentiator: unresolved decisions surface as DOMAIN/
 * BEHAVIOR questions a non-engineer product owner can actually answer.
 * Internal engineering mechanics live in rationale/assumptions instead.
 */
const CLARIFY_RULES = [
  'CLARIFICATION WORDING (binding — a real product owner reads your unresolved decisions):',
  '- Every decision you mark UNRESOLVED must phrase its `decision` text as a QUESTION ABOUT APPLICATION BEHAVIOR the product owner can understand — a question a non-engineer can answer in their own words.',
  '- Its `alternatives` are the answer options: plain-language options with rejected_because explaining the trade-off in behavior terms (who can do what, and what happens then).',
  '- Keep the deep technical reasoning in `rationale` — that field is for engineers; the question itself must never require engineering vocabulary.',
  '- NEVER ask the product owner to choose implementation mechanics a competent engineering team can safely decide (database isolation levels, queue technology, retry/backoff algorithms, framework internals, locking primitives, serialization formats, cache invalidation implementations) UNLESS the product requirement genuinely depends on that choice — in that case record it as an accepted engineering assumption with impact_if_wrong instead, and reserve UNRESOLVED for the BEHAVIOR behind it.',
  '- Good example: "If two customers try to complete the remaining quantity for the same fabric at the same time, what should the system do — accept both orders, or give priority to the first confirmed one?" — Bad example: "What concurrency strategy should the shared-order pool use?"',
].join('\n');

const CLASSIFY_RULES = [
  'CLASSIFICATION RULES:',
  '- Determine whether the intent is sufficiently specified to design against, or is ambiguous / internally conflicting.',
  '- It is ambiguous if a material design decision is left open (storage, auth scheme, scale, retention, platform, rules) AND the intent provides no way to resolve it.',
  '- It is conflicting if it demands two mutually exclusive outcomes at once (e.g. keep everything forever AND erase everything on request).',
  '- You NEVER resolve the uncertainty yourself: you only report whether it blocks the request. Surfacing the missing/conflicting information is the product behavior; inventing answers is forbidden.',
].join('\n');

const intentBlock = (intent: string, profile: EvalTaskProfile): string =>
  [`USER INTENT (verbatim):`, '"""', intent, '"""', `EXPECTED COMPLEXITY PROFILE: ${profile}`].join('\n');

// --- the decomposed templates ---------------------------------------------------

/**
 * Decomposed council call 1 — classifier (role: classifier). Same output
 * contract as the fused classifier: ONLY {"profile": ..., "must_be_blocked":
 * boolean}. The verdict is MONOTONIC evidence; the rest of the chain still
 * runs, but must_be_blocked=true blocks the run regardless of later outputs.
 */
export function decomposedClassifier(intent: string, profile: EvalTaskProfile): string {
  return [
    'ROLE: You are the classifier step of a decomposed spec-producing council. You do not write the spec; you only classify the request.',
    intentBlock(intent, profile),
    CLASSIFY_RULES,
    JSON_ONLY,
    'TASK: classify the intent.',
    'Output ONLY this JSON object (nothing else): {"profile": "<complexity profile>", "must_be_blocked": <true|false>}',
    'must_be_blocked=true is FINAL: the pipeline will block this request and no later output can overrule the verdict. Set it exactly when the classification rules require it — do not defer the decision to later council members.',
  ].join('\n\n');
}

/** Decomposed council call 2 — proposal A, the primary architect (role: proposal_a). */
export function decomposedProposalA(intent: string, profile: EvalTaskProfile): string {
  return [
    'ROLE: You are the primary architect of a spec-producing council. Turn the user intent into a complete, evidence-gated SpecBundle: a comprehensive, production-oriented proposal.',
    SCHEMA_BLOCK,
    PITFALLS,
    CLASSIFY_RULES,
    JSON_ONLY,
    CONSTRAINT_FIDELITY,
    CLARIFY_RULES,
    [
      'YOUR FOCUS (primary architect):',
      '- Build the comprehensive production-oriented SpecBundle: full requirement coverage, faithful constraint carrying, executable task decomposition.',
      '- Faithfully carry every user constraint into requirements (verbatim, per CONSTRAINT FIDELITY).',
      '- Identify business and process gaps honestly: where the intent leaves a product-behavior decision open, mark it UNRESOLVED per the clarification wording rules — do not invent the answer.',
      '- Implementation mechanics you must choose to make the spec executable (stack, runner versions) are recorded as explicit engineering assumptions with impact_if_wrong.',
    ].join('\n'),
    'TASK: produce the SpecBundle as a single JSON value.',
    intentBlock(intent, profile),
  ].join('\n\n');
}

/**
 * Decomposed council call 3 — proposal B, the INDEPENDENT adversarial
 * reviewer-author (role: proposal_b). By construction this template carries NO
 * proposal-A content: B drafts from the intent alone, which is what keeps the
 * two proposals genuinely independent (no anchoring, fewer correlated blind
 * spots). B then applies the adversarial lens while authoring its own bundle.
 */
export function decomposedProposalB(intent: string, profile: EvalTaskProfile): string {
  return [
    'ROLE: You are the second, independent council member with an adversarial lens. Draft your OWN complete SpecBundle from the intent alone — you have not seen and must not imagine any other member\'s proposal. Your value is what a single author would MISS.',
    SCHEMA_BLOCK,
    PITFALLS,
    CLASSIFY_RULES,
    JSON_ONLY,
    CONSTRAINT_FIDELITY,
    CLARIFY_RULES,
    [
      'YOUR FOCUS (adversarial reviewer-author) — hunt specifically for:',
      '- silent production gaps the intent glosses over (what happens on failure, partial completion, concurrent use)',
      '- lifecycle edge cases (first run, empty state, migration, scale boundaries)',
      '- conflicting or mutually exclusive rules inside the intent',
      '- permission and authorization boundaries (who may see or do what)',
      '- data-integrity gaps (duplicates, concurrent modification of the same record, recovery after a crash mid-operation)',
      '- concurrent-user scenarios (two actors acting on the same data at the same moment)',
      '- failure/recovery scenarios (what is the system\'s promised behavior when a step dies halfway)',
      '- unsafe assumptions other authors would make without noticing',
      '- hidden operational requirements (backups, retention, audit, monitoring)',
      'Where one of these is genuinely unanswerable from the intent, mark it UNRESOLVED as a behavior question (clarification wording rules) — the finding is the value; inventing the answer destroys it.',
    ].join('\n'),
    'TASK: produce your OWN SpecBundle as a single JSON value.',
    intentBlock(intent, profile),
  ].join('\n\n');
}

/**
 * Decomposed council call 4 — judge (role: judge). Receives BOTH proposals
 * VERBATIM — both already schema-validated by the pipeline; the judge never
 * sees unvalidated text. Synthesizes without blind preference; preserves
 * evidence; converts unsupported high-impact disagreement into UNRESOLVED
 * decisions (which the L08 gate then turns into a blocked run — by design).
 */
export function decomposedJudge(
  intent: string,
  profile: EvalTaskProfile,
  proposalAJson: string,
  proposalBJson: string,
): string {
  return [
    'ROLE: You are the judge of a decomposed spec-producing council. Two independent members produced validated proposals; synthesize ONE final SpecBundle.',
    SCHEMA_BLOCK,
    PITFALLS,
    JSON_ONLY,
    CONSTRAINT_FIDELITY,
    CLARIFY_RULES,
    [
      'PROCEDURE (internal; do not narrate it):',
      '1. Compare the proposals point by point. Prefer the option with better justification from the intent — do NOT blindly prefer either A or B, and do not average incompatible choices.',
      '2. Preserve evidence: requirements, evidence items, and tests present in EITHER proposal that the intent supports must survive into the final bundle.',
      '3. Where A and B conflict on a HIGH-IMPACT point and the intent\'s evidence cannot resolve the conflict, do NOT pick a winner silently: emit a decision with status "UNRESOLVED" for that point (phrased per the clarification wording rules), set manifest.unresolved_count, and set manifest.state to "blocked". The product owner decides, not you.',
      '4. Low-impact mechanical differences (wording, ordering) may be settled by better justification without a decision entry.',
    ].join('\n'),
    'TASK: output ONLY the final merged SpecBundle as a single JSON value.',
    intentBlock(intent, profile),
    'PROPOSAL A (verbatim, validated):',
    '"""',
    proposalAJson,
    '"""',
    'PROPOSAL B (verbatim, validated):',
    '"""',
    proposalBJson,
    '"""',
  ].join('\n\n');
}

/**
 * Degraded judge: exactly ONE proposal leg survived validation. The judge
 * synthesizes from the surviving validated proposal alone; `failedRole` names
 * the collapsed leg (metadata carries degraded: true). The failed leg's
 * unvalidated text is withheld — never shown to the judge.
 */
export function decomposedJudgeSingle(
  intent: string,
  profile: EvalTaskProfile,
  failedRole: 'proposal_a' | 'proposal_b',
  survivingProposalJson: string,
): string {
  const surviving = failedRole === 'proposal_a' ? 'PROPOSAL B' : 'PROPOSAL A';
  return [
    `ROLE: You are the judge of a decomposed spec-producing council. The council leg is DEGRADED: ${failedRole} failed schema validation twice and its unvalidated output is withheld from you. ${surviving} is the only validated proposal.`,
    SCHEMA_BLOCK,
    PITFALLS,
    JSON_ONLY,
    CONSTRAINT_FIDELITY,
    CLARIFY_RULES,
    [
      'PROCEDURE (internal; do not narrate it):',
      '1. Work from the surviving validated proposal as your base.',
      '2. Independently re-check it against the intent: add anything material it missed, per your own judgment (including adversarial gaps the missing member would have hunted).',
      '3. Where the intent is ambiguous or self-conflicting on a high-impact point and evidence cannot resolve it, do NOT pick a winner silently: emit an UNRESOLVED decision (clarification wording rules), set manifest.unresolved_count, and set manifest.state to "blocked".',
    ].join('\n'),
    'TASK: output ONLY the final SpecBundle as a single JSON value.',
    intentBlock(intent, profile),
    `${surviving} (verbatim, validated):`,
    '"""',
    survivingProposalJson,
    '"""',
  ].join('\n\n');
}

/** Fully degraded judge: both legs failed; the judge drafts alone from the intent. */
export function decomposedJudgeAlone(intent: string, profile: EvalTaskProfile): string {
  return [
    "ROLE: You are the judge of a decomposed spec-producing council. BOTH proposal legs failed schema validation twice; neither unvalidated output is shown to you. You produce the final bundle alone, from your own independent proposal.",
    SCHEMA_BLOCK,
    PITFALLS,
    JSON_ONLY,
    CONSTRAINT_FIDELITY,
    CLARIFY_RULES,
    [
      'PROCEDURE (internal; do not narrate it):',
      '1. Draft your OWN independent proposal for the intent, applying BOTH lenses: comprehensive primary architecture AND the adversarial gap hunt (concurrency, failure/recovery, permissions, data integrity, lifecycle edges).',
      '2. Where the intent is ambiguous or self-conflicting on a high-impact point, do NOT resolve it silently: emit an UNRESOLVED decision (clarification wording rules), set manifest.unresolved_count, and set manifest.state to "blocked".',
    ].join('\n'),
    'TASK: output ONLY the final SpecBundle as a single JSON value.',
    intentBlock(intent, profile),
  ].join('\n\n');
}

// --- user answers (the deterministic clarification loop, §12) --------------------

/** One resolved user answer, ready to embed as authoritative evidence. */
export interface UserAnswerForPrompt {
  claimId: string;
  answer: string;
  /** Evidence source label, e.g. 'answers:answers.json'. */
  source: string;
  /** Precomputed sha256:<64 hex> over the answer text (LCO computes it). */
  hash: string;
}

/**
 * Append the user's answers to ANY base prompt (v4 templates natively; the
 * frozen v3 templates at runtime — v3 bytes stay untouched, the appendix is
 * composed around them). Answers are VERBATIM user evidence: the model may
 * resolve ONLY the decision an answer names, must keep the claim_id, and must
 * leave every other UNRESOLVED decision unresolved.
 */
export function withUserAnswers(basePrompt: string, answers: UserAnswerForPrompt[]): string {
  if (answers.length === 0) return basePrompt;
  const lines = [
    '',
    'USER ANSWERS (authoritative user evidence — verbatim; part of this run):',
    'The product owner answered these questions from a previous blocked generation. Treat each answer as binding user_input evidence:',
    '- An answer resolves ONLY the decision it names: carry it into the bundle as an evidence item with kind "user_input", the exact source and hash given below, and mark that decision resolved (status "accepted") referencing that evidence. KEEP the same claim_id.',
    '- Every UNRESOLVED decision WITHOUT an answer here must remain UNRESOLVED with the same claim_id — silently resolving, renaming, re-id-ing, or dropping it is forbidden and will be rejected.',
    '- New gaps you discover may surface as NEW UNRESOLVED decisions (with distinct claim_ids).',
  ];
  for (const a of answers) {
    lines.push(
      '',
      `- ${a.claimId}:`,
      '  """',
      a.answer,
      '  """',
      `  (evidence: kind user_input, source "${a.source}", content ${a.hash})`,
    );
  }
  return [basePrompt, ...lines].join('\n');
}
