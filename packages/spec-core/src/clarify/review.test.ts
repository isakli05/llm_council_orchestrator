import { describe, it, expect } from 'vitest';
import type { SpecBundle } from '../schemas';
import { projectReview } from './review';

/**
 * §17/§19 — the Project Behavior Review: a DETERMINISTIC projection of the
 * canonical SpecBundle (no second LLM pass, no second specification), with
 * stable segment identities bound to canonical ids and per-segment content
 * hashes that anchor stale-edit detection.
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
    intent: {
      statement: 'A B2B ordering platform for textile dealers: dealers see products, place orders and track the order process.',
      normalized: 'b2b ordering platform textile dealers products orders tracking',
    },
    glossary: [
      { term: 'Dealer', definition: 'A registered textile business that orders fabric.' },
      { term: 'Order', definition: 'A dealer request for fabric quantities.' },
    ],
    assumptions: [
      {
        id: 'AS-0001',
        statement: 'Dealers sign in with email and password.',
        evidence: ['E-0001'],
        impact_if_wrong: 'A different sign-in method would need to be added.',
      },
    ],
    evidence: [
      { id: 'E-0001', kind: 'user_input', source: 'intent', hash: SHA },
      { id: 'E-0002', kind: 'user_input', source: 'clarify-web:s1/round1', hash: SHA },
    ],
    requirements: [
      {
        id: 'REQ-0001',
        statement: 'Dealers can browse the product catalogue and see price and stock per fabric.',
        priority: 'must',
        evidence: ['E-0001'],
        acceptance_refs: ['TST-0001'],
        terms_used: [],
      },
      {
        id: 'SEC-0002',
        statement: 'Only authenticated dealers can see wholesale prices.',
        priority: 'must',
        evidence: ['E-0001'],
        acceptance_refs: ['TST-0002'],
        terms_used: [],
      },
      {
        id: 'UX-0003',
        statement: 'The order list shows each order status with a plain-language label.',
        priority: 'should',
        evidence: ['E-0001'],
        acceptance_refs: ['TST-0003'],
        terms_used: [],
      },
    ],
    decisions: [
      {
        claim_id: 'DEC-0004',
        decision: 'When two dealers order the last quantity of the same fabric, the first confirmed order gets priority.',
        rationale: 'r',
        evidence: ['E-0002'],
        confidence: 1,
        impact: 'high',
        assumptions: [],
        alternatives: [
          { option: 'accept both and split the stock', rejected_because: 'risks selling more fabric than is available' },
        ],
        status: 'accepted',
      },
      {
        claim_id: 'DEC-0005',
        decision: 'Newly registered dealers wait for company approval before they can place orders.',
        rationale: 'r',
        evidence: ['E-0002'],
        confidence: 0.9,
        impact: 'medium',
        assumptions: [],
        alternatives: [],
        status: 'accepted',
      },
    ],
    contracts: [],
    tasks: [
      {
        task_id: 'TASK-0001',
        title: 'Product catalogue with price and stock',
        purpose: 'p',
        refs: { requirements: ['REQ-0001'], architecture: [], decisions: [] },
        depends_on: [],
        preconditions: ['c'],
        permitted_scope: ['src/**'],
        protected: [],
        interface_changes: [],
        invariants: ['i'],
        instructions: 'do',
        tests: [{ id: 'TST-0001', kind: 'unit', file: 'a.test.ts', cases: ['REQ-0001: works'] }],
        verification: [{ command: 'node --version', expect: 'exit 0' }],
        acceptance: ['a'],
        rollback: 'r',
        completion_evidence: { required: ['test_summary'] },
        risk: { level: 'low', note: '' },
        complexity: 'xs',
      },
    ],
    test_files: ['a.test.ts'],
  } as unknown as SpecBundle;
}

describe('projectReview (§17 — human-readable projection of the canonical spec)', () => {
  const review = projectReview(bundle(), 1);

  it('renders a purpose section from the intent and names the project', () => {
    const purpose = review.sections.find((s) => s.key === 'purpose')!;
    expect(purpose.segments[0]!.body).toContain('B2B ordering platform for textile dealers');
    expect(review.projectName).toBe('textile-b2b');
  });

  it('groups requirements by family into business-language sections with stable per-requirement segment ids', () => {
    const workflows = review.sections.find((s) => s.key === 'workflows')!;
    expect(workflows.segments.map((s) => s.segmentId)).toEqual(['SEG-REQ-0001']);
    expect(workflows.segments[0]!.sourceRefs).toEqual(['REQ-0001']);
    const security = review.sections.find((s) => s.key === 'access')!;
    expect(security.segments[0]!.segmentId).toBe('SEG-SEC-0002');
    const ux = review.sections.find((s) => s.key === 'experience')!;
    expect(ux.segments[0]!.segmentId).toBe('SEG-UX-0003');
  });

  it('renders accepted decisions as business rules and rejected alternatives as explicitly excluded behavior', () => {
    const rules = review.sections.find((s) => s.key === 'rules')!;
    expect(rules.segments.some((s) => s.segmentId === 'SEG-DEC-0004')).toBe(true);
    const excluded = review.sections.find((s) => s.key === 'excluded')!;
    expect(excluded.segments[0]!.body).toContain('accept both and split the stock');
    expect(excluded.segments[0]!.body).toContain('risks selling more fabric than is available');
  });

  it('renders assumptions with their impact and glossary terms', () => {
    const assumptions = review.sections.find((s) => s.key === 'assumptions')!;
    expect(assumptions.segments[0]!.segmentId).toBe('SEG-AS-0001');
    expect(assumptions.segments[0]!.body).toContain('different sign-in method');
    const terms = review.sections.find((s) => s.key === 'terms')!;
    expect(terms.segments).toHaveLength(2);
    expect(terms.segments[0]!.sourceRefs).toEqual(['glossary:Dealer']);
  });

  it('omits sections that would be empty (no forced generic sections)', () => {
    expect(review.sections.find((s) => s.key === 'data')).toBeUndefined();
    expect(review.sections.find((s) => s.key === 'operations')).toBeUndefined();
  });

  it('gives every segment a content hash and the review a deterministic digest', () => {
    for (const s of review.sections) {
      for (const seg of s.segments) {
        expect(seg.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      }
    }
    const again = projectReview(bundle(), 1);
    expect(again.specDigest).toBe(review.specDigest);
    // same content, different review version → same digest (content identity), higher version
    const v2 = projectReview(bundle(), 2);
    expect(v2.specDigest).toBe(review.specDigest);
    expect(v2.reviewVersion).toBe(2);
  });

  it('segment ids are unique across the whole review', () => {
    const ids = review.sections.flatMap((s) => s.segments.map((seg) => seg.segmentId));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('changing one requirement statement changes its segment hash and the spec digest', () => {
    const changed = bundle();
    changed.requirements[0]!.statement = 'Dealers can browse the catalogue; retail visitors cannot.';
    const changedReview = projectReview(changed, 1);
    const before = review.sections.find((s) => s.key === 'workflows')!.segments[0]!;
    const after = changedReview.sections.find((s) => s.key === 'workflows')!.segments[0]!;
    expect(after.contentHash).not.toBe(before.contentHash);
    expect(changedReview.specDigest).not.toBe(review.specDigest);
  });
});
