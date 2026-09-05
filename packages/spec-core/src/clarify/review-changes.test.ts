import { describe, it, expect } from 'vitest';
import type { SpecBundle } from '../schemas';
import { projectReview, type BehaviorReview } from './review';
import {
  CLARIFY_REVIEW_CHANGES_PROTOCOL,
  validateChangeSet,
  withReviewChangeRequests,
  changeRequestEvidence,
  segmentToCanonicalRefs,
  type ReviewChange,
  type ReviewChangeSet,
} from './review-changes';

/**
 * §18/§19 + the multi-change appendix — review change requests: verbatim
 * text selections anchored to stable review segments, validated against the
 * review version + segment content hashes (stale edits rejected), applied as
 * ONE version-bound change-set transaction whose instructions re-enter
 * generation as binding user evidence through a dedicated attributable
 * protocol.
 */

const SHA = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function bundle(): SpecBundle {
  return {
    manifest: {
      spec_schema: 'lco-spec/1.0',
      spec_version: 1,
      project: { name: 'textile-b2b', mode: 'greenfield' },
      complexity_profile: 'p-standard',
      evidence_snapshot: { pack_hash: SHA, collected_at: '2026-09-01T10:00:00Z' },
      state: 'draft',
      council_run: { run_id: 'r', config_fingerprint: 'f' },
      artifact_hashes: {},
      unresolved_count: 0,
      blocking_count: 0,
      target_runtime: { platform: 'node', stack: 'ts' },
    },
    intent: { statement: 'A B2B ordering platform for textile dealers.', normalized: 'n' },
    glossary: [],
    assumptions: [],
    evidence: [{ id: 'E-0001', kind: 'user_input', source: 'intent', hash: SHA }],
    requirements: [
      {
        id: 'REQ-0001',
        statement: 'Newly registered dealers require administrator approval before they can place orders.',
        priority: 'must',
        evidence: ['E-0001'],
        acceptance_refs: ['TST-0001'],
        terms_used: [],
      },
      {
        id: 'SEC-0002',
        statement: 'Only company administrators can approve dealers.',
        priority: 'must',
        evidence: ['E-0001'],
        acceptance_refs: ['TST-0002'],
        terms_used: [],
      },
    ],
    decisions: [],
    contracts: [],
    tasks: [],
    test_files: [],
  } as unknown as SpecBundle;
}

function change(base: Partial<ReviewChange> = {}): ReviewChange {
  return {
    changeId: 'CHG-0001',
    segmentId: 'SEG-REQ-0001',
    selectedText: 'Newly registered dealers require administrator approval',
    segmentContentHash: '', // filled by helper below
    instruction: 'Dealers imported from Logo ERP should bypass this approval.',
    ...base,
  };
}

function withHashes(review: BehaviorReview, changes: ReviewChange[]): ReviewChange[] {
  const byId = new Map(review.sections.flatMap((s) => s.segments.map((seg) => [seg.segmentId, seg] as const)));
  return changes.map((c) => ({ ...c, segmentContentHash: byId.get(c.segmentId)!.contentHash }));
}

