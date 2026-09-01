import { describe, it, expect } from 'vitest';
import {
  initialState, onSnapshot, setDraft, setCurrentIndex, validateDraft, validateAll,
  addPendingChange, updatePendingChange, removePendingChange, editPendingChange, openChangePanel, closeChangePanel,
} from './state.js';
import type { SessionSnapshot } from './types.js';

/**
 * The client store (pure): drafts survive only while their question is open,
 * validation mirrors the canonical rules, pending changes behave as a
 * distinct editable list, and the review-version boundary resets pending
 * state. No DOM in this file — jsdom not needed.
 */

const snap = (over: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  sessionId: 's-1',
  state: 'CLARIFICATION_REQUIRED',
  round: 1,
  progress: { resolved: 0, remaining: 2, newlyDiscovered: 2 },
  usage: { in: 0, out: 0, calls: 1, attempts: 1, callsWithoutUsage: 0, usageKnown: true, promptBytes: 10 },
  promptProtocol: 'lco-prompts/v3',
  questions: [
    {
      claimId: 'DEC-0004',
      question: 'Who gets the last fabric?',
      impact: 'high',
      options: [
        { option: 'first confirmed order gets priority', preview: { source: 'bundle', text: 'the other dealer sees out of stock' } },
        { option: 'split the stock', preview: { source: 'bundle', text: 'each may receive less' } },
      ],
      dependsOn: [],
      firstSeenRound: 1,
      status: 'open',
    },
    {
      claimId: 'DEC-0007',
      question: 'Who may approve an order?',
      impact: 'medium',
      options: [],
      dependsOn: ['DEC-0004'],
      firstSeenRound: 1,
      status: 'open',
    },
  ],
  ...over,
});

describe('client store', () => {
  it('drafts persist while their question stays open and drop when it disappears', () => {
    let state = initialState(snap());
    state = setDraft(state, { decisionId: 'DEC-0004', kind: 'option', selectedOption: 'split the stock' });
    expect(state.drafts.size).toBe(1);
    const round2 = onSnapshot(state, snap({ round: 2, questions: [snap().questions[1]!] }));
    expect(round2.drafts.has('DEC-0004')).toBe(false); // resolved and gone
  });

  it('validation mirrors the canonical rules', () => {
    const state = initialState(snap());
    const q4 = state.snapshot.questions[0]!;
    const q7 = state.snapshot.questions[1]!;
    expect(validateDraft(undefined, q4)).not.toBeNull(); // empty rejected
    expect(validateDraft({ decisionId: 'DEC-0004', kind: 'option', selectedOption: 'not offered' }, q4)).not.toBeNull();
    expect(validateDraft({ decisionId: 'DEC-0004', kind: 'option', selectedOption: 'split the stock' }, q4)).toBeNull();
    expect(validateDraft({ decisionId: 'DEC-0004', kind: 'option', selectedOption: 'split the stock', freeText: 'except pre-paid dealers' }, q4)).toBeNull();
    expect(validateDraft({ decisionId: 'DEC-0007', kind: 'other', freeText: 'too short' }, q7)).not.toBeNull();
    expect(validateDraft({ decisionId: 'DEC-0007', kind: 'other', freeText: 'Any company administrator may approve.' }, q7)).toBeNull();
    expect(validateDraft({ decisionId: 'DEC-0007', kind: 'other', freeText: 'x'.repeat(4001) }, q7)).not.toBeNull();
    expect(validateAll(state).size).toBe(2);
  });

  it('navigation clamps to the question range', () => {
    let state = initialState(snap());
    state = setCurrentIndex(state, 5);
    expect(state.currentIndex).toBe(1);
    state = setCurrentIndex(state, -3);
    expect(state.currentIndex).toBe(0);
  });

  it('pending changes: add, edit, update, delete — each keeps its own identity', () => {
    let state = initialState(snap());
    state = addPendingChange(state, { segmentId: 'SEG-REQ-0001', selectedText: 'dealers browse', segmentContentHash: 'sha256:a', instruction: 'Show stock levels.' });
    state = addPendingChange(state, { segmentId: 'SEG-SEC-0002', selectedText: 'only admins', segmentContentHash: 'sha256:b', instruction: 'Managers too.' });
    expect(state.pending).toHaveLength(2);
    expect(state.pending[0]!.changeId).not.toBe(state.pending[1]!.changeId);
    state = editPendingChange(state, state.pending[0]!.changeId);
    expect(state.editing?.instruction).toBe('Show stock levels.');
    state = updatePendingChange(state, { ...state.editing!, instruction: 'Show LIVE stock levels.' });
    expect(state.pending[0]!.instruction).toBe('Show LIVE stock levels.');
    state = removePendingChange(state, state.pending[1]!.changeId);
    expect(state.pending).toHaveLength(1);
    expect(state.changePanelOpen).toBe(false);
  });

  it('a new review version clears pending changes (anchors are version-bound)', () => {
    let state = initialState(snap({ state: 'FINAL_REVIEW', review: { reviewVersion: 1, specDigest: 'd', projectName: 'p', sections: [] } }));
    state = addPendingChange(state, { segmentId: 'SEG-REQ-0001', selectedText: 'x', segmentContentHash: 'sha256:a', instruction: 'Change it.' });
    state = onSnapshot(state, snap({
      state: 'FINAL_REVIEW',
      review: { reviewVersion: 2, specDigest: 'd2', projectName: 'p', sections: [] },
    }));
    expect(state.pending).toHaveLength(0);
  });

  it('the change panel opens with anchor data and closes without residue', () => {
    let state = initialState(snap({ state: 'FINAL_REVIEW', review: { reviewVersion: 1, specDigest: 'd', projectName: 'p', sections: [] } }));
    state = openChangePanel(state, 'SEG-REQ-0001', 'selected words', 'sha256:c');
    expect(state.editing?.selectedText).toBe('selected words');
    expect(state.changePanelOpen).toBe(true);
    state = closeChangePanel(state);
    expect(state.changePanelOpen).toBe(false);
    expect(state.editing).toBeNull();
  });
});
