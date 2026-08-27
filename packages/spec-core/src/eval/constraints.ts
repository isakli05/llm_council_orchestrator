import type { SpecBundle } from '../schemas';
import { normalizeForTermMatch } from './score';
import type { EvalTask, ConstraintTraceAssertion, IntentConstraint, NumericOperator } from './tasks';

/**
 * CONSTRAINT-TRACE checker (RESIDUAL PROD-003): the deterministic semantic
 * gate that replaces plain term-presence scoring.
 *
 * DESIGN (why this shape): the old MENTIONS_TERMS check asked "does the term
 * appear ANYWHERE in the bundle body?" — so a keyword dump in a task
 * instruction, or a glossary definition echoing the vocabulary, passed. The
 * new model asks "is the constraint GROUNDED in the artifact layer that
 * implements it?":
 *
 *   requirement statement  ->  task that references it  ->  test case on that
 *   task naming the constraint  ->  judgeable verification (exit-code expect)
 *
 * Glossary prose, decision rationale, and the bundle's own `intent.statement`
 * echo are deliberately NOT grounding surfaces (a bundle that quotes the
 * intent at itself has encoded nothing). Numeric constraints additionally
 * pin the declared VALUE (as a standalone token in at least one anchor
 * sentence) and the declared DIRECTION over EVERY anchor sentence of the
 * grounding requirement — not only the value-containing sentence (I-3a,
 * 2026-08-27 review): the relation scope is every sentence of the anchor
 * requirement that carries ALL of the constraint's anchor terms, so a
 * sibling sentence in the same requirement that re-states the unit with a
 * foreign wrong-side number ("under 300 ms. Bursts may take up to 5000 ms.")
 * is a violation. An intent-named number escapes that check only when the
 * intent itself expresses it in the SAME unit context (I-3b): a number
 * immediately followed by one of the constraint's non-digit anchor terms in
 * the intent text. Digit-anchored constraints (terms like '7', where the
 * term IS the value) keep the full intent-number allowlist — the anchor
 * token already pins the sentence. Forbidden inventions are enforced as
 * ABSENCE from the bundle's commitment surfaces (glossary terms, decision
 * statements, task titles) with UNICODE WORD-BOUNDARY matching (I-4): 'rest'
 * does not match 'restores', 'api' does not match 'rapid', 'http' does not
 * match inside 'https' — HTTPS is therefore out of scope for the 'http'
 * forbidden term unless a list names 'https' explicitly; derived forms
 * (plurals like 'WebSockets') are likewise out of scope unless listed. EXPLICIT
 * forbidden lists exist on ET-01/ET-02 ONLY; on the other greenfield tasks
 * inventions are ADVISORY (never gated — see advisoryInventions in score.ts).
 * A negative requirement ("must make no HTTP calls") lives in requirement
 * prose and does not trip the forbidden check.
 *
 * Honest limitations, stated here and in the pre-registration: this is a
 * structural grounding gate, not prose comprehension. A determined adversary
 * can fabricate a complete fake trace (requirement + task + test + exit-code
 * verification, all keyword-shaped); a prose operator flip that keeps every
 * digit ("under 300 ms" -> "at least 300 ms") is indistinguishable from the
 * faithful sentence without NLP; and substring candidacy cannot read
 * POLARITY or clause structure — a NEGATED or unrelated-clause mention in a
 * well-shaped requirement chain ("shall make no use of sqlite") grounds a
 * constraint just as faithfully-shaped prose would (I-5). What the gate DOES
 * close: glossary echo, instruction dumps, intent echo, untraced
 * requirements, prose-only verification, off-value and re-scaled numeric
 * bounds (including sibling-sentence re-scaling and foreign-unit intent
 * numbers), and invented architecture on the commitment surfaces of the two
 * tasks that forbid inventions. Blinded live runs and human review remain
 * the only evidence for semantics beyond that.
 */

/** Why a constraint (or the forbidden list) failed — rendered by the report. */
export type ConstraintFailureCode =
  | 'NOT_GROUNDED_IN_REQUIREMENT'
  | 'NO_COVERING_TASK'
  | 'NO_RELATED_TEST'
  | 'NO_JUDGEABLE_VERIFICATION'
  | 'NUMERIC_VALUE_MISSING'
  | 'NUMERIC_RELATION_VIOLATED'
  | 'FORBIDDEN_PRESENT';