describe('validateChangeSet (version-bound anchors, stale rejection)', () => {
  const review = projectReview(bundle(), 3);

  it('accepts a change set whose anchors match the current review version', () => {
    const changes = withHashes(review, [
      change(),
      change({ changeId: 'CHG-0002', segmentId: 'SEG-SEC-0002', selectedText: 'Only company administrators', instruction: 'Regional managers may also approve dealers.' }),
    ]);
    const set: ReviewChangeSet = { reviewVersion: 3, changes };
    expect(validateChangeSet(set, review)).toEqual({ ok: true, changeSet: set });
  });

  it('rejects a change set made against an older review version (whole set, 409 semantics)', () => {
    const changes = withHashes(review, [change()]);
    const r = validateChangeSet({ reviewVersion: 2, changes }, review);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('review changed');
  });

  it('rejects a stale segment anchor, naming the stale change (not the whole set)', () => {
    const stale = withHashes(review, [
      change(),
      change({ changeId: 'CHG-0002', segmentId: 'SEG-SEC-0002', selectedText: 'Only company administrators', instruction: 'x'.repeat(20) }),
    ]);
    stale[1]!.segmentContentHash = SHA; // wrong hash → segment content changed since selection
    const r = validateChangeSet({ reviewVersion: 3, changes: stale }, review);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('CHG-0002');
  });

  it('rejects an unknown segment, a selection that is not verbatim segment text, and empty/oversized instructions', () => {
    expect(!validateChangeSet({ reviewVersion: 3, changes: [change({ segmentId: 'SEG-REQ-9999' })] }, review).ok).toBe(true);
    expect(
      !validateChangeSet(
        { reviewVersion: 3, changes: [withHashes(review, [change({ selectedText: 'dealers get instant access' })])[0]!] },
        review,
      ).ok,
    ).toBe(true);
    expect(!validateChangeSet({ reviewVersion: 3, changes: [change({ instruction: '  ' })] }, review).ok).toBe(true);
    expect(!validateChangeSet({ reviewVersion: 3, changes: [change({ instruction: 'x'.repeat(4001) })] }, review).ok).toBe(true);
  });

  it('rejects empty sets and duplicate instructions on the same segment', () => {
    expect(!validateChangeSet({ reviewVersion: 3, changes: [] }, review).ok).toBe(true);
    const dupes = withHashes(review, [
      change(),
      change({ changeId: 'CHG-0002', instruction: 'Dealers imported from Logo ERP should bypass this approval.' }),
    ]);
    const r = validateChangeSet({ reviewVersion: 3, changes: dupes }, review);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('same instruction');
  });

  it('two DIFFERENT instructions on the same segment are allowed (they travel together; conflicts surface as clarification)', () => {
    const two = withHashes(review, [
      change(),
      change({ changeId: 'CHG-0002', instruction: 'Also cap approvals at 50 dealers per day.' }),
    ]);
    expect(validateChangeSet({ reviewVersion: 3, changes: two }, review).ok).toBe(true);
  });
});

describe('withReviewChangeRequests (lco-clarify/review-changes-v1)', () => {
  const review = projectReview(bundle(), 3);
  const changes = withHashes(review, [change()]);

  it('embeds each change verbatim with its anchor, canonical target, and evidence identity', () => {
    const prompt = withReviewChangeRequests('BASE PROMPT', changes, review, 'clarify-web:s1/review3');
    expect(prompt).toContain(CLARIFY_REVIEW_CHANGES_PROTOCOL);
    expect(prompt).toContain('SEG-REQ-0001');
    expect(prompt).toContain('REQ-0001'); // canonical target named, not just the review segment
    expect(prompt).toContain('Newly registered dealers require administrator approval');
    expect(prompt).toContain('Dealers imported from Logo ERP should bypass this approval.');
    // each change carries its evidence identity (source + hash) into the appendix
    const evidence = changeRequestEvidence(changes, 'clarify-web:s1/review3');
    expect(prompt).toContain(evidence[0]!.source);
    expect(prompt).toContain(evidence[0]!.hash);
    // binding rules: no silent resolution of contradictions; id stability
    expect(prompt).toContain('UNRESOLVED');
    expect(prompt.toLowerCase()).toContain('same id');
  });

  it('is a no-op wrap for an empty set (byte-identical base)', () => {
    expect(withReviewChangeRequests('BASE PROMPT', [], review)).toBe('BASE PROMPT');
  });

  it('change instructions become inspectable evidence records (hash + source, both facts preserved)', () => {
    const evidence = changeRequestEvidence(changes, 'clarify-web:s1/review3');
    expect(evidence).toHaveLength(1);
    const e = evidence[0]!;
    expect(e.changeId).toBe('CHG-0001');
    expect(e.source).toBe('clarify-web:s1/review3/CHG-0001');
    expect(e.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(e.instruction).toContain('Dealers imported from Logo ERP');
    expect(e.selectedText).toContain('Newly registered dealers require administrator approval');
    // deterministic: same change, same hash
    expect(changeRequestEvidence(changes, 'clarify-web:s1/review3')[0]!.hash).toBe(e.hash);
  });

  it('segmentToCanonicalRefs maps review segment ids back to canonical ids', () => {
    expect(segmentToCanonicalRefs('SEG-REQ-0001')).toEqual(['REQ-0001']);
    expect(segmentToCanonicalRefs('SEG-DEC-0004-EXCLUDED')).toEqual(['DEC-0004']);
    expect(segmentToCanonicalRefs('SEG-AS-0001')).toEqual(['AS-0001']);
    expect(segmentToCanonicalRefs('SEG-TERM-e3b0c442')).toEqual([]); // glossary term: no canonical id
    expect(segmentToCanonicalRefs('SEG-PURPOSE')).toEqual(['intent']);
  });
});
