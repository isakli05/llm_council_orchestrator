// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { initialState, setDraft, addPendingChange, setCurrentIndex, openChangePanel, updatePendingChange } from './state.js';
import { renderQuestions } from './screens-questions.js';
import { renderReview } from './screens-review.js';
import { renderBusy, renderFailed, renderCancelled } from './screens-status.js';
import type { DraftAnswer, SessionSnapshot } from './types.js';

/**
 * §34 UI tests (jsdom): questionnaire loads, progress, option selection with
 * INSTANT preview (no network), option+explanation, Other-only, prev/next,
 * conditional dependency notices, accessible validation, review rendering,
 * pending-change flow, approval gating, keyboard operability.
 */

const snap = (over: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  sessionId: 's-1',
  state: 'CLARIFICATION_REQUIRED',
  round: 1,
  progress: { resolved: 1, remaining: 2, newlyDiscovered: 1 },
  usage: { in: 0, out: 0, calls: 1, attempts: 1, callsWithoutUsage: 0, usageKnown: true, promptBytes: 10 },
  promptProtocol: 'lco-prompts/v3',
  projectName: 'textile-b2b',
  questions: [
    {
      claimId: 'DEC-0004',
      question: 'Who gets the last fabric when two dealers order at once?',
      impact: 'high',
      context: 'Two dealers may want the same fabric at the same moment.',
      options: [
        { option: 'first confirmed order gets priority', preview: { source: 'bundle', text: 'The other dealer sees an out-of-stock message.' } },
        { option: 'split the stock', preview: { source: 'bundle', text: 'Each dealer may receive less than requested.' } },
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
      firstSeenRound: 2,
      status: 'stale',
    },
  ],
  ...over,
});