export interface ConstraintFailure {
  /** The constraint id ('C1'..) or 'FORBIDDEN' for forbidden-list hits. */
  constraint: string;
  code: ConstraintFailureCode;
  /** Short human-readable evidence: the term, the offending number, the surface. */
  detail: string;
}

/**
 * Term matching, token-aware for pure-digit terms: '7' must appear as a
 * standalone number (not inside '17', 'C7', or '007'); every other term is a
 * normalized substring match (case-folded, combining marks stripped, so
 * 'PostgreSQL'/'postgresql' and 'İstanbul'/'Istanbul' agree). `text` may be
 * raw or pre-normalized; it is normalized here idempotently.
 */
export function containsTerm(text: string, term: string): boolean {
  const hay = normalizeForTermMatch(text);
  const needle = normalizeForTermMatch(term);
  if (/^\d+$/.test(needle)) {
    return new RegExp(`(^|[^a-z0-9])${needle}([^a-z0-9]|$)`).test(hay);
  }
  return hay.includes(needle);
}

/**
 * FORBIDDEN-list matching (I-4, 2026-08-27 review): unicode word-boundary
 * aware — the term must appear as a whole word (no adjacent letter/number on
 * either side), so 'rest' does NOT match 'restores', 'api' does NOT match
 * 'rapid', and 'http' does NOT match inside 'https' (documented rule:
 * HTTPS is out of scope for the 'http' forbidden term unless a list names
 * 'https' explicitly). Derived forms (plurals like 'WebSockets' for
 * 'websocket') are likewise out of scope unless listed. Pure-digit terms
 * reuse the standalone-number-token rule from containsTerm.
 */
export function containsWholeTerm(text: string, term: string): boolean {
  const hay = normalizeForTermMatch(text);
  const needle = normalizeForTermMatch(term);
  if (needle.length === 0) return false;
  if (/^\d+$/.test(needle)) {
    return new RegExp(`(^|[^a-z0-9])${needle}([^a-z0-9]|$)`).test(hay);
  }
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(hay);
}

/**
 * Sentence segmentation for numeric anchor scoping: '.', '!', '?', ';', ':'
 * and newlines terminate a sentence UNLESS the period is a digit separator
 * (Turkish thousands: '50.000' stays one token — a period between digits
 * with no following whitespace is not a boundary).
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?:[.!?;:\n]|\.(?=\s))+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** All standalone number tokens in a text ('50.000' -> [50, 0] by digit runs). */
function numbersIn(text: string): number[] {
  const norm = normalizeForTermMatch(text);
  return [...norm.matchAll(/\d+/g)].map((m) => Number.parseInt(m[0]!, 10));
}

/**
 * The intent's own numeric quantities — ground truth for numeric direction
 * checks. Grouped separators are handled both ways ('50.000' yields 50, 0
 * AND 50000; '09:00' yields 9, 0 and 900) so an honest spec restating an
 * intent number in either notation never trips the direction rule.
 */
export function intentNumericAllowlist(intent: string): Set<number> {
  const norm = normalizeForTermMatch(intent);
  const out = new Set<number>();
  for (const grouped of norm.matchAll(/\d+(?:[.,:]\d+)*/g)) {
    expandNumberToken(grouped[0]!, out);
  }
  return out;
}

/** Expand one numeric token both ways: de-grouped integer AND each digit run ('50.000' → {50000, 50, 0}). */
function expandNumberToken(raw: string, out: Set<number>): void {
  out.add(Number.parseInt(raw.replace(/[.,:]/g, ''), 10));
  for (const part of raw.matchAll(/\d+/g)) out.add(Number.parseInt(part[0]!, 10));
}

/** The constraint's non-digit anchor terms — its UNIT context ('ms', 'mb', ...). Empty = digit-anchored. */
function unitAnchorTerms(constraint: IntentConstraint): string[] {
  return constraint.terms.filter((t) => !/^\d+$/.test(normalizeForTermMatch(t)));
}

