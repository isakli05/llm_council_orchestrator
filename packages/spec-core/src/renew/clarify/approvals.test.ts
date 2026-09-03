import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RenewalApprovalRecordSchema,
  buildRenewalApprovalRecord,
  loadRenewalApproval,
  nextRenewalApprovalId,
  renewalApprovalDigest,
  writeRenewalApproval,
  type RenewalApprovalRecord,
  type RenewalDecisionSet,
} from './approvals';

const tmpDirs: string[] = [];
function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lco-appr-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

const payload: RenewalDecisionSet = {
  decisions: [
    {
      claim_id: 'STG-0001',
      kind: 'strategy',
      selected_option: 'strangler',
      evidence: { source: 'renewal-clarify:s1/round1', answer_text: 'strangler', hash: `sha256:${'a'.repeat(64)}` },
    },
  ],
};

describe('renewal approval records', () => {
  const build = (overrides: Partial<Parameters<typeof buildRenewalApprovalRecord>[0]> = {}): RenewalApprovalRecord =>
    buildRenewalApprovalRecord({
      approval_id: 'APPR-0001',
      session_id: 's1',
      round_count: 1,
      approved_at: '2026-09-02T00:00:00Z',
      project_name: 'orders-crm',
      snapshot_id: 'RSN-deadbeefdeadbeef',
      decisions: payload.decisions,
      ...overrides,
    });

  it('builds a schema-valid record with a content digest over the canonical payload', () => {
    const record = build();
    expect(RenewalApprovalRecordSchema.safeParse(record).success).toBe(true);
    // S2-C-04 (digest v3): the digest binds ALL authority fields — identity,
    // scope (project + snapshot, REQUIRED since v3), and decisions — over one
    // canonical serialization.
    const authority = {
      schema_version: 1 as const,
      approval_id: 'APPR-0001',
      session_id: 's1',
      round_count: 1,
      project_name: 'orders-crm',
      snapshot_id: 'RSN-deadbeefdeadbeef',
      decisions: payload.decisions,
      // the digest ignores approved_at/content_digest, but the parameter type
      // requires the complete record shape.
      approved_at: '2026-09-02T00:00:00Z',
      content_digest: record.content_digest,
    };
    expect(record.content_digest).toBe(renewalApprovalDigest(authority));
    expect(renewalApprovalDigest(authority)).toBe(renewalApprovalDigest(JSON.parse(JSON.stringify(authority))));
    // approved_at is NOT authority-bearing — moving it never moves the digest…
    const later = build({ approved_at: '2027-01-01T00:00:00Z' });
    expect(later.content_digest).toBe(record.content_digest);
    // …while any authority-bearing field change MUST move it (scope included —
    // v3 binds project AND snapshot).
    expect(renewalApprovalDigest({ ...authority, session_id: 's2' })).not.toBe(record.content_digest);
    expect(renewalApprovalDigest({ ...authority, round_count: 2 })).not.toBe(record.content_digest);
    expect(renewalApprovalDigest({ ...authority, project_name: 'other-crm' })).not.toBe(record.content_digest);
    expect(
      renewalApprovalDigest({ ...authority, decisions: [{ ...payload.decisions[0]!, selected_option: 'in_place' }] }),
    ).not.toBe(record.content_digest);
  });

  it('trust kernel (S3-C-04): a v2-shaped record (no scope) fails closed as approval_corrupt', () => {
    const dir = freshDir();
    // v2 shape: scope omitted entirely — schema-invalid under v3, never a load.
    const v2 = build() as unknown as Record<string, unknown>;
    delete v2.project_name;
    delete v2.snapshot_id;
    writeFileSync(join(dir, 'APPR-0001.json'), JSON.stringify(v2));
    const r = loadRenewalApproval(join(dir, 'APPR-0001.json'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('approval_corrupt');
      expect(r.message).toMatch(/pre-v3|re-approve/);
    }
  });

  it('writes immutably and refuses duplicate ids', () => {
    const dir = freshDir();
    const record = build();
    // Trust kernel: authorized exclusive create — (projectDir, approvalsDir, record).
    expect(writeRenewalApproval(dir, dir, record)).toMatchObject({ ok: true });
    const second = writeRenewalApproval(dir, dir, record);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('already_exists');
    expect(() => readFileSync(join(dir, 'APPR-0001.json'), 'utf8')).not.toThrow();
  });

  it('numbers sequentially from existing files', () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'APPR-0002.json'), '{}');
    expect(nextRenewalApprovalId(dir)).toBe('APPR-0003');
    expect(nextRenewalApprovalId(freshDir())).toBe('APPR-0001');
  });
});
