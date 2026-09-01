import { describe, it, expect } from 'vitest';
import {
  CLARIFY_SESSION_STATES,
  canTransition,
  isTerminal,
  nextSessionState,
  type ClarifySessionState,
} from './state';

/**
 * §22 — the session state machine as DATA: one transition table, guards, and
 * terminal identification. The server owns this state; the browser is only a
 * client. ANSWER_EDITING / CHANGE_REQUEST_EDITING are deliberately CLIENT-side
 * drafting states — the server never stores half-edited answers, only
 * submitted artifacts.
 */

const LEGAL: [ClarifySessionState, ClarifySessionState][] = [
  ['STARTING', 'CLARIFICATION_REQUIRED'],
  ['STARTING', 'SPEC_READY'],
  ['STARTING', 'FAILED'],
  ['STARTING', 'CANCELLED'],
  ['CLARIFICATION_REQUIRED', 'ANSWER_APPLYING'],
  ['CLARIFICATION_REQUIRED', 'CANCELLED'],
  ['CLARIFICATION_REQUIRED', 'FAILED'],
  ['ANSWER_APPLYING', 'REVALIDATING'],
  ['ANSWER_APPLYING', 'CLARIFICATION_REQUIRED'], // invalid submission → back to questions
  ['ANSWER_APPLYING', 'FAILED'],
  ['ANSWER_APPLYING', 'CANCELLED'],
  ['REVALIDATING', 'CLARIFICATION_REQUIRED'], // more/new questions (next round)
  ['REVALIDATING', 'CLARIFICATION_COMPLETE'], // no required ambiguity left
  ['REVALIDATING', 'FAILED'],
  ['REVALIDATING', 'CANCELLED'],
  ['CLARIFICATION_COMPLETE', 'FINAL_REVIEW'],
  ['CLARIFICATION_COMPLETE', 'FAILED'],
  ['SPEC_READY', 'FINAL_REVIEW'],
  ['FINAL_REVIEW', 'CHANGE_APPLYING'],
  ['FINAL_REVIEW', 'APPROVED'],
  ['FINAL_REVIEW', 'CANCELLED'],
  ['CHANGE_APPLYING', 'REVALIDATING'],
  ['CHANGE_APPLYING', 'FINAL_REVIEW'], // changes incorporated cleanly
  ['CHANGE_APPLYING', 'FAILED'],
  ['CHANGE_APPLYING', 'CANCELLED'],
  // any non-terminal failure/cancel path is legal from live states (tested via isTerminal)
];

describe('the session state machine (§22)', () => {
  it('accepts exactly the designed transitions', () => {
    for (const [from, to] of LEGAL) {
      expect(canTransition(from, to), `${from} -> ${to} should be legal`).toBe(true);
    }
  });

  it('rejects the dangerous/undefined ones', () => {
    expect(canTransition('STARTING', 'APPROVED')).toBe(false); // never approve without review
    expect(canTransition('CLARIFICATION_REQUIRED', 'APPROVED')).toBe(false); // questions must resolve first
    expect(canTransition('CLARIFICATION_REQUIRED', 'FINAL_REVIEW')).toBe(false); // no skipping the gate
    expect(canTransition('FINAL_REVIEW', 'CLARIFICATION_REQUIRED')).toBe(false); // change sets re-enter via CHANGE_APPLYING
    expect(canTransition('APPROVED', 'CLARIFICATION_REQUIRED')).toBe(false); // never silently re-opened
    expect(canTransition('APPROVED', 'FINAL_REVIEW')).toBe(false); // change cycles re-enter via CHANGE_APPLYING
    expect(canTransition('CANCELLED', 'STARTING')).toBe(false);
    expect(canTransition('FAILED', 'FINAL_REVIEW')).toBe(false);
    expect(canTransition('SPEC_READY', 'CLARIFICATION_REQUIRED')).toBe(false); // first pass was clean; changes reopen later
    expect(canTransition('ANSWER_APPLYING', 'APPROVED')).toBe(false);
  });

  it('terminal states are exactly CANCELLED / FAILED; APPROVED is quiescent (re-openable only by a change cycle)', () => {
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('FAILED')).toBe(true);
    expect(isTerminal('APPROVED')).toBe(false);
    for (const s of CLARIFY_SESSION_STATES) {
      if (s !== 'CANCELLED' && s !== 'FAILED') {
        expect(isTerminal(s), `${s} should be live or quiescent`).toBe(false);
      }
    }
    // the ONLY way out of APPROVED is an explicit change application
    expect(canTransition('APPROVED', 'CHANGE_APPLYING')).toBe(true);
  });

  it('nextSessionState lists legal successors and refuses illegal ones with an actionable reason', () => {
    expect(nextSessionState('CLARIFICATION_REQUIRED')).toEqual(['ANSWER_APPLYING', 'CANCELLED', 'FAILED']);
    expect(nextSessionState('APPROVED')).toEqual(['CHANGE_APPLYING']); // quiescent: exactly one exit
    const refused = nextSessionState('CANCELLED');
    expect(!Array.isArray(refused) && refused.reason).toContain('terminal');
  });
});