/**
 * I-3b (2026-08-27 review): the allowlist a numeric constraint actually
 * gets. UNIT-ANCHORED constraints (a non-digit anchor term like 'ms')
 * allowlist only numbers the intent itself expresses in that unit — a number
 * token immediately followed by a unit anchor term (up to 3 non-alphanumeric
 * characters, e.g. a space or a Turkish suffix apostrophe, may sit between):
 * ET-07's "500 connections" does not rescue "degrading to 500 ms". DIGIT-
 * ANCHORED constraints (terms like '7', where the term IS the value) keep
 * the FULL intent allowlist — the anchor token already pins the sentence.
 */
function intentAllowlistFor(intent: string, constraint: IntentConstraint): Set<number> {
  const units = unitAnchorTerms(constraint);
  if (units.length === 0) return intentNumericAllowlist(intent);
  const norm = normalizeForTermMatch(intent);
  const out = new Set<number>();
  for (const unit of units) {
    const escaped = normalizeForTermMatch(unit).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const adjacent = new RegExp(`(\\d+(?:[.,:]\\d+)*)[^\\p{L}\\p{N}]{0,3}${escaped}`, 'gu');
    for (const m of norm.matchAll(adjacent)) expandNumberToken(m[1]!, out);
  }
  return out;
}

function relationHolds(m: number, op: NumericOperator, value: number): boolean {
  switch (op) {
    case '<': return m < value;
    case '<=': return m <= value;
    case '>': return m > value;
    case '>=': return m >= value;
    case '==': return m === value;
  }
}

/**
 * The commitment surfaces where a forbidden invention becomes first-class:
 * glossary terms, decision statements, and task titles. Deliberately NOT
 * requirements/rationale/alternatives — a faithful negative mention ("must
 * make no HTTP calls", "rejected: an HTTP sync server") lives there.
 */
export function commitmentSurfaces(bundle: SpecBundle): { surface: string; text: string }[] {
  return [
    ...bundle.glossary.map((g) => ({ surface: `glossary '${g.term}'`, text: g.term })),
    ...bundle.decisions.map((d) => ({ surface: `decision '${d.claim_id}'`, text: d.decision })),
    ...bundle.tasks.map((t) => ({ surface: `task title '${t.task_id}'`, text: t.title })),
  ];
}

/** An `expect` is judgeable when it states an exit code (the L14 contract) with a real command. */
function isJudgeable(command: string, expect: string): boolean {
  return /\bexit\s+\d+\b/i.test(expect) && command.trim().length >= 3;
}

/**
 * Sentences of a statement that contain every anchor term (normalized,
 * token-aware for digit terms) — the numeric relation's scope.
 */
function anchorSentences(statement: string, terms: string[]): string[] {
  return splitSentences(statement).filter((s) => terms.every((t) => containsTerm(s, t)));
}

/**
 * Evaluate one constraint against one candidate grounding requirement (the
 * caller has already checked the requirement's statement carries every term).
 * Returns the failure for THIS candidate at the deepest stage it reached, or
 * null when this candidate grounds the constraint end-to-end.
 */
function evaluateCandidate(
  constraint: IntentConstraint,
  req: SpecBundle['requirements'][number],
  bundle: SpecBundle,
  allowlist: Set<number>,
): ConstraintFailure | null {
  const statement = req.statement;

  const covering = bundle.tasks.filter((t) => t.refs.requirements.includes(req.id));
  if (covering.length === 0) {
    return { constraint: constraint.id, code: 'NO_COVERING_TASK', detail: `${req.id} carries the terms but no task references it` };
  }

  const relatedTest = covering.some((t) =>
    t.tests.some((x) => x.cases.some((c) => constraint.terms.some((term) => containsTerm(c, term)))),
  );
  if (!relatedTest) {
    return { constraint: constraint.id, code: 'NO_RELATED_TEST', detail: `no test case on the task(s) covering ${req.id} names any of [${constraint.terms.join(', ')}]` };
  }

  const judgeable = covering.some((t) => t.verification.some((v) => isJudgeable(v.command, v.expect)));
  if (!judgeable) {
    return { constraint: constraint.id, code: 'NO_JUDGEABLE_VERIFICATION', detail: `the task(s) covering ${req.id} carry no verification with an exit-code expect` };
  }

  if (constraint.numeric) {
    const { operator, value } = constraint.numeric;
    // Relation scope (I-3a): EVERY sentence of the anchor requirement that
    // carries all anchor terms — the unit travels with the terms, so a
    // sibling sentence re-stating the unit with a foreign wrong-side number
    // is checked, not just the sentence that carries the declared value.
    const sentences = anchorSentences(statement, constraint.terms);
    const withValue = sentences.filter((s) => numbersIn(s).includes(value));
    if (withValue.length === 0) {
      return {
        constraint: constraint.id,
        code: 'NUMERIC_VALUE_MISSING',
        detail: `declared ${operator} ${value} but no anchor sentence in ${req.id} carries the value as a number`,
      };
    }
    for (const s of sentences) {
      for (const m of numbersIn(s)) {
        const allowed = m === value || relationHolds(m, operator, value) || allowlist.has(m);
        if (!allowed) {
          return {
            constraint: constraint.id,
            code: 'NUMERIC_RELATION_VIOLATED',
            detail: `number ${m} in "${s}" contradicts declared ${operator} ${value} (the intent never names ${m} in this constraint's unit context)`,
          };
        }
      }
    }
  }

  return null; // fully grounded through this candidate
}

