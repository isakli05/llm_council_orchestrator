/**
 * §22 — the clarification session state machine (server-owned; the browser is
 * only a client).
 *
 * The table is DATA (the lifecycle.ts pattern): legal transitions are declared
 * in one place, every mutation goes through canTransition, and no scattered UI
 * boolean can smuggle an illegal move (e.g. APPROVED without a review, or
 * FINAL_REVIEW while questions remain open).
 *
 * ANSWER_EDITING / CHANGE_REQUEST_EDITING from the owner's conceptual list are
 * deliberately CLIENT-side drafting states: the server stores only SUBMITTED
 * answers/change sets, so half-edited browser state is never authoritative.
 *
 * APPROVED is quiescent, not terminal: the multi-cycle appendix lifecycle
 * (approve -> review again -> apply changes -> approve again) creates
 * immutable revision lineage, so an approved session re-opens ONLY via an
 * explicit change application (APPROVED -> CHANGE_APPLYING).
 */
export const CLARIFY_SESSION_STATES = [
  'STARTING',
  'CLARIFICATION_REQUIRED',
  'ANSWER_APPLYING',
  'REVALIDATING',
  'CLARIFICATION_COMPLETE',
  'SPEC_READY',
  'FINAL_REVIEW',
  'CHANGE_APPLYING',
  'APPROVED',
  'CANCELLED',
  'FAILED',
] as const;

export type ClarifySessionState = (typeof CLARIFY_SESSION_STATES)[number];

// CANCELLED/FAILED are strictly terminal. APPROVED is QUIESCENT: the session
// rests after the explicit approval (§21) and re-opens ONLY through another
// explicit change cycle (appendix: Review vN -> changes -> ... -> approval,
// producing the next immutable revision) — never through model action.
const TERMINAL: readonly ClarifySessionState[] = ['CANCELLED', 'FAILED'];

/** One row: from → to, with the guard meaning (documentation-as-data). */
interface TransitionRule {
  from: ClarifySessionState;
  to: ClarifySessionState;
  guard: string;
}

const TRANSITIONS: readonly TransitionRule[] = [
  { from: 'STARTING', to: 'CLARIFICATION_REQUIRED', guard: 'first pipeline round blocked by UNRESOLVED decisions' },
  { from: 'STARTING', to: 'SPEC_READY', guard: 'first pipeline round produced a lint-clean spec (no questions needed)' },
  { from: 'STARTING', to: 'FAILED', guard: 'first round failed without clarifiable material' },
  { from: 'STARTING', to: 'CANCELLED', guard: 'cancelled before the first round finished' },
  { from: 'CLARIFICATION_REQUIRED', to: 'ANSWER_APPLYING', guard: 'a validated answer batch was submitted for this round' },
  { from: 'CLARIFICATION_REQUIRED', to: 'CANCELLED', guard: 'user cancelled' },
  { from: 'CLARIFICATION_REQUIRED', to: 'FAILED', guard: 'round budget/infrastructure failure' },
  { from: 'ANSWER_APPLYING', to: 'REVALIDATING', guard: 'answers accepted; pipeline re-run started' },
  { from: 'ANSWER_APPLYING', to: 'CLARIFICATION_REQUIRED', guard: 'submission invalid — back to the questions, nothing applied' },
  { from: 'ANSWER_APPLYING', to: 'FAILED', guard: 're-evaluation failed without clarifiable material' },
  { from: 'ANSWER_APPLYING', to: 'CANCELLED', guard: 'user cancelled mid-apply' },
  { from: 'REVALIDATING', to: 'CLARIFICATION_REQUIRED', guard: 're-run blocked: remaining or NEW unresolved decisions (next round)' },
  { from: 'REVALIDATING', to: 'CLARIFICATION_COMPLETE', guard: 're-run clean: no required ambiguity left' },
  { from: 'REVALIDATING', to: 'FAILED', guard: 're-run failed without clarifiable material / round cap reached' },
  { from: 'REVALIDATING', to: 'CANCELLED', guard: 'user cancelled mid-revalidation' },
  { from: 'CLARIFICATION_COMPLETE', to: 'FINAL_REVIEW', guard: 'behavior review projected from the clean bundle' },
  { from: 'CLARIFICATION_COMPLETE', to: 'FAILED', guard: 'projection/gate failure' },
  { from: 'SPEC_READY', to: 'FINAL_REVIEW', guard: 'first-pass spec projected for review' },
  { from: 'FINAL_REVIEW', to: 'CHANGE_APPLYING', guard: 'a validated change set was submitted (Apply N changes)' },
  { from: 'FINAL_REVIEW', to: 'APPROVED', guard: 'EXPLICIT approval action with zero pending changes and zero open questions' },
  { from: 'FINAL_REVIEW', to: 'CANCELLED', guard: 'user cancelled at review' },
  { from: 'CHANGE_APPLYING', to: 'REVALIDATING', guard: 'one regeneration for the whole set; revalidation routes the outcome' },
  { from: 'CHANGE_APPLYING', to: 'FINAL_REVIEW', guard: 'changes incorporated cleanly; new review version projected' },
  { from: 'CHANGE_APPLYING', to: 'FAILED', guard: 'regeneration failed; review stays at its previous version (transactional)' },
  { from: 'CHANGE_APPLYING', to: 'CANCELLED', guard: 'user cancelled mid-apply' },
  { from: 'APPROVED', to: 'CHANGE_APPLYING', guard: 'the owner requested further changes after approving — one more explicit cycle; the next approval creates revision N+1' },
  { from: 'APPROVED', to: 'CANCELLED', guard: 'the owner explicitly ends an approved session (approval artifacts stay; nothing further is written)' },
  { from: 'CLARIFICATION_COMPLETE', to: 'CANCELLED', guard: 'cancelled between completion and review' },
  { from: 'SPEC_READY', to: 'CANCELLED', guard: 'cancelled before the first review was shown' },
];

export function isTerminal(state: ClarifySessionState): boolean {
  return TERMINAL.includes(state);
}

export function canTransition(from: ClarifySessionState, to: ClarifySessionState): boolean {
  return TRANSITIONS.some((t) => t.from === from && t.to === to);
}

export function nextSessionState(
  from: ClarifySessionState,
): ClarifySessionState[] | { ok: false; reason: string } {
  if (isTerminal(from)) {
    return {
      ok: false,
      reason: `session state '${from}' is terminal — the session is over (CANCELLED/FAILED have no outgoing transitions)`,
    };
  }
  return TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);
}
