import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  PROMPT_PROTOCOL_VERSION,
  decomposedClassifier,
  decomposedProposalA,
  decomposedProposalB,
  decomposedJudge,
  decomposedJudgeSingle,
  decomposedJudgeAlone,
  withUserAnswers,
} from './prompts-v4';

/**
 * The v4 DECOMPOSED-council prompt protocol (owner spec §8/§10/§19): its own
 * identity, separate from the FROZEN PROD-003 prompts.ts (whose bytes the
 * corpus lock pins). These tests pin the structural invariants that make the
 * topology honest: B never sees A, the judge sees both VALIDATED proposals,
 * unresolved decisions are phrased as domain questions, and user answers
 * arrive as verbatim authoritative evidence.
 */

const ARGS = ['build me a fabric order tracker', 'p-standard'] as const;

describe('PROMPT_PROTOCOL_VERSION', () => {
  it('is an explicit, versioned identity separate from the frozen v3 protocol', () => {
    expect(PROMPT_PROTOCOL_VERSION).toBe('lco-prompts/v4');
  });
});

describe('decomposed templates — structural invariants', () => {
  it('proposal B contains NO proposal-A content (independence by construction)', () => {
    const b = decomposedProposalB(...ARGS);
    expect(b).not.toContain('PROPOSAL A');
    // it takes the adversarial stance explicitly
    expect(b).toContain('adversarial');
  });

  it('proposal A is the architect stance and embeds the schema', () => {
    const a = decomposedProposalA(...ARGS);
    expect(a).toContain('EXACT JSON Schema');
    expect(a).toContain('architect');
  });

  it('judge receives BOTH proposals verbatim', () => {
    const j = decomposedJudge(...ARGS, '{"sentinel":"A"}', '{"sentinel":"B"}');
    expect(j).toContain('{"sentinel":"A"}');
    expect(j).toContain('{"sentinel":"B"}');
    expect(j).toContain('PROPOSAL A');
    expect(j).toContain('PROPOSAL B');
  });

  it('degraded judge forms name the degraded leg and omit the FAILED leg text', () => {
    // proposal_b failed → A survives: A's content appears, B's JSON never does
    const single = decomposedJudgeSingle(...ARGS, 'proposal_b', '{"sentinel":"A-survives"}');
    expect(single).toContain('proposal_b');
    expect(single).toContain('{"sentinel":"A-survives"}');
    expect(single).not.toContain('sentinel":"B');
    // mirror case: proposal_a failed → B survives
    const mirror = decomposedJudgeSingle(...ARGS, 'proposal_a', '{"sentinel":"B-survives"}');
    expect(mirror).toContain('proposal_a');
    expect(mirror).toContain('{"sentinel":"B-survives"}');
    expect(mirror).not.toContain('sentinel":"A');
    const alone = decomposedJudgeAlone(...ARGS);
    expect(alone).toContain('alone');
    expect(alone).not.toContain('PROPOSAL A');
    expect(alone).not.toContain('PROPOSAL B');
  });

  it('classifier output contract matches the fused classifier ({profile, must_be_blocked})', () => {
    const c = decomposedClassifier(...ARGS);
    expect(c).toContain('"must_be_blocked"');
    expect(c).toContain('must_be_blocked=true is FINAL');
  });

  it('every UNRESOLVED-bearing template carries the plain-language CLARIFY rules', () => {
    for (const t of [
      decomposedProposalA(...ARGS),
      decomposedProposalB(...ARGS),
      decomposedJudge(...ARGS, '{}', '{}'),
      decomposedJudgeAlone(...ARGS),
    ]) {
      expect(t).toContain('CLARIFICATION WORDING');
      expect(t).toContain('question a non-engineer');
    }
  });

  it('the intent appears verbatim in every template', () => {
    for (const t of [
      decomposedClassifier(...ARGS),
      decomposedProposalA(...ARGS),
      decomposedProposalB(...ARGS),
      decomposedJudge(...ARGS, '{}', '{}'),
    ]) {
      expect(t).toContain(ARGS[0]);
    }
  });
});

describe('withUserAnswers', () => {
  const answers = [
    {
      claimId: 'DEC-0004',
      answer: 'The first confirmed order gets priority; the second is rejected.',
      source: 'answers:answers.json',
      hash: `sha256:${createHash('sha256').update('x').digest('hex')}`,
    },
  ];

  it('appends the answer verbatim with its evidence metadata and binding rules', () => {
    const out = withUserAnswers('BASE PROMPT', answers);
    expect(out.startsWith('BASE PROMPT')).toBe(true);
    expect(out).toContain('USER ANSWERS');
    expect(out).toContain(answers[0].answer);
    expect(out).toContain(answers[0].hash);
    expect(out).toContain('DEC-0004');
    expect(out).toContain('user_input');
    // binding: an answer resolves ONLY its own decision
    expect(out).toContain('ONLY the decision it names');
    // and unanswered unresolved material must stay unresolved
    expect(out).toContain('remain UNRESOLVED');
  });

  it('with no answers returns the base prompt untouched', () => {
    expect(withUserAnswers('BASE', [])).toBe('BASE');
  });
});

describe('v3 immutability guard (PROD-003)', () => {
  it('prompts-v4 does not import or rewrite the frozen prompts module bytes', () => {
    // The corpus lock is the binding proof (corpus-lock.test.ts); this is the
    // structural statement: v4 owns its own text and reads only the schema.
    const v4 = readFileSync(__dirname + '/prompts-v4.ts', 'utf8');
    expect(v4).not.toContain("from './prompts'");
  });
});
