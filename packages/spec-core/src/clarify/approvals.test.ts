import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SpecBundle } from '../schemas';
import type { UserAnswerForPrompt } from '../eval/prompts-v4';
import { parseAnswersFile } from '../eval/answers';
import { answerToUserAnswer } from './model';
import type { ChangeRequestEvidence } from './review-changes';
import {
  specIdentity,
  buildApprovalRecord,
  approvalFileName,
  writeApprovalArtifacts,
  answersExportDocument,
  type ApprovalRecord,
} from './approvals';

/**
 * §21 + the traceability appendix — explicit approval creates an IMMUTABLE
 * baseline: stable spec identity, immutable revision identity + content
 * digest, parent lineage on later approvals, requirement/decision inventory
 * with stable ids, and the full evidence ledger. The spec/ tree itself is
 * written through the existing atomic writers (writeSpecDir semantics); a
 * later same-session approval swaps it under the same lock discipline while
 * every historical revision record stays immutable and attributable.
 */

const SHA = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function bundle(name = 'textile-b2b'): SpecBundle {
  return {
    manifest: {
      spec_schema: 'lco-spec/1.0',
      spec_version: 1,
      project: { name, mode: 'greenfield' },
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
      { id: 'REQ-0001', statement: 'Dealers can browse the catalogue.', priority: 'must', evidence: ['E-0001'], acceptance_refs: ['TST-0001'], terms_used: [] },
      { id: 'SEC-0002', statement: 'Only dealers see wholesale prices.', priority: 'must', evidence: ['E-0001'], acceptance_refs: ['TST-0002'], terms_used: [] },
    ],
    decisions: [
      {
        claim_id: 'DEC-0004', decision: 'First confirmed order gets priority.', rationale: 'r', evidence: ['E-0001'],
        confidence: 1, impact: 'high', assumptions: [], alternatives: [], status: 'accepted',
      },
    ],
    contracts: [],
    tasks: [],
    test_files: [],
  } as unknown as SpecBundle;
}

const ANSWERS: UserAnswerForPrompt[] = [
  answerToUserAnswer(
    { decisionId: 'DEC-0004', kind: 'option', selectedOption: 'first confirmed order gets priority' },
    'clarify-web:s-1/round1',
  ),
];

const CHANGES: ChangeRequestEvidence[] = [
  {
    changeId: 'CHG-0001',
    segmentId: 'SEG-REQ-0001',
    canonicalRefs: ['REQ-0001'],
    selectedText: 'Dealers can browse',
    instruction: 'Dealers imported from Logo ERP skip approval.',
    source: 'clarify-web:s-1/review1/CHG-0001',
    hash: SHA,
  },
];

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lco-approvals-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('specIdentity + records', () => {
  it('spec identity is stable across revisions of the same project and differs per project', () => {
    const a = specIdentity(bundle());
    const edited = bundle();
    edited.requirements[0]!.statement = 'Different statement entirely.';
    expect(specIdentity(edited)).toBe(a);
    expect(specIdentity(bundle('other-project'))).not.toBe(a);
    expect(a).toMatch(/^SPEC-[0-9a-f]{16}$/);
  });

  it('builds a complete immutable baseline record (digest, inventory, evidence ledger, lineage)', () => {
    const b = bundle();
    const record = buildApprovalRecord({
      bundle: b,
      revision: 2,
      parentRevision: 1,
      approvedAt: '2026-09-01T12:00:00Z',
      promptProtocol: 'lco-prompts/v4+lco-clarify/review-changes-v1',
      rounds: 3,
      sessionId: 's-1',
      answers: ANSWERS,
      changes: CHANGES,
    });
    expect(record.schema).toBe('lco-approval/1');
    expect(record.revision).toBe(2);
    expect(record.parentRevision).toBe(1);
    expect(record.specId).toBe(specIdentity(b));
    expect(record.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    // requirement + decision inventory with stable ids and content hashes
    expect(record.requirements.map((r) => r.id)).toEqual(['REQ-0001', 'SEC-0002']);
    expect(record.requirements[0]!.contentHash).toMatch(/^sha256:/);
    expect(record.decisions[0]!.id).toBe('DEC-0004');
    // evidence ledger preserves BOTH channels verbatim
    expect(record.evidence.answers).toEqual(ANSWERS);
    expect(record.evidence.changes).toEqual(CHANGES);
  });

  it('digest matches the review projector content identity for the same bundle', () => {
    const record = buildApprovalRecord({
      bundle: bundle(), revision: 1, approvedAt: 't', promptProtocol: 'p', rounds: 1,
      sessionId: 's', answers: [], changes: [],
    });
    // same canonical content → same digest rule as review.specDigest
    const again = buildApprovalRecord({
      bundle: bundle(), revision: 1, approvedAt: 'other time', promptProtocol: 'p', rounds: 9,
      sessionId: 'other', answers: [], changes: [],
    });
    expect(again.digest).toBe(record.digest); // content identity, independent of metadata
  });
});

describe('answers export (headless reproducibility)', () => {
  it('exports the accumulated evidence as a valid --answers document', () => {
    const doc = answersExportDocument(ANSWERS);
    const parsed = parseAnswersFile(JSON.stringify(doc), 'replay.json');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.answers[0]!.answer).toBe(ANSWERS[0]!.answer);
    expect(parsed.answers[0]!.hash).toBe(ANSWERS[0]!.hash);
  });
});

