import { z } from 'zod';
import { sha256Content } from '../compiler/hash';
import type { BehaviorReview } from './review';

/**
 * §18/§19 + the multi-change appendix — review change requests as ONE
 * version-bound transaction.
 *
 * A user annotates any number of review segments; the submitted set is
 * validated against the review version it was made against and each segment's
 * CURRENT content hash (stale anchors are rejected by name, never guessed
 * over), then applied through a SINGLE regeneration whose prompt appendix is
 * this module's own attributable protocol — `lco-clarify/review-changes-v1`.
 * Change requests are NOT clarification answers: they never masquerade as
 * DEC- answers (they name no decision); they ride their own appendix and are
 * recorded as evidence records with their own source+hash identities.
 *
 * No "last change wins": contradictory instructions inside one set are
 * explicitly NOT auto-merged — the appendix forbids silent conflict
 * resolution and requires conflicts to surface as NEW UNRESOLVED decisions,
 * which re-open the clarification workspace (§20).
 */

export const CLARIFY_REVIEW_CHANGES_PROTOCOL = 'lco-clarify/review-changes-v1';

export const MAX_CHANGE_INSTRUCTION_CHARS = 4_000;
export const MAX_CHANGES_PER_SET = 20;

const CHANGE_ID = /^CHG-[0-9A-Za-z-]{1,40}$/;

export const ReviewChangeSchema = z
  .object({
    changeId: z.string().regex(CHANGE_ID, 'changeId must be CHG-<short-token>'),
    segmentId: z.string().min(1),
    /** Verbatim selected text — must be a substring of the segment body. */
    selectedText: z.string().min(1),
    /** Hash of the segment body the user selected against. */
    segmentContentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    /** The requested behavior change, in the user's words. */
    instruction: z.string().trim().min(1).max(MAX_CHANGE_INSTRUCTION_CHARS),
  })
  .strict();
export type ReviewChange = z.infer<typeof ReviewChangeSchema>;

export const ReviewChangeSetSchema = z
  .object({
    /** The review version the user made these decisions against. */
    reviewVersion: z.number().int().positive(),
    changes: z.array(ReviewChangeSchema).min(1).max(MAX_CHANGES_PER_SET),
  })
  .strict();
export type ReviewChangeSet = z.infer<typeof ReviewChangeSetSchema>;

export type ChangeSetValidation =
  | { ok: true; changeSet: ReviewChangeSet }
  | { ok: false; error: string };

/**
 * Validate a submitted change set against the CURRENT review:
 *  - the whole set binds to the review version it was made against;
 *  - every segment must exist and its content hash must still match (a stale
 *    anchor names the stale change — the set is rejected, nothing guessed);
 *  - the selection must be verbatim segment text;
 *  - identical duplicate instructions on one segment are rejected (a set
 *    cannot carry the same change twice); DIFFERENT instructions on the same
 *    segment travel together — contradictions surface as clarification, not
 *    silent merges.
 */
export function validateChangeSet(set: ReviewChangeSet, review: BehaviorReview): ChangeSetValidation {
  if (set.changes.length === 0) {
    return { ok: false, error: 'the change set is empty — select part of the review and describe a change first' };
  }
  if (set.changes.length > MAX_CHANGES_PER_SET) {
    return {
      ok: false,
      error: `the change set carries ${set.changes.length} changes — the ceiling is ${MAX_CHANGES_PER_SET} per application`,
    };
  }
  if (set.reviewVersion !== review.reviewVersion) {
    return {
      ok: false,
      error: `these changes were made against review version ${set.reviewVersion}, but the current review is version ${review.reviewVersion} — the review changed underneath your selections; please review the updated document and re-select`,
    };
  }
  const byId = new Map(
    review.sections.flatMap((s) => s.segments.map((seg) => [seg.segmentId, seg] as const)),
  );
  const seenPerSegment = new Map<string, Set<string>>();
  for (const c of set.changes) {
    const instruction = c.instruction.trim();
    if (instruction === '') {
      return { ok: false, error: `change ${c.changeId} carries an empty instruction — describe the behavior you want instead` };
    }
    if (instruction.length > MAX_CHANGE_INSTRUCTION_CHARS) {
      return {
        ok: false,
        error: `change ${c.changeId}'s instruction is ${instruction.length} characters — the ceiling is ${MAX_CHANGE_INSTRUCTION_CHARS}`,
      };
    }
    const seg = byId.get(c.segmentId);
    if (seg === undefined) {
      return { ok: false, error: `change ${c.changeId} targets '${c.segmentId}', which does not exist in the current review` };
    }
    if (c.segmentContentHash !== seg.contentHash) {
      return {
        ok: false,
        error: `change ${c.changeId} targets '${c.segmentId}', whose content changed since you selected it — re-read the updated segment and request the change again`,
      };
    }
    if (!seg.body.includes(c.selectedText)) {
      return {
        ok: false,
        error: `change ${c.changeId} quotes text that is not part of segment '${c.segmentId}' — selections must quote the review verbatim`,
      };
    }
    const prior = seenPerSegment.get(c.segmentId) ?? new Set<string>();
    if (prior.has(c.instruction)) {
      return {
        ok: false,
        error: `two changes carry the same instruction for '${c.segmentId}' — request it once; if you want two different changes to one part, write two different instructions`,
      };
    }
    prior.add(c.instruction);
    seenPerSegment.set(c.segmentId, prior);
  }
  return { ok: true, changeSet: set };
}