const STAGE_ORDER: Record<ConstraintFailureCode, number> = {
  NOT_GROUNDED_IN_REQUIREMENT: 0,
  NO_COVERING_TASK: 1,
  NO_RELATED_TEST: 2,
  NO_JUDGEABLE_VERIFICATION: 3,
  NUMERIC_VALUE_MISSING: 4,
  NUMERIC_RELATION_VIOLATED: 5,
  FORBIDDEN_PRESENT: 0,
};

/**
 * Check a whole CONSTRAINT_TRACE assertion against a bundle. A constraint
 * passes when ANY requirement grounds it end-to-end; when none does, the
 * failure of the DEEPEST stage reached across candidates is reported (so the
 * operator sees "the trace broke at the test step", not a misleading
 * "nothing grounded" for a requirement that was one step short).
 */
export function checkConstraintTrace(
  task: EvalTask,
  assertion: ConstraintTraceAssertion,
  bundle: SpecBundle,
): ConstraintFailure[] {
  const failures: ConstraintFailure[] = [];

  for (const constraint of assertion.constraints) {
    let best: ConstraintFailure | null = {
      constraint: constraint.id,
      code: 'NOT_GROUNDED_IN_REQUIREMENT',
      detail: `no requirement statement carries [${constraint.terms.join(', ')}] (glossary/decision/instruction text does not count)`,
    };
    // I-3b: the intent allowlist is scoped per constraint (unit-anchored
    // constraints only allowlist intent numbers expressed in their unit).
    const allowlist = intentAllowlistFor(task.intent, constraint);
    for (const req of bundle.requirements) {
      // candidacy: the requirement STATEMENT itself carries every anchor term
      if (!constraint.terms.every((t) => containsTerm(req.statement, t))) continue;
      const failure = evaluateCandidate(constraint, req, bundle, allowlist);
      if (failure === null) {
        best = null;
        break; // grounded end-to-end through this requirement
      }
      if (STAGE_ORDER[failure.code] > STAGE_ORDER[best.code]) best = failure;
    }
    if (best !== null) failures.push(best);
  }

  // I-4: word-boundary matching — substring collisions ('rest' in 'restores',
  // 'api' in 'rapid', 'http' in 'https') must not false-fail honest specs.
  for (const term of assertion.forbidden ?? []) {
    for (const s of commitmentSurfaces(bundle)) {
      if (containsWholeTerm(s.text, term)) {
        failures.push({
          constraint: 'FORBIDDEN',
          code: 'FORBIDDEN_PRESENT',
          detail: `forbidden invention '${term}' present on commitment surface ${s.surface}`,
        });
        break; // one hit per term is enough to fail loudly and say why
      }
    }
  }

  return failures;
}

/** All constraints of a trace, as NOT_GROUNDED (used for blocked outcomes, where no bundle exists). */
export function allUnGrounded(assertion: ConstraintTraceAssertion): ConstraintFailure[] {
  return assertion.constraints.map((c) => ({
    constraint: c.id,
    code: 'NOT_GROUNDED_IN_REQUIREMENT' as const,
    detail: `outcome blocked — no bundle exists to ground [${c.terms.join(', ')}]`,
  }));
}
