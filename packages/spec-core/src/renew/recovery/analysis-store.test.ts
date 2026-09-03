import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAnalysisRecords, nextAnalysisId, persistAnalysisRecord } from './analysis-store';
import { AnalysisRecordSchema } from './schemas';

const tmpDirs: string[] = [];
function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lco-store-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

function record(id: string) {
  return AnalysisRecordSchema.parse({
    schema_version: 1,
    analysis_id: id,
    snapshot_id: 'RSN-deadbeefdeadbeef',
    created_at: '2026-09-02T00:00:00Z',
    role: 'renew_recover',
    model: { gateway: 'test', provider_kind: 'openai-compatible', requested_model: 'm' },
    prompt_protocol: 'lco-renew/recovery-v1',
    scope: { type: 'whole' },
    input: { context_digest: `sha256:${'a'.repeat(64)}`, item_count: 1, slice_count: 0, truncated: false, warnings: [] },
    outcome: 'validated',
    validation: { schema_ok: true, retry_used: false, issues: [], anchors_total: 0, anchors_ok: 0, anchors_failed: 0 },
    promoted: { hypotheses: [], uncertainties: [] },
    rejected: [],
    coverage_notes: [],
    usage: { calls: 1, attempts: 1, in_tokens: 0, out_tokens: 0, usage_known: false },
  });
}

describe('analysis store (immutable, write-once)', () => {
  it('assigns sequential ids', () => {
    expect(nextAnalysisId([])).toBe('AN-0001');
    expect(nextAnalysisId(['AN-0001', 'AN-0002'])).toBe('AN-0003');
    expect(nextAnalysisId(['AN-0009'])).toBe('AN-0010');
  });

  it('persists write-once: a second write of the same id is refused', () => {
    const dir = freshDir();
    // Trust kernel: authorized exclusive create — (projectDir, analysesDir, record);
    // the temp dir serves as both (the records land directly inside it).
    expect(persistAnalysisRecord(dir, dir, record('AN-0001'))).toMatchObject({ ok: true });
    const second = persistAnalysisRecord(dir, dir, record('AN-0001'));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('already_exists');
  });

  it('loads records sorted by id and reports corrupt files honestly', () => {
    const dir = freshDir();
    persistAnalysisRecord(dir, dir, record('AN-0002'));
    persistAnalysisRecord(dir, dir, record('AN-0001'));
    writeFileSync(join(dir, 'AN-0003.json'), '{corrupt');
    const loaded = loadAnalysisRecords(dir);
    expect(loaded.records.map((r) => r.analysis_id)).toEqual(['AN-0001', 'AN-0002']);
    expect(loaded.corrupt).toEqual(['AN-0003.json']);
  });
});