/** Map a review segment id back to the canonical ids it projects. */
export function segmentToCanonicalRefs(segmentId: string): string[] {
  if (segmentId === 'SEG-PURPOSE') return ['intent'];
  const m = /^SEG-((?:REQ|OPS|UX|ARC|DAT|SEC|LGC|DEC|TASK|TST|E|CON|AS)-\d{4})(?:-EXCLUDED)?$/.exec(segmentId);
  return m === null ? [] : [m[1]!];
}

/** Inspectable evidence record for one applied change request (approval ledger). */
export interface ChangeRequestEvidence {
  changeId: string;
  segmentId: string;
  canonicalRefs: string[];
  selectedText: string;
  instruction: string;
  source: string;
  hash: string;
}

/** Deterministic evidence identity for each change (source + hash over the verbatim record). */
export function changeRequestEvidence(changes: ReviewChange[], sessionLabel: string): ChangeRequestEvidence[] {
  return changes.map((c) => {
    const verbatim = `Change requested on ${c.segmentId} (selected: """${c.selectedText}""")\nRequested behavior: ${c.instruction}`;
    return {
      changeId: c.changeId,
      segmentId: c.segmentId,
      canonicalRefs: segmentToCanonicalRefs(c.segmentId),
      selectedText: c.selectedText,
      instruction: c.instruction,
      source: `${sessionLabel}/${c.changeId}`,
      hash: sha256Content(verbatim),
    };
  });
}

/**
 * Append the change requests to a base generation prompt (no-op for an empty
 * set — byte-identical base). Each change is verbatim, anchored to its review
 * segment AND the canonical id(s) it projects, and carries its evidence
 * identity; the rules bind: authoritative user evidence, no invented
 * resolution of internal conflicts (surface them as UNRESOLVED instead), and
 * canonical id stability for content whose semantics did not change.
 */
export function withReviewChangeRequests(
  basePrompt: string,
  changes: ReviewChange[],
  review: BehaviorReview,
  sessionLabel: string,
): string {
  if (changes.length === 0) return basePrompt;
  const segById = new Map(
    review.sections.flatMap((s) => s.segments.map((seg) => [seg.segmentId, seg] as const)),
  );
  const evidence = changeRequestEvidence(changes, sessionLabel);
  const blocks = changes.map((c, i) => {
    const seg = segById.get(c.segmentId);
    const refs = segmentToCanonicalRefs(c.segmentId).join(', ');
    const sectionNote = seg !== undefined ? ` (review section '${seg.sectionKey}')` : '';
    const e = evidence[i]!;
    return [
      `- ${c.changeId} on review segment ${c.segmentId}${sectionNote}${refs !== '' ? `, which projects canonical ${refs}` : ''}:`,
      '  The product owner selected this part of the review:',
      '  """',
      `  ${c.selectedText}`,
      '  """',
      '  and requested this change:',
      '  """',
      `  ${c.instruction}`,
      '  """',
      `  (evidence: kind user_input, source "${e.source}", content ${e.hash})`,
    ].join('\n');
  });
  return [
    basePrompt,
    '',
    `REVIEW CHANGE REQUESTS (authoritative user evidence — verbatim; part of this run; protocol ${CLARIFY_REVIEW_CHANGES_PROTOCOL}):`,
    'The product owner reviewed the generated specification and requested these exact changes. Treat every request as binding user_input evidence:',
    '- Apply the requested change to the canonical part of the spec the named segment projects; regenerate the affected statements (and only the affected ones) so the whole bundle stays consistent.',
    '- Keep the SAME id (same id for requirement/decision/evidence parts whose meaning did not change) — renaming or re-numbering unchanged content is forbidden. A genuinely NEW requirement or decision takes a NEW unused id.',
    '- Carry each change request into the bundle as an evidence item with kind "user_input" and the exact source and hash given below.',
    '- If two requests conflict with each other or with the intent so that no single consistent spec satisfies both, do NOT pick a winner silently: emit an UNRESOLVED decision (clarification wording rules) naming the conflict, and set the unresolved counters — the product owner will resolve it.',
    '- Do not silently drop a requested change: every request is either incorporated or named in an UNRESOLVED conflict.',
    ...blocks,
  ].join('\n');
}
