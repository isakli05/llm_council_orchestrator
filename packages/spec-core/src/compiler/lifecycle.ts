import type { ComplexityProfile, SpecBundle, SpecState } from '../schemas';
import type { LintResult } from '../lint/types';

/**
 * THE spec lifecycle state machine (BACK-002).
 *
 * Before this module, every operation enforced its own scattered state
 * condition (freeze checked none, generate checked none) — invalid states
 * could be generated (`state:"frozen"` from an LLM) or laundered through
 * freeze (re-freezing a hand-edited frozen spec re-pinned it under the same
 * version). This module is now the single source of truth: the legal state
 * set, the legal transitions, and their guards live HERE, as data, and every
 * mutating surface (generate output gate, lint L08, freeze precondition,
 * changeset application) calls these functions. Denormalized manifest fields
 * cannot bypass the table.
 *
 * Determinism: pure functions over their inputs — no clock, no environment,
 * no randomness. A timestamp guard, if one is ever needed, is injected by the
 * caller (the nowIso convention used by freeze/change/generate).
 */

/** The states the lifecycle machine recognizes. `blocked` and `superseded`
 * are terminal (no outgoing transition); `frozen` exits only via `change`.
 * NOTE: the zod `SpecStateSchema` also admits `'reviewed'` — a vestigial
 * schema value with no producer and no transition. It is flagged by
 * `lifecycleStateFindings` (surfaced through L08) instead of being removed
 * from the schema, so existing stored manifests fail loudly at the lifecycle
 * gate rather than at JSON parse time. */
export const LIFECYCLE_STATES = ['draft', 'frozen', 'blocked', 'superseded'] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export type LifecycleOperation = 'generate' | 'freeze' | 'change';

/** One row of the transition table. `guards` documents the checks the
 * operation's validator enforces (data, not scattered conditionals). */
export interface TransitionRule {
  op: LifecycleOperation;
  /** Legal source states. Empty ONLY for `generate` — a creation operation
   * with no source bundle. */
  from: readonly LifecycleState[];
  to: LifecycleState;
  description: string;
  guards: readonly string[];
  /** Human-readable refusal for an illegal source state; must name the
   * transition and the offending state so every rejection is actionable. */
  refuse: (from: SpecState) => string;
}

/** Per-state extra guidance when freeze is refused (keyed by the offending
 * state) — each names the legal way forward. */
const FREEZE_REFUSAL_HINTS: Record<SpecState, string> = {
  draft: '',
  frozen:
    'a frozen spec cannot be re-frozen: either restore the drifted sections to ' +
    'the pinned hashes (lco verify) or record the edit as a changeset (lco change), ' +
    "which bumps spec_version and returns the spec to 'draft'",
  blocked:
    'a blocked spec carries unresolved material and can never be frozen; ' +
    'resolve the blockers first',
  superseded: 'a superseded spec is archived and terminal',
  reviewed:
    "state 'reviewed' is not part of the spec lifecycle (legal states: " +
    'draft, frozen, blocked, superseded)',
};

/**
 * THE transition table. Exactly one row per operation:
 *
 *   generate: (creation) -> draft   a fresh spec is ALWAYS a v1 draft with the
 *                                   requested complexity_profile and no freeze
 *                                   residue; version advance happens only via
 *                                   change (see validateGenerationOutput).
 *   freeze:   draft -> frozen       lint-clean, zero counters, no UNRESOLVED
 *                                   decision, clean provenance; spec_version
 *                                   is UNCHANGED by freezing.
 *   change:   frozen -> draft       the ONLY version advancer (+1, via the
 *                                   strict ChangeSet envelope).
 *
 * `blocked` and `superseded` have no outgoing row on purpose: they are
 * terminal. Future operations (e.g. an explicit supersede) extend this table
 * — they must not grow side-door conditionals elsewhere.
 */