describe('writeApprovalArtifacts (§21 + appendix: immutable revisions, atomic writes)', () => {
  it('first approval writes spec/ + APPR-0001 + answers export; record round-trips from disk', () => {
    const b = bundle();
    const record = buildApprovalRecord({
      bundle: b, revision: 1, approvedAt: '2026-09-01T12:00:00Z', promptProtocol: 'p', rounds: 2,
      sessionId: 's-1', answers: ANSWERS, changes: [],
    });
    writeApprovalArtifacts(dir, record, { replacing: false });
    expect(existsSync(join(dir, 'spec', 'manifest.json'))).toBe(true);
    expect(existsSync(join(dir, 'approvals', 'APPR-0001.json'))).toBe(true);
    expect(existsSync(join(dir, 'clarify-answers.json'))).toBe(true);
    const fromDisk = JSON.parse(readFileSync(join(dir, 'approvals', 'APPR-0001.json'), 'utf8')) as ApprovalRecord;
    expect(fromDisk.revision).toBe(1);
    expect(fromDisk.digest).toBe(record.digest);
    expect(fromDisk.evidence.answers[0]!.answer).toBe(ANSWERS[0]!.answer);
  });

  it('a later same-session approval creates APPR-0002 with parent lineage and swaps spec/ content', () => {
    const r1 = buildApprovalRecord({
      bundle: bundle(), revision: 1, approvedAt: 't1', promptProtocol: 'p', rounds: 2,
      sessionId: 's-1', answers: ANSWERS, changes: [],
    });
    writeApprovalArtifacts(dir, r1, { replacing: false });

    const edited = bundle();
    edited.requirements[0]!.statement = 'Dealers browse the catalogue with live stock.';
    const r2 = buildApprovalRecord({
      bundle: edited, revision: 2, parentRevision: 1, approvedAt: 't2', promptProtocol: 'p', rounds: 3,
      sessionId: 's-1', answers: ANSWERS, changes: CHANGES,
    });
    writeApprovalArtifacts(dir, r2, { replacing: true });

    expect(existsSync(join(dir, 'approvals', 'APPR-0002.json'))).toBe(true);
    const v1 = JSON.parse(readFileSync(join(dir, 'approvals', 'APPR-0001.json'), 'utf8')) as ApprovalRecord;
    const v2 = JSON.parse(readFileSync(join(dir, 'approvals', 'APPR-0002.json'), 'utf8')) as ApprovalRecord;
    expect(v2.parentRevision).toBe(1);
    expect(v2.digest).not.toBe(v1.digest);
    // revision 1 stays immutable on disk (its content survived revision 2)
    expect(v1.bundle.requirements[0]!.statement).toBe('Dealers can browse the catalogue.');
    // spec/ now holds revision 2's content
    const liveReq = JSON.parse(readFileSync(join(dir, 'spec', 'requirements.json'), 'utf8')) as { id: string; statement: string }[];
    expect(liveReq[0]!.statement).toBe('Dealers browse the catalogue with live stock.');
  });

  it('REFUSES to replace a spec/ it did not write in this session (no-clobber defense in depth)', () => {
    mkdirSync(join(dir, 'spec'), { recursive: true });
    writeFileSync(join(dir, 'spec', 'manifest.json'), '{}');
    const record = buildApprovalRecord({
      bundle: bundle(), revision: 1, approvedAt: 't', promptProtocol: 'p', rounds: 1,
      sessionId: 's-1', answers: [], changes: [],
    });
    expect(() => writeApprovalArtifacts(dir, record, { replacing: false })).toThrow(/refusing/i);
    // and nothing was written
    expect(existsSync(join(dir, 'approvals'))).toBe(false);
  });

  it('F1 regression: a FAILED re-approval leaves the live spec/ at the previously approved revision', () => {
    const r1 = buildApprovalRecord({
      bundle: bundle(), revision: 1, approvedAt: 't1', promptProtocol: 'p', rounds: 2,
      sessionId: 's-1', answers: ANSWERS, changes: [],
    });
    writeApprovalArtifacts(dir, r1, { replacing: false });

    const edited = bundle();
    edited.requirements[0]!.statement = 'UNAPPROVED second-revision wording.';
    const r2 = buildApprovalRecord({
      bundle: edited, revision: 2, parentRevision: 1, approvedAt: 't2', promptProtocol: 'p', rounds: 3,
      sessionId: 's-1', answers: ANSWERS, changes: [],
    });
    // force a failure AFTER the preconditions but BEFORE the spec swap: make
    // approvals/ unwritable by replacing the directory with a file
    rmSync(join(dir, 'approvals'), { recursive: true, force: true });
    writeFileSync(join(dir, 'approvals'), 'not a directory');
    expect(() => writeApprovalArtifacts(dir, r2, { replacing: true })).toThrow();

    // the live spec still holds the APPROVED revision-1 content
    const liveReq = JSON.parse(readFileSync(join(dir, 'spec', 'requirements.json'), 'utf8')) as { statement: string }[];
    expect(liveReq[0]!.statement).toBe('Dealers can browse the catalogue.');
    expect(existsSync(join(dir, 'approvals', 'APPR-0002.json'))).toBe(false);
    // and no unapproved answers export replaced the approved one
    const answersDoc = JSON.parse(readFileSync(join(dir, 'clarify-answers.json'), 'utf8')) as Record<string, string>;
    expect(answersDoc['DEC-0004']).toBe(ANSWERS[0]!.answer);
  });

  it('approval file naming is dense and ordered', () => {
    expect(approvalFileName(1)).toBe('APPR-0001.json');
    expect(approvalFileName(42)).toBe('APPR-0042.json');
  });
});
