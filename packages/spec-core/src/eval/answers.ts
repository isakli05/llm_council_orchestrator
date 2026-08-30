import { sha256Content } from '../compiler/hash';
import type { UserAnswerForPrompt } from './prompts-v4';

/**
 * The deterministic clarification loop's answer file (owner spec §12):
 *
 *   { "DEC-0004": "the first confirmed order gets priority", … }
 *
 * PURE parsing/validation: JSON in, typed answers out (the CLI boundary reads
 * the file). One CLI invocation = one round — there is no hidden LLM loop.
 * Answers bind to the blocked run's UNRESOLVED decision claim_ids; the prompt
 * appendix (withUserAnswers) makes each answer resolve ONLY its own decision.
 */

/** Input ceilings for the answers channel (defensive bounds, PERF-001 kin). */
export const MAX_ANSWERS = 50;
export const MAX_ANSWER_CHARS = 4_000;

export type AnswersParseResult =
  | { ok: true; answers: UserAnswerForPrompt[] }
  | { ok: false; error: string };

/**
 * Parse + validate an answers document and precompute each answer's evidence
 * identity (kind user_input; source = the caller-provided file label; content
 * hash computed locally so the model carries verbatim, hash-attributable
 * evidence instead of paraphrase).
 */
export function parseAnswersFile(text: string, sourceLabel: string): AnswersParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `answers file is not valid JSON (${msg})` };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'answers file must be a JSON object: { "DEC-0000": "your answer", … }' };
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) {
    return { ok: false, error: 'answers file is empty — pass at least one { "DEC-0000": "answer" } entry' };
  }
  if (entries.length > MAX_ANSWERS) {
    return { ok: false, error: `answers file carries ${entries.length} entries — the ceiling is ${MAX_ANSWERS}` };
  }
  const answers: UserAnswerForPrompt[] = [];
  for (const [claimId, value] of entries) {
    if (!/^DEC-\d{4}$/.test(claimId)) {
      return {
        ok: false,
        error: `answers key '${claimId}' is not a decision id — keys must be the DEC-0000 ids from the blocked run's "Questions to resolve"`,
      };
    }
    if (typeof value !== 'string' || value.trim() === '') {
      return { ok: false, error: `answer for ${claimId} must be a non-empty string` };
    }
    const answer = value.trim();
    if (answer.length > MAX_ANSWER_CHARS) {
      return {
        ok: false,
        error: `answer for ${claimId} is ${answer.length} characters — the ceiling is ${MAX_ANSWER_CHARS}`,
      };
    }
    answers.push({
      claimId,
      answer,
      source: sourceLabel,
      hash: sha256Content(answer),
    });
  }
  // Stable order: the file's insertion order is preserved deliberately — the
  // user wrote it in the order the questions were asked.
  return { ok: true, answers };
}
