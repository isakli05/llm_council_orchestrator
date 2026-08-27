import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scoreRun, normalizeForTermMatch, searchableBundleText } from './score';
import { runPipeline } from './runner';
import { createMockLlm } from './llm/mock';
import type { MockScript } from './llm/mock';
import { renderGateReport, buildMockScripts } from './report';
import type { GateReportInput } from './report';
import { EVAL_TASKS } from './tasks';
import type { EvalTask, EvalTaskId } from './tasks';
import type { SpecBundle } from '../schemas';

/**
 * PROD-003 (T12): intent-fidelity assertions. The old rubric scored structural
 * validity only — a generic good fixture re-intented for any task passed every
 * assertion. These tests pin the NEW contract:
 *
 *  - every greenfield task names concrete constraints (MENTIONS_TERMS) that a
 *    structurally valid but unfaithful bundle CANNOT satisfy;
 *  - the raw good fixtures do not satisfy any task's term set (generic fixture
 *    cannot score);
 *  - one fixture badged for one intent passes AT MOST that intent;
 *  - underspecified intents that a model "resolves" by invention fail the
 *    blocking assertions at eval level (non-invention);
 *  - repeated runs aggregate with spread; unknown usage anywhere blocks the
 *    cost verdict;
 *  - G4 is computed over intent-fidelity-passing runs only, honestly labeled.
 */

const NOW = '2026-08-18T12:00:00Z';
const FIXTURES = join(__dirname, '../../fixtures/good');

function loadFixture(name: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, name, 'bundle.json'), 'utf8')) as SpecBundle;
}

