/**
 * §28 — application-chrome strings, centralized. LLM-generated question
 * content, review text, and user-authored text are NEVER routed through here
 * (they render verbatim); this file is the single place to swap the shell's
 * language later. No silent translation of user evidence.
 */
export const STRINGS = {
  appTitle: 'LCO',
  workspaceTitle: 'Business Clarification',
  // why LCO is asking (§6)
  whyAsking:
    'Before anything is built, a few business decisions need your answer. LCO refuses to guess them — your answer becomes part of the specification.',
  // progress (§15 — honest language, never a fake percentage)
  progressResolved: (n: number) => `${n} decision${n === 1 ? '' : 's'} resolved`,
  progressRemaining: (n: number) => `${n} currently remaining`,
  newlyDiscovered: (n: number) => `${n} new decision${n === 1 ? '' : 's'} appeared after your last answers`,
  // questions (§6–§11)
  questionOf: (current: number, total: number) => `Decision ${current} of ${total}`,
  prevQuestion: 'Previous decision',
  nextQuestion: 'Next decision',
  applyAnswers: (n: number) => `Submit ${n} answer${n === 1 ? '' : 's'}`,
  optionLabel: 'Suggested options',
  otherLabel: 'Other — describe your own rule',
  otherPlaceholder: 'Describe how your business should handle this…',
  additionalLabel: 'Add your own clarification (optional)',
  additionalPlaceholder: 'Exceptions, extra rules, details we should apply on top…',
  previewLabel: 'With this choice',
  previewBaseNote: 'Your additional instruction modifies this behavior.',
  unknownsLabel: 'This decision does not determine:',
  contradictedNotice:
    'Your earlier answer conflicted with other answers or evidence. Review it — LCO will not quietly pick a side.',
  staleNotice:
    'This decision depends on an answer you changed. Confirm or update it before submitting.',
  answeredAs: (text: string) => `You answered: ${text}`,
  validationEmpty: 'Pick a suggested option or write your own rule.',
  validationOtherShort: 'Write your rule in a little more detail (at least 10 characters).',
  validationTooLong: 'This answer is too long — keep it under 4000 characters.',
  applyInvalidTitle: 'Some decisions still need answers',
  // busy states (§30)
  busyStarting: 'LCO is analyzing your description…',
  busyApplying: 'Applying your answers and re-checking the specification…',
  busyChanges: 'Applying your requested changes…',
  busyHint: 'This can take a little while — nothing is saved until you approve.',
  // review (§17)
  reviewTitle: 'How your application will work',
  reviewIntro:
    'After development is complete, your application and its workflows will operate as follows. Read it as the contract the implementation must satisfy.',
  reviewVersionLabel: (v: number) => `Review v${v}`,
  sectionTitles: {
    purpose: 'What this application is for',
    terms: 'Terms used in this project',
    workflows: 'Primary workflows and behavior',
    experience: 'User experience',
    access: 'Access, permissions and security',
    data: 'Data and visibility',
    operations: 'Operational rules and limits',
    logic: 'Business rules of record',
    structure: 'How the system is structured',
    rules: 'Business rules and choices you made',
    excluded: 'Explicitly excluded behavior',
    assumptions: 'Assumptions — tell us if any is wrong',
    work: 'What will be built',
  } as Record<string, string>,
  changeThis: 'Change this',
  pendingTitle: (n: number) => `Requested changes (${n})`,
  pendingEmpty: 'Select any part of the review and describe what should change.',
  pendingApply: (n: number) => `Apply ${n} change${n === 1 ? '' : 's'}`,
  pendingInstructionLabel: 'What should change?',
  pendingInstructionPlaceholder: 'Describe the behavior you want instead…',
  pendingAdd: 'Add change request',
  pendingUpdate: 'Update change request',
  pendingEdit: 'Edit',
  pendingDelete: 'Delete',
  pendingCancel: 'Cancel',
  changeQuotedLabel: 'You selected',
  changeOutcomeIncorporated: 'incorporated',
  changeOutcomeReplaced: 'replaced — please re-read the updated review',
  changeOutcomeNeedsDecisions: 'needs a decision from you',
  changeOutcomeTitle: 'Your changes:',
  staleChangeRejected:
    'The review changed while you were writing one of your change requests — the affected request was not applied. Re-select it on the current review.',
  approveButton: 'Approve specification',
  approveConfirmTitle: 'Approve this specification?',
  approveConfirmBody:
    'Approval records the approved baseline of this specification. You can still request changes afterwards — each later approval creates a new revision.',
  approveConfirmYes: 'Yes, approve',
  approveConfirmNo: 'Not yet',
  approveBlockedPending: 'Apply or delete your pending change requests first.',
  approvedBanner: (rev: number) => `Approved — revision ${rev} recorded. You can close this tab; the terminal shows the summary.`,
  approvedReopenHint: 'Need a change? Select any part of the review below and request it — a new revision will follow.',
  // terminal (§30)
  cancelledTitle: 'Session ended',
  cancelledBody: 'This clarification session was cancelled. Nothing was written. You can close this tab and start again from the terminal.',
  failedTitle: 'The session could not continue',
  failedIntro: 'LCO stopped rather than guess. Nothing was written.',
  failedHelp: 'The terminal shows the full reasons and how to retry.',
  sessionExpiredTitle: 'This link is no longer valid',
  sessionExpiredBody: 'Start a new session from the terminal (the link was printed there).',
  networkErrorTitle: 'Cannot reach the local session',
  networkErrorRetry: 'Try again',
  cancel: 'Cancel session',
  cancelConfirm: 'Cancel this clarification session? Nothing will be written.',
  keyboardHint: 'You can complete everything with the keyboard: Tab moves, arrows change options, Space selects.',
} as const;

export type StringType = keyof typeof STRINGS;