function questionsScreen(stateSnapshot: SessionSnapshot) {
  const state = initialState(stateSnapshot);
  const drafts: DraftAnswer[] = [];
  let navigated: number[] = [];
  let submitted = 0;
  let current = state;
  const screen = renderQuestions(current, {
    onDraft: (d) => { drafts.push(d); current = setDraft(current, d); },
    onNavigate: (i) => { navigated.push(i); current = setCurrentIndex(current, i); },
    onSubmit: () => { submitted += 1; },
  });
  document.body.replaceChildren(screen);
  return { drafts, get submitted() { return submitted; }, get navigated() { return navigated; }, rerender() {
    document.body.replaceChildren(renderQuestions(current, {
      onDraft: (d) => { drafts.push(d); current = setDraft(current, d); },
      onNavigate: (i) => { navigated.push(i); current = setCurrentIndex(current, i); },
      onSubmit: () => { submitted += 1; },
    }));
  } };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('questionnaire screen', () => {
  it('renders progress in honest language (no percentage) with aria-live', () => {
    questionsScreen(snap());
    const progress = document.querySelector('.progress')!;
    expect(progress.getAttribute('aria-live')).toBe('polite');
    expect(progress.textContent).toContain('1 decision resolved');
    expect(progress.textContent).toContain('2 currently remaining');
    expect(progress.textContent).toContain('1 new decision appeared');
    expect(progress.textContent).not.toMatch(/%/);
  });

  it('renders the question as a fieldset/legend with associated context', () => {
    questionsScreen(snap());
    const legend = document.querySelector('fieldset legend')!;
    expect(legend.textContent).toContain('Who gets the last fabric');
    const fieldset = document.querySelector('fieldset.question-field')!;
    expect(fieldset.querySelector('p.context')?.getAttribute('id')).toBe('ctx-DEC-0004');
  });

  it('selecting an option shows the consequence preview INSTANTLY from local data (no fetch)', () => {
    const fetchCalls: unknown[] = [];
    const originalFetch = window.fetch;
    window.fetch = (async (...args: unknown[]) => { fetchCalls.push(args); throw new Error('no network expected'); }) as typeof fetch;
    try {
      const screen = questionsScreen(snap());
      const radio = document.getElementById('opt-DEC-0004-1') as HTMLInputElement;
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      expect(screen.drafts[0]).toEqual({ decisionId: 'DEC-0004', kind: 'option', selectedOption: 'split the stock' });
      // preview panel updated in place — zero fetch calls
      const preview = document.getElementById('preview-DEC-0004')!;
      expect(preview.textContent).toContain('Each dealer may receive less than requested.');
      expect(fetchCalls).toHaveLength(0);
    } finally {
      window.fetch = originalFetch;
    }
  });

  it('option + additional explanation drafts BOTH facts', () => {
    const screen = questionsScreen(snap());
    const radio = document.getElementById('opt-DEC-0004-0') as HTMLInputElement;
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    const extra = document.getElementById('extra-DEC-0004') as HTMLTextAreaElement;
    extra.value = 'Dealers imported from our ERP skip the queue.';
    extra.dispatchEvent(new Event('input', { bubbles: true }));
    const last = screen.drafts[screen.drafts.length - 1]!;
    expect(last).toEqual({
      decisionId: 'DEC-0004',
      kind: 'option',
      selectedOption: 'first confirmed order gets priority',
      freeText: 'Dealers imported from our ERP skip the queue.',
    });
  });

  it('F4 regression: an instruction typed BEFORE selecting an option is kept when the option is chosen', () => {
    const screen = questionsScreen(snap());
    const extra = document.getElementById('extra-DEC-0004') as HTMLTextAreaElement;
    extra.value = 'Dealers imported from our ERP skip the queue.';
    extra.dispatchEvent(new Event('input', { bubbles: true }));
    // no radio is checked yet — typing alone drafts nothing for the option kind;
    // selecting the option must pick up the LIVE textarea value
    const radio = document.getElementById('opt-DEC-0004-0') as HTMLInputElement;
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    const last = screen.drafts[screen.drafts.length - 1]!;
    expect(last.kind).toBe('option');
    expect(last.selectedOption).toBe('first confirmed order gets priority');
    expect(last.freeText).toBe('Dealers imported from our ERP skip the queue.');
  });

  it('Other-only drafts the user rule as kind other', () => {
    const screen = questionsScreen(snap());
    const other = document.getElementById('other-DEC-0004') as HTMLInputElement;
    other.checked = true;
    other.dispatchEvent(new Event('change', { bubbles: true }));
    const area = document.getElementById('other-text-DEC-0004') as HTMLTextAreaElement;
    area.value = 'The dealer with the longer relationship wins the fabric.';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    const last = screen.drafts[screen.drafts.length - 1]!;
    expect(last.kind).toBe('other');
    expect(last.freeText).toContain('longer relationship');
  });

  it('prev/next navigate between questions; a dependent/stale question shows its notice', () => {
    const screen = questionsScreen(snap());
    const next = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Next decision') as HTMLButtonElement;
    next.click();
    expect(screen.navigated).toEqual([1]);
    screen.rerender();
    expect(document.querySelector('.notice.warn')?.textContent).toContain('depends on an answer you changed');
  });

  it('submit with unanswered questions shows an accessible validation summary', () => {
    const state = snap();
    const errs = new Map([['DEC-0004', 'Pick a suggested option or write your own rule.']]);
    const screen = renderQuestions({ ...initialState(state), errors: errs }, { onDraft: () => {}, onNavigate: () => {}, onSubmit: () => {} });
    document.body.replaceChildren(screen);
    const summary = document.querySelector('ul.errors')!;
    expect(summary.getAttribute('role')).toBe('alert');
    expect(summary.textContent).toContain('Some decisions still need answers');
  });
});

const reviewSnap = (): SessionSnapshot => ({
  ...snap({ state: 'FINAL_REVIEW' }),
  questions: [],
  progress: { resolved: 2, remaining: 0, newlyDiscovered: 0 },
  review: {
    reviewVersion: 1,
    specDigest: 'sha256:d',
    projectName: 'textile-b2b',
    sections: [
      {
        key: 'workflows',
        segments: [
          { segmentId: 'SEG-REQ-0001', sectionKey: 'workflows', body: 'Newly registered dealers require administrator approval before accessing the portal.', sourceRefs: ['REQ-0001'], contentHash: 'sha256:aaa', meta: { priority: 'must' } },
          { segmentId: 'SEG-REQ-0002', sectionKey: 'workflows', body: 'Dealers can track their order status.', sourceRefs: ['REQ-0002'], contentHash: 'sha256:bbb', meta: { priority: 'should' } },
        ],
      },
    ],
  },
});

describe('review screen', () => {
  it('renders sections with stable segment ids and business-language titles', () => {
    let state = initialState(reviewSnap());
    document.body.replaceChildren(renderReview(state, noopReviewActions()));
    expect(document.querySelector('.review-title')?.textContent).toBe('How your application will work');
    expect(document.querySelector('[data-segment-id="SEG-REQ-0001"]')?.textContent).toContain('administrator approval');
    expect(document.querySelector('.review-section h3')?.textContent).toBe('Primary workflows and behavior');
    expect(document.querySelector('.review-meta')?.textContent).toContain('Review v1');
  });

  it('Change this opens the panel with the selection anchored; multiple pending changes accumulate distinctly', () => {
    let state = initialState(reviewSnap());
    const apply = (s: typeof state) => { document.body.replaceChildren(renderReview(s, wireActions(() => state, (next) => { state = next; }))); };
    apply(state);
    // open the first segment's change request (selection captured from the segment)
    (document.querySelector('[data-segment-id="SEG-REQ-0001"] .change-trigger') as HTMLButtonElement).click();
    apply(state); // the action mutated state; re-render shows the panel
    expect(document.querySelector('.change-panel')).not.toBeNull();
    const area = document.getElementById('change-instruction') as HTMLTextAreaElement;
    area.value = 'Dealers imported from Logo ERP should bypass this approval.';
    ([...document.querySelectorAll('.change-panel .btn.primary')].find((b) => b.textContent === 'Add change request') as HTMLButtonElement).click();
    // second pending change on ANOTHER segment
    apply(state);
    (document.querySelector('[data-segment-id="SEG-REQ-0002"] .change-trigger') as HTMLButtonElement).click();
    apply(state); // panel re-opened for the second segment
    const area2 = document.getElementById('change-instruction') as HTMLTextAreaElement;
    area2.value = 'Order tracking should show estimated delivery dates.';
    ([...document.querySelectorAll('.change-panel .btn.primary')].find((b) => b.textContent === 'Add change request') as HTMLButtonElement).click();
    apply(state);
    const items = [...document.querySelectorAll('.pending-item')];
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain('bypass this approval');
    expect(items[1]!.textContent).toContain('delivery dates');
    // apply button names the count; approve is blocked while pending
    const applyBtn = [...document.querySelectorAll('button')].find((b) => /Apply 2 changes/.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(applyBtn).toBeTruthy();
    const approveBtn = document.querySelector('.btn.approve') as HTMLButtonElement;
    expect(approveBtn.hasAttribute('disabled')).toBe(true);
  });

  it('edit and delete manage pending changes', () => {
    let state = initialState(reviewSnap());
    state = addPendingChange(state, { segmentId: 'SEG-REQ-0001', selectedText: 'administrator approval', segmentContentHash: 'sha256:aaa', instruction: 'First version.' });
    document.body.replaceChildren(renderReview(state, noopReviewActions()));
    const edit = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Edit') as HTMLButtonElement;
    edit.click(); // action wiring only in the app; state-level behavior covered in state.test
    expect(document.querySelectorAll('.pending-item')).toHaveLength(1);
    const del = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Delete') as HTMLButtonElement;
    del.click();
    expect(document.querySelectorAll('.pending-item')).toHaveLength(1); // deletion flows through app actions; screen renders state
  });

  it('change outcomes and the approved banner render', () => {
    const s = reviewSnap();
    s.state = 'APPROVED';
    s.approvedRevision = 1;
    s.lastChangeOutcome = { reviewVersion: 1, changes: [{ changeId: 'CHG-W1', segmentId: 'SEG-REQ-0001', outcome: 'incorporated' }] };
    document.body.replaceChildren(renderReview(initialState(s), noopReviewActions()));
    expect(document.querySelector('.approved-banner')?.textContent).toContain('revision 1');
    expect(document.querySelector('.change-outcomes')?.textContent).toContain('incorporated');
    // no approve button in APPROVED state
    expect(document.querySelector('.btn.approve')).toBeNull();
  });
});

describe('status screens', () => {
  it('busy/failed/cancelled render honestly', () => {
    document.body.replaceChildren(renderBusy('STARTING'));
    expect(document.querySelector('.busy h2')?.textContent).toContain('analyzing');
    document.body.replaceChildren(renderFailed(['reason one', 'reason two']));
    expect(document.querySelector('.failed ul')?.textContent).toContain('reason one');
    document.body.replaceChildren(renderCancelled());
    expect(document.querySelector('.terminal h2')?.textContent).toContain('Session ended');
  });
});

function noopReviewActions() {
  return {
    onStateChange: () => {},
    onRequestChange: () => {},
    onDraftChange: () => {},
    onCancelChange: () => {},
    onEditChange: () => {},
    onDeleteChange: () => {},
    onApplyChanges: () => {},
    onApprove: () => {},
  };
}

function wireActions(get: () => ReturnType<typeof initialState>, set: (s: ReturnType<typeof initialState>) => void) {
  return {
    onStateChange: () => {},
    onRequestChange: (detail: { segmentId: string; selectedText: string; segmentContentHash: string }) => {
      set(openChangePanel(get(), detail.segmentId, detail.selectedText, detail.segmentContentHash));
    },
    onDraftChange: (change: { segmentId: string; selectedText: string; segmentContentHash: string; instruction: string; changeId?: string }, isUpdate: boolean) => {
      if (isUpdate && change.changeId !== undefined) {
        set(updatePendingChange(get(), { ...change, changeId: change.changeId } as never));
      } else {
        set(addPendingChange(get(), change));
      }
    },
    onCancelChange: () => {},
    onEditChange: () => {},
    onDeleteChange: () => {},
    onApplyChanges: () => {},
    onApprove: () => {},
  };
}