function task(id: EvalTaskId): EvalTask {
  const t = EVAL_TASKS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown task ${id}`);
  return t;
}

function greenfield(): EvalTask[] {
  return EVAL_TASKS.filter((t) => t.kind === 'greenfield');
}

/** Today's pre-T12 mock derivation, kept as the ADVERSARIAL generic bundle: a raw
 * good fixture with only intent/project/profile swapped — structurally valid,
 * lint-clean, and totally unfaithful to the new intent. */
function genericBundleFor(t: EvalTask, fixture: SpecBundle): SpecBundle {
  const b = structuredClone(fixture);
  b.intent = { statement: t.intent, normalized: t.intent.slice(0, 80) };
  b.manifest.project = { name: `eval-${t.id.toLowerCase()}`, mode: 'greenfield' };
  b.manifest.complexity_profile = t.profile;
  return b;
}

/** The bundle the intent's own text names: badge the generic bundle with the
 * task's MENTIONS_TERMS vocabulary (mirrors what an honest model output does —
 * carries the named constraints into the spec body). */
function badgeTerms(b: SpecBundle, terms: string[]): SpecBundle {
  const out = structuredClone(b);
  out.tasks[0]!.instructions += ` Intent constraints honored verbatim: ${terms.join(', ')}.`;
  return out;
}

function mentionsTermsOf(t: EvalTask): string[] {
  const a = t.assertions.find((x) => x.type === 'MENTIONS_TERMS') as { terms: string[] } | undefined;
  return a ? a.terms : [];
}

const U = { in: 10, out: 5, calls: 1 };

// ---------------------------------------------------------------------------
// Term matching normalization
// ---------------------------------------------------------------------------

describe('normalizeForTermMatch', () => {
  it('folds case so JWT matches jwt', () => {
    expect(normalizeForTermMatch('JWT')).toBe(normalizeForTermMatch('jwt'));
  });

  it('strips Turkish combining marks so İstanbul matches Istanbul', () => {
    expect(normalizeForTermMatch('İstanbul')).toBe(normalizeForTermMatch('Istanbul'));
  });

  it('collapses interior whitespace so terms wrapped across lines still match', () => {
    expect(normalizeForTermMatch('Europe\n Istanbul')).toBe(normalizeForTermMatch('europe istanbul'));
    expect(normalizeForTermMatch('Europe  Istanbul')).toBe(normalizeForTermMatch('europe istanbul'));
  });
});

// ---------------------------------------------------------------------------
// Corpus soundness — the terms are grounded in the intent text itself
// ---------------------------------------------------------------------------

describe('MENTIONS_TERMS corpus soundness', () => {
  it('every greenfield task carries exactly one MENTIONS_TERMS assertion with >= 2 terms', () => {
    for (const t of greenfield()) {
      const mentions = t.assertions.filter((a) => a.type === 'MENTIONS_TERMS');
      expect(mentions, t.id).toHaveLength(1);
      const terms = (mentions[0] as { terms: string[] }).terms;
      expect(terms.length, `${t.id} needs >= 2 terms`).toBeGreaterThanOrEqual(2);
      expect(new Set(terms).size, `${t.id} terms must be unique`).toBe(terms.length);
    }
  });

  it('every term is literally named by its own intent (the bundle is never asked for something the intent did not say)', () => {
    for (const t of greenfield()) {
      const intent = normalizeForTermMatch(t.intent);
      for (const term of mentionsTermsOf(t)) {
        expect(intent, `${t.id}: term '${term}' must appear in the intent`).toContain(
          normalizeForTermMatch(term),
        );
      }
    }
  });

  it('no raw good fixture satisfies ANY greenfield task term set (a generic fixture cannot score)', () => {
    const poolOf = (t: EvalTask) =>
      (t.profile === 'p-mini' ? ['embed-cli', 'pet-clinic'] : ['session-service', 'todo-api']) as const;
    for (const t of greenfield()) {
      for (const name of poolOf(t)) {
        const text = normalizeForTermMatch(searchableBundleText(loadFixture(name)));
        const missing = mentionsTermsOf(t).filter(
          (term) => !text.includes(normalizeForTermMatch(term)),
        );
        expect(
          missing.length,
          `${t.id}: fixture ${name} unexpectedly satisfies the full term set`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('blocked tasks carry no MENTIONS_TERMS (no bundle exists to check — their fidelity IS the block)', () => {
    for (const t of EVAL_TASKS.filter((x) => x.must_be_blocked)) {
      expect(t.assertions.filter((a) => a.type === 'MENTIONS_TERMS')).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Scoring: faithful vs unfaithful bundles
// ---------------------------------------------------------------------------

describe('scoreRun — MENTIONS_TERMS / structural vs intent split', () => {
  it('a faithful bundle (terms carried) passes intent assertions: intentPassed and structuralPassed both true', () => {
    const t = task('ET-07');
    const bundle = badgeTerms(genericBundleFor(t, loadFixture('todo-api')), mentionsTermsOf(t));
    const outcome = { kind: 'spec' as const, variant: 'single' as const, bundle, usage: U };
    const s = scoreRun(t, outcome, U);
    expect(s.assertionsPassed).toBe(s.assertionsTotal);
    expect(s.structuralPassed).toBe(true);
    expect(s.intentPassed).toBe(true);
    expect(s.missingTerms).toEqual([]);
  });

  it('the SAME generic bundle structurally valid but unfaithful: structuralPassed true, intentPassed FALSE, missing terms named', () => {
    const t = task('ET-07');
    const bundle = genericBundleFor(t, loadFixture('todo-api')); // no badge
    const outcome = { kind: 'spec' as const, variant: 'single' as const, bundle, usage: U };
    const s = scoreRun(t, outcome, U);
    // structure holds: 4 requirements, acyclic, verified, traced
    expect(s.structuralPassed).toBe(true);
    // intent fidelity fails: jwt/postgresql never carried
    expect(s.intentPassed).toBe(false);
    expect(s.missingTerms.length).toBeGreaterThan(0);
    expect(s.missingTerms.every((m) => mentionsTermsOf(t).includes(m))).toBe(true);
  });

  it('the bundle\'s own intent echo does NOT satisfy the terms (intent.statement is excluded from searchable text)', () => {
    const t = task('ET-01');
    const bundle = genericBundleFor(t, loadFixture('pet-clinic'));
    // intent.statement now contains the full Turkish intent naming sqlite/shorten/resolve —
    // 'shorten' appears NOWHERE in pet-clinic's body text, only in the echoed intent
    const text = normalizeForTermMatch(searchableBundleText(bundle));
    expect(text).not.toContain(normalizeForTermMatch('shorten'));
    const s = scoreRun(t, { kind: 'spec', variant: 'single', bundle, usage: U }, U);
    expect(s.missingTerms).toContain('shorten');
    expect(s.intentPassed).toBe(false);
  });

  it('blocked outcome on a greenfield task fails MENTIONS_TERMS (no bundle to carry constraints)', () => {
    const t = task('ET-01');
    const outcome = {
      kind: 'blocked' as const,
      variant: 'single' as const,
      reasons: ['L08_UNRESOLVED_LEAK [DEC-0001]: x'],
      usage: U,
    };
    const s = scoreRun(t, outcome, U);
    expect(s.intentPassed).toBe(false);
    expect(s.missingTerms).toEqual(mentionsTermsOf(t));
  });

  it('blocked tasks: a correctly blocked run is intentPassed (the block IS the fidelity)', () => {
    const t = task('ET-13');
    const outcome = {
      kind: 'blocked' as const,
      variant: 'single' as const,
      reasons: ['L08_UNRESOLVED_LEAK [DEC-0001]: x'],
      usage: U,
    };
    const s = scoreRun(t, outcome, U);
    expect(s.intentPassed).toBe(true);
    expect(s.structuralPassed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// THE PROD-003 pin: one fixture, two intents → passes at most its own
// ---------------------------------------------------------------------------

describe('generic fixture cross-intent pin', () => {
  it('one badged fixture passes its own intent and fails the other (both structurally valid)', () => {
    const et07 = task('ET-07');
    const et08 = task('ET-08');
    // one bundle, badged for ET-07's constraints only
    const bundle = badgeTerms(genericBundleFor(et07, loadFixture('todo-api')), mentionsTermsOf(et07));

    const own = scoreRun(et07, { kind: 'spec', variant: 'single', bundle, usage: U }, U);
    const foreign = scoreRun(et08, { kind: 'spec', variant: 'single', bundle, usage: U }, U);

    expect(own.intentPassed).toBe(true);
    expect(foreign.structuralPassed).toBe(true); // ET-08's structure checks still hold
    expect(foreign.intentPassed).toBe(false); // but it is NOT ET-08's spec
  });

  it('the raw (unbadged) fixture fails BOTH intents — structural validity alone scores nothing on intent', () => {
    const et07 = task('ET-07');
    const et08 = task('ET-08');
    const bundle = genericBundleFor(et07, loadFixture('todo-api'));
    for (const t of [et07, et08]) {
      const s = scoreRun(t, { kind: 'spec', variant: 'single', bundle, usage: U }, U);
      expect(s.structuralPassed).toBe(true);
      expect(s.intentPassed).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Adversarial, through the REAL pipeline (mock adapters — no live calls)
// ---------------------------------------------------------------------------

describe('adversarial: clean-but-unfaithful output must fail intent-fidelity, not pass', () => {
  it('a model returning a clean generic bundle for ET-01 yields a spec outcome the eval FAILS on intent', async () => {
    const t = task('ET-01');
    const bundle = genericBundleFor(t, loadFixture('pet-clinic'));
    const script: MockScript = {
      byTaskId: { [t.id]: [{ text: JSON.stringify(bundle), usage: { in_tokens: 10, out_tokens: 5 } }] },
    };
    const outcome = await runPipeline(t, 'single', createMockLlm(script, t.id), NOW);
    // the runner CANNOT know the bundle is unfaithful — it is schema+lint clean
    expect(outcome.kind).toBe('spec');
    // the EVAL is the layer that catches it
    const s = scoreRun(t, outcome, outcome.usage);
    expect(s.structuralPassed).toBe(true);
    expect(s.intentPassed).toBe(false);
    expect(s.blockedCorrectly).toBe(true);
    expect(s.missingTerms.length).toBeGreaterThan(0);
  });
});

describe('adversarial: invention temptation on underspecified intents', () => {
  it('ET-13 (underspecified) "resolved" by invention: clean fully-resolved bundle → eval marks the run wrong (non-invention pinned at eval level)', async () => {
    const t = task('ET-13');
    // a model that invents: takes a clean generic draft, resolves everything,
    // state draft, unresolved_count 0 — no UNRESOLVED anywhere
    const bundle = genericBundleFor(t, loadFixture('pet-clinic'));
    bundle.manifest.unresolved_count = 0;
    bundle.manifest.state = 'draft';
    const script: MockScript = {
      byTaskId: { [t.id]: [{ text: JSON.stringify(bundle), usage: { in_tokens: 10, out_tokens: 5 } }] },
    };
    const outcome = await runPipeline(t, 'single', createMockLlm(script, t.id), NOW);
    expect(outcome.kind).toBe('spec'); // the runner had no evidence to block: classifier output is inside the merged call
    const s = scoreRun(t, outcome, outcome.usage);
    expect(s.blockedCorrectly).toBe(false); // should have blocked
    expect(s.intentPassed).toBe(false); // inventing resolutions is not fidelity
    expect(s.structuralPassed).toBe(true); // and it IS structurally valid — the label split is the point
  });

  it('council: classifier honestly flags must_be_blocked, then the merger invents a clean resolution → the T5 monotonic gate blocks it (eval scores the block as correct)', async () => {
    const t = task('ET-13');
    const cleanInvented = genericBundleFor(t, loadFixture('pet-clinic'));
    cleanInvented.manifest.unresolved_count = 0;
    const scripts: MockScript = {
      byTaskId: {
        [t.id]: [
          { text: JSON.stringify({ profile: t.profile, must_be_blocked: true }), usage: { in_tokens: 5, out_tokens: 5 } },
          { text: JSON.stringify(cleanInvented), usage: { in_tokens: 10, out_tokens: 5 } },
          { text: JSON.stringify(cleanInvented), usage: { in_tokens: 10, out_tokens: 5 } },
        ],
      },
    };
    const outcome = await runPipeline(t, 'council', createMockLlm(scripts, t.id), NOW);
    expect(outcome.kind).toBe('blocked'); // monotonic block (T5) — the invention cannot erase it
    expect(outcome.reasons.some((r) => r.includes('BLOCKED_EARLIER_EVIDENCE'))).toBe(true);
    const s = scoreRun(t, outcome, outcome.usage);
    expect(s.blockedCorrectly).toBe(true);
    expect(s.intentPassed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Advisory inventions (secondary, never gated)
// ---------------------------------------------------------------------------

describe('advisory inventions — unmentioned first-class concepts', () => {
  it('a generic bundle\'s glossary concepts the intent never named are listed as advisory, not failures', () => {
    const t = task('ET-01');
    const bundle = genericBundleFor(t, loadFixture('pet-clinic')); // Owner/Appointment/Vaccination Record
    const s = scoreRun(t, { kind: 'spec', variant: 'single', bundle, usage: U }, U);
    expect(s.advisoryInventions).toEqual(
      expect.arrayContaining(['Owner', 'Appointment', 'Vaccination Record']),
    );
    // advisory alone never flips the verdict
    expect(s.intentPassed).toBe(false); // still false: terms missing
  });

  it('a bundle whose concepts all appear in the intent yields no advisory inventions', () => {
    const t = task('ET-01');
    const bundle = badgeTerms(genericBundleFor(t, loadFixture('pet-clinic')), mentionsTermsOf(t));
    // re-glossary to intent-named concepts only
    bundle.glossary = [
      { term: 'Short code', definition: 'A code produced by the shorten command.' },
    ];
    bundle.requirements.forEach((r) => {
      r.terms_used = ['Short code'];
    });
    const s = scoreRun(t, { kind: 'spec', variant: 'single', bundle, usage: U }, U);
    // 'short code' — intent says "kısa kod" (Turkish): transliteration mismatch IS advisory-visible...
    // the honest expectation: advisory reports it, because the intent never says "short code"
    expect(s.advisoryInventions).toEqual(['Short code']);
  });
});

// ---------------------------------------------------------------------------
// Repeated runs + uncertainty
// ---------------------------------------------------------------------------

describe('repeated runs (mock adapters are deterministic-by-construction)', () => {
  it('runMockEval with repeats=3 produces 120 runs with 1-based repeat ordinals and identical pass sets', async () => {
    const { runMockEval } = await import('./report');
    const evidence = await runMockEval({ repeats: 3 });
    expect(evidence.runs).toHaveLength(120);
    for (const t of EVAL_TASKS) {
      for (const variant of ['single', 'council'] as const) {
        const rs = evidence.runs.filter((r) => r.taskId === t.id && r.variant === variant);
        expect(rs.map((r) => r.repeat)).toEqual([1, 2, 3]);
      }
    }
  });

  it('the rendered report shows per-task pass-rates across repeats with mean/min/max spread', async () => {
    const { runMockEval, renderGateReport: render } = await import('./report');
    const evidence = await runMockEval({ repeats: 2 });
    const text = render({ ...evidence });
    expect(text).toContain('across repeats');
    // ET-01/single: 2 repeats, intent-pass 2/2 (the badged mock bundle is
    // faithful every repeat), full-pass may legitimately trail (the embed-cli
    // base fixture has fewer requirements than ET-01 demands — pre-existing,
    // structural) — spread columns present and consistent
    const row = text.split('\n').find((l) => l.startsWith('| ET-01 | single |'))!;
    expect(row).toMatch(/\| ET-01 \| single \| 2 \| \d+\/2 \| 2\/2 \| \d+\.\d \| \d+ \| \d+ \|/);
  });

  it('deterministic across repeats: two full mock evals render byte-identical reports', async () => {
    const { runMockEval, renderGateReport: render } = await import('./report');
    const a = render({ ...(await runMockEval({ repeats: 2 })) });
    const b = render({ ...(await runMockEval({ repeats: 2 })) });
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Complete usage across repeats + honest G4
// ---------------------------------------------------------------------------

function passInput(repeats = 1, live = true): GateReportInput {
  const { runEvalAll } = { runEvalAll: undefined }; // placeholder to keep imports tidy
  void runEvalAll;
  const runs = [];
  for (const t of EVAL_TASKS) {
    for (const variant of ['single', 'council'] as const) {
      for (let rep = 1; rep <= repeats; rep += 1) {
        runs.push({
          taskId: t.id,
          variant,
          repeat: rep,
          assertionsPassed: t.assertions.length,
          assertionsTotal: t.assertions.length,
          blockedCorrectly: t.must_be_blocked,
          structuralPassed: true,
          intentPassed: true,
          missingTerms: [],
          advisoryInventions: [],
          councilDegraded: false,
          inTokens: variant === 'single' ? 100 : 300,
          outTokens: variant === 'single' ? 50 : 150,
          calls: variant === 'single' ? 1 : 3,
          attempts: variant === 'single' ? 1 : 3,
          usageKnown: true,
        });
      }
    }
  }
  return {
    runs,
    badFixtureResults: Array.from({ length: 15 }, (_, i) => ({
      id: `V${String(i + 1).padStart(2, '0')}`,
      expect: 'lint-error' as const,
      caught: true,
    })),
    driftCaught: true,
    unresolvedFreezeRejected: true,
    live,
  };
}

describe('complete usage across repeats', () => {
  it('ONE unknown-usage run among 3 repeats blocks the G4 cost verdict with a named reason', () => {
    const input = passInput(3);
    input.runs[4]!.usageKnown = false; // one single-variant repeat lacks usage
    const text = renderGateReport(input);
    const miss = text.split('\n').find((l) => l.startsWith('- G4: token cost not evaluable'));
    expect(miss).toBeDefined();
    expect(miss).toContain('unknown');
    expect(text).toContain('VERDICT: FAIL');
  });
});

describe('G4 honesty — computed over intent-fidelity-passing runs only', () => {
  it('the G4 line names the faithful-run restriction', () => {
    const text = renderGateReport(passInput(1));
    expect(text).toMatch(/G4 \(intent-fidelity-passing runs only\)/);
  });

  it('assertions on runs that FAILED intent fidelity are excluded from the comparison', () => {
    const input = passInput(1);
    // make the RAW totals genuinely favor council: one single run loses an assertion
    input.runs[0]!.assertionsPassed -= 1;
    const ca = input.runs.filter((r) => r.variant === 'council').reduce((a, r) => a + r.assertionsPassed, 0);
    const sa = input.runs.filter((r) => r.variant === 'single').reduce((a, r) => a + r.assertionsPassed, 0);
    expect(ca).toBeGreaterThan(sa); // raw totals favor council…
    for (const r of input.runs) {
      if (r.variant === 'council') {
        r.intentPassed = false; // …but every council run is unfaithful
      }
    }
    const text = renderGateReport(input);
    // the faithful-only comparison must NOT see council's assertions
    expect(text).toMatch(new RegExp(`G4 \\(intent-fidelity-passing runs only\\): council assertions 0 > single ${sa}: fail`));
    expect(text).toContain('VERDICT: FAIL');
  });

  it('zero faithful runs on either side → G4 fails with a named reason (an empty comparison is not an advantage)', () => {
    const input = passInput(1);
    for (const r of input.runs) {
      if (r.variant === 'single') r.intentPassed = false;
    }
    const text = renderGateReport(input);
    expect(text).toContain('no intent-fidelity-passing single runs to compare');
    expect(text).toContain('VERDICT: FAIL');
  });

  it('the report states what G4 does NOT establish (no blinding, mock cannot substantiate, term-dump limitation named)', () => {
    const text = renderGateReport(passInput(1));
    expect(text).toContain('does NOT establish');
    expect(text.toLowerCase()).toContain('blind');
    // the term-dump vector is named explicitly, not left for the reader to infer
    expect(text).toContain('term dump');
    expect(text).toContain('not that they are USED in the design');
    expect(text).toContain('future tightening');
  });

  it('the report separates structural passes from intent-fidelity passes', () => {
    const input = passInput(1);
    input.runs[0]!.intentPassed = false;
    const text = renderGateReport(input);
    expect(text).toContain('structural passes: 40/40');
    expect(text).toContain('intent-fidelity passes: 39/40');
  });

  it('mock (non-live) reports label G3 mock evidence as blocking plumbing and intent passes as badge-constructed, not model fidelity', () => {
    const input = passInput(1, false);
    const text = renderGateReport(input);
    expect(text).toContain('PASS_DETERMINISTIC_ONLY');
    expect(text).toContain('plumbing');
    // the mock greenfield intent passes derive from badgeIntentConstraints — the
    // exact analog of the G3 scripting disclosure, named in the report
    expect(text).toContain('badgeIntentConstraints');
    expect(text).toContain('not model-fidelity evidence');
  });
});

// ---------------------------------------------------------------------------
// Mock scripts themselves must now satisfy the intent assertions
// ---------------------------------------------------------------------------

describe('buildMockScripts — faithful by construction', () => {
  it('every greenfield mock bundle carries its task term set (the plumbing faces the same assertions live models face)', () => {
    const scripts = buildMockScripts();
    for (const t of greenfield()) {
      const bundle = JSON.parse(scripts.single.byTaskId[t.id]![0]!.text) as SpecBundle;
      const s = scoreRun(t, { kind: 'spec', variant: 'single', bundle, usage: U }, U);
      expect(s.intentPassed, `${t.id} mock bundle must carry its intent terms`).toBe(true);
      expect(s.missingTerms, `${t.id} mock bundle missing terms`).toEqual([]);
      // (structural scores may legitimately trail on the small base fixtures —
      // embed-cli has fewer requirements than some tasks demand; that is
      // pre-existing and orthogonal to intent fidelity)
    }
  });
});