export const LIFECYCLE_TRANSITIONS: readonly TransitionRule[] = [
  {
    op: 'generate',
    from: [],
    to: 'draft',
    description: 'Generation creates a brand-new spec: always a draft at version 1.',
    guards: [
      "manifest.state === 'draft'",
      'manifest.complexity_profile === the requested profile',
      'manifest.spec_version === 1',
      'no frozen_at, empty artifact_hashes (freeze stamps those, never generation)',
    ],
    refuse: (from) =>
      `generation output must be a fresh draft: manifest.state is '${from}', ` +
      `expected 'draft' (generation only creates a draft; freezing is a ` +
      'separate, later step — lco freeze)',
  },
  {
    op: 'freeze',
    from: ['draft'],
    to: 'frozen',
    description: 'Freeze pins a clean draft; it never advances the version.',
    guards: [
      'lint reports zero errors',
      'manifest.unresolved_count === 0 and manifest.blocking_count === 0',
      "no decision with status 'UNRESOLVED'",
      'no frozen_at residue on the draft',
      'version provenance is coherent (v1 draft carries no hashes; a v>1 draft carries the prior freeze\'s pinned hashes)',
    ],
    refuse: (from) => {
      const hint = FREEZE_REFUSAL_HINTS[from];
      const base =
        `freeze is legal only from 'draft' (transition: freeze — draft -> ` +
        `frozen); current state is '${from}'`;
      return hint ? `${base} — ${hint}` : base;
    },
  },
  {
    op: 'change',
    from: ['frozen'],
    to: 'draft',
    description: 'A changeset is the only way out of frozen and the only version advancer (+1).',
    guards: [
      'the changeset passes the strict ChangeSetSchema envelope (unknown keys rejected)',
      'spec_version advances by exactly +1',
      "the result returns to 'draft' and frozen_at is removed",
    ],
    refuse: (from) =>
      `only a frozen spec can be changed (transition: change — frozen -> ` +
      `draft); current state is '${from}'`,
  },
];

/**
 * Pure table lookup: may `op` start from `from`? The ok-branch returns the
 * matched rule; the fail-branch returns the rule's actionable refusal.
 */
export function checkTransition(
  op: Exclude<LifecycleOperation, 'generate'>,
  from: SpecState,
): { ok: true; rule: TransitionRule } | { ok: false; reason: string } {
  const rule = LIFECYCLE_TRANSITIONS.find((t) => t.op === op);
  if (!rule) {
    return { ok: false, reason: `unknown lifecycle operation '${op}'` };
  }
  if (!rule.from.includes(from as LifecycleState)) {
    return { ok: false, reason: rule.refuse(from) };
  }
  return { ok: true, rule };
}

// ---------------------------------------------------------------------------
// State-internal consistency (no operation context) — feeds L08
// ---------------------------------------------------------------------------

export type LifecycleFindingCode =
  | 'STATE_NOT_IN_LIFECYCLE'
  | 'BLOCKED_UNSUBSTANTIATED'
  | 'FROZEN_AT_MISSING'
  | 'FROZEN_AT_STALE';

export interface LifecycleFinding {
  code: LifecycleFindingCode;
  message: string;
}

/**
 * Consistency of a manifest's denormalized lifecycle fields WITH itself —
 * facts checkable without knowing which operation is being attempted:
 *
 *   - the state must be one of the four lifecycle states ('reviewed' is not);
 *   - a 'blocked' claim must be substantiated (a counter or an UNRESOLVED
 *     decision exists) — a blocked manifest with zero counters used to lint
 *     clean and freeze (audit BACK-002 (b));
 *   - frozen_at exists exactly on frozen manifests (freeze always stamps it,
 *     change always removes it).
 *
 * L08 surfaces these under its own rule id; freeze re-checks the residue
 * facts directly so a caller-supplied lint result cannot bypass them.
 */
