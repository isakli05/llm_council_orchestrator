import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RenewalApprovalRecordSchema,
  buildRenewalApprovalRecord,
  nextRenewalApprovalId,
  renewalApprovalDigest,
  writeRenewalApproval,
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
  it('builds a schema-valid record with a content digest over the canonical payload', () => {
    const record = buildRenewalApprovalRecord(payload, {
      approvalId: 'APPR-0001',
      sessionId: 's1',
      roundCount: 1,
      approvedAt: '2026-09-02T00:00:00Z',
      projectName: 'orders-crm',
    });
    expect(RenewalApprovalRecordSchema.safeParse(record).success).toBe(true);
    expect(record.content_digest).toBe(renewalApprovalDigest(payload));
    expect(renewalApprovalDigest(payload)).toBe(renewalApprovalDigest(JSON.parse(JSON.stringify(payload))));
  });

  it('writes immutably and refuses duplicate ids', () => {
    const dir = freshDir();
    const record = buildRenewalApprovalRecord(payload, {
      approvalId: 'APPR-0001',
      sessionId: 's1',
      roundCount: 1,
      approvedAt: '2026-09-02T00:00:00Z',
    });
    expect(writeRenewalApproval(dir, record)).toMatchObject({ ok: true });
    const second = writeRenewalApproval(dir, record);
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