export function lifecycleStateFindings(b: SpecBundle): LifecycleFinding[] {
  const findings: LifecycleFinding[] = [];
  const state = b.manifest.state;

  if (!(LIFECYCLE_STATES as readonly string[]).includes(state)) {
    findings.push({
      code: 'STATE_NOT_IN_LIFECYCLE',
      message:
        `manifest.state '${state}' is not part of the spec lifecycle ` +
        `(legal states: ${LIFECYCLE_STATES.join(', ')})`,
    });
    return findings; // the remaining checks assume a lifecycle state
  }

  if (state === 'blocked') {
    const hasMaterial =
      b.manifest.unresolved_count > 0 ||
      b.manifest.blocking_count > 0 ||
      b.decisions.some((d) => d.status === 'UNRESOLVED');
    if (!hasMaterial) {
      findings.push({
        code: 'BLOCKED_UNSUBSTANTIATED',
        message:
          "manifest.state is 'blocked' but no unresolved material exists " +
          '(unresolved_count=0, blocking_count=0, no decision has status ' +
          "'UNRESOLVED') — a blocked spec must carry the evidence for its block",
      });
    }
  }

  if (state === 'frozen' && b.manifest.frozen_at === undefined) {
    findings.push({
      code: 'FROZEN_AT_MISSING',
      message:
        "manifest.state is 'frozen' but frozen_at is missing — only freeze " +
        "sets state 'frozen', and it always stamps frozen_at",
    });
  }
  if (state !== 'frozen' && b.manifest.frozen_at !== undefined) {
    findings.push({
      code: 'FROZEN_AT_STALE',
      message:
        `manifest.frozen_at is set but manifest.state is '${state}' — ` +
        'frozen_at survives only on frozen manifests (a changeset removes it)',
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Operation validators — every mutating surface calls THESE
// ---------------------------------------------------------------------------

/**
 * The freeze precondition (transition + guards). Returns every violated
 * condition as a human-readable reason; an empty array means freezing is
 * legal. `freeze()` delegates entirely to this — it adds no gates of its own.
 *
 * The caller-supplied `lint` result is honored for the lint gate but is NOT
 * trusted for transition legality: the state, residue, and provenance checks
 * below run on the bundle itself, so a stale/hand-built lint result cannot
 * smuggle an illegal transition through.
 */
export function validateFreeze(b: SpecBundle, lint: LintResult): string[] {
  const reasons: string[] = [];

  // --- transition legality (the state machine itself) ------------------------
  const transition = checkTransition('freeze', b.manifest.state);
  if (!transition.ok) {
    reasons.push(`lifecycle gate failed: ${transition.reason}`);
  }

  // --- freeze residue: a freezable draft must not claim to have been frozen -
  if (b.manifest.state !== 'frozen' && b.manifest.frozen_at !== undefined) {
    reasons.push(
      `lifecycle gate failed: manifest.frozen_at is set but manifest.state is ` +
        `'${b.manifest.state}' — frozen_at survives only on frozen manifests ` +
        '(a changeset removes it); clear the stale stamp before freezing',
    );
  }

  // --- classic quality gates (unchanged semantics, now table-owned) ---------
  if (lint.errors.length > 0) {
    const details = lint.errors
      .map((f) => `${f.rule} at ${f.path || '<root>'}: ${f.message}`)
      .join('; ');
    reasons.push(
      `lint gate failed: ${lint.errors.length} lint error(s) must be resolved before freeze (${details})`,
    );
  }

  if (b.manifest.unresolved_count !== 0) {
    reasons.push(
      `unresolved gate failed: manifest.unresolved_count is ${b.manifest.unresolved_count}, must be 0`,
    );
  }

  if (b.manifest.blocking_count !== 0) {
    reasons.push(
      `blocking gate failed: manifest.blocking_count is ${b.manifest.blocking_count}, must be 0`,
    );
  }

  const unresolvedDecisions = b.decisions
    .filter((d) => d.status === 'UNRESOLVED')
    .map((d) => d.claim_id);
  if (unresolvedDecisions.length > 0) {
    reasons.push(
      `decision gate failed: ${unresolvedDecisions.length} decision(s) still have status 'UNRESOLVED' (` +
        `${unresolvedDecisions.join(', ')}); resolve or reject them before freezing`,
    );
  }

  // --- version provenance: version advance is tied to the change envelope ---
  // In-product writers produce exactly two draft shapes: (v1, empty hashes)
  // from init/generate, and (v+1, prior freeze's hashes) from change.
  // Anything else is a hand-edited version field: refuse to bless it.
  // (Evaluated only for a legal freeze SOURCE — when the transition itself is
  // refused, that refusal is the complete and correct diagnosis.)
  if (transition.ok) {
    const pinnedCount = Object.keys(b.manifest.artifact_hashes).length;
    if (b.manifest.spec_version === 1 && pinnedCount > 0) {
      reasons.push(
        `provenance gate failed: spec_version is 1 but manifest.artifact_hashes has ` +
          `${pinnedCount} pinned entries — a v1 draft is written by init/generate ` +
          'with empty hashes; only freeze pins them, and a frozen v1 must go ' +
          'through a changeset (not a hand-edit) to become freezable again',
      );
    }
    if (b.manifest.spec_version > 1 && pinnedCount === 0) {
      reasons.push(
        `provenance gate failed: spec_version is ${b.manifest.spec_version} (> 1) but ` +
          'manifest.artifact_hashes is empty — versions advance only via a ' +
          'changeset applied to a frozen spec (lco change), which preserves the ' +
          "prior freeze's pinned hashes on the returned draft",
      );
    }
  }

  return reasons;
}

/**
 * The change precondition: the change transition is `frozen -> draft` ONLY.
 * `applyChangeSet` delegates its source-state check to this function.
 */
export function validateChangeSource(b: SpecBundle): string[] {
  const transition = checkTransition('change', b.manifest.state);
  return transition.ok ? [] : [`lifecycle gate failed: ${transition.reason}`];
}

/**
 * The generation output contract (audit BACK-002 (a) and (d)): a generated
 * bundle is ALWAYS a fresh draft — state 'draft', the requested profile,
 * spec_version 1, no freeze residue. Called by the pipeline's final bundle
 * gate (eval/runner) and again by cmdGenerate as defense in depth.
 */
export function validateGenerationOutput(
  b: SpecBundle,
  requestedProfile: ComplexityProfile,
): string[] {
  const reasons: string[] = [];
  const m = b.manifest;

  if (m.state !== 'draft') {
    const refusal = LIFECYCLE_TRANSITIONS.find((t) => t.op === 'generate')!.refuse(m.state);
    reasons.push(`lifecycle gate failed: ${refusal}`);
  }

  if (m.complexity_profile !== requestedProfile) {
    reasons.push(
      `lifecycle gate failed: generated manifest.complexity_profile is ` +
        `'${m.complexity_profile}' but the requested profile is ` +
        `'${requestedProfile}' — a generated spec must match the profile it ` +
        'was generated for',
    );
  }

  if (m.spec_version !== 1) {
    reasons.push(
      `lifecycle gate failed: generated manifest.spec_version is ${m.spec_version}, ` +
        'must be 1 — a new spec starts at v1 and versions advance only through ' +
        'a changeset (lco change)',
    );
  }

  if (m.frozen_at !== undefined) {
    reasons.push(
      `lifecycle gate failed: generated manifest must not carry frozen_at ` +
        `(only freeze stamps it), got '${m.frozen_at}'`,
    );
  }

  const pinnedCount = Object.keys(m.artifact_hashes).length;
  if (pinnedCount > 0) {
    reasons.push(
      `lifecycle gate failed: generated manifest.artifact_hashes must be empty ` +
        `(hashes are pinned by freeze, never by generation), got ` +
        `${pinnedCount} entr${pinnedCount === 1 ? 'y' : 'ies'}`,
    );
  }

  return reasons;
}
