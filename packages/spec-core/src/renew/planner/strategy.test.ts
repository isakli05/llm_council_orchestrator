import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MODERNIZATION_STRATEGIES,
  StrategyDecisionSchema,
  buildStrategyDecision,
  loadStrategy,
  parseStrategyDecision,
  persistStrategy,
} from './strategy';

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

describe('modernization strategy decision', () => {
  it('models the six audit strategies as data', () => {
    expect(MODERNIZATION_STRATEGIES).toHaveLength(6);
    expect(MODERNIZATION_STRATEGIES).toContain('strangler');
  });

  it('selection is always human, with rationale and snapshot lineage', () => {
    const d = buildStrategyDecision({
      strategy: 'strangler',
      rationale: 'incremental cutover fits the order pipeline',
      selectedVia: 'flag',
      snapshotId: 'RSN-deadbeefdeadbeef',
      nowIso: '2026-09-02T00:00:00Z',
    });
    expect(StrategyDecisionSchema.safeParse(d).success).toBe(true);
    expect(d.selected_by).toBe('human');
  });

  it('rejects an unexplained selection (no rubber-stamp strategies)', () => {
    expect(
      StrategyDecisionSchema.safeParse({
        strategy: 'full_rewrite',
        rationale: '',
        selected_by: 'human',
        selected_via: 'flag',
        selected_at: '2026-09-02T00:00:00Z',
        snapshot_id: 'RSN-deadbeefdeadbeef',
      }).success,
    ).toBe(false);
  });

  it('persists and reloads under .lco/renewal/strategy.json semantics', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lco-strat-'));
    tmpDirs.push(dir);
    const path = join(dir, 'strategy.json');
    const d = buildStrategyDecision({
      strategy: 'in_place',
      rationale: 'risk-minimal first phase',
      selectedVia: 'workspace',
      snapshotId: 'RSN-deadbeefdeadbeef',
      nowIso: '2026-09-02T00:00:00Z',
      approvalId: 'APPR-0002',
    });
    // Trust kernel: authorized write — the temp dir is the project root.
    expect(persistStrategy(dir, path, d)).toMatchObject({ ok: true });
    const loaded = loadStrategy(path);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.decision).toEqual(d);
    expect(loadStrategy(join(dir, 'missing.json')).ok).toBe(false);
  });

  it('trust kernel (S3-H-08): a workspace selection without an approval_id is unrepresentable', () => {
    expect(() =>
      buildStrategyDecision({
        strategy: 'in_place',
        rationale: 'risk-minimal first phase',
        selectedVia: 'workspace',
        snapshotId: 'RSN-deadbeefdeadbeef',
        nowIso: '2026-09-02T00:00:00Z',
      }),
    ).toThrowError(/workspace strategy selection must carry the approval_id/);
    // and a stored record of that shape no longer parses:
    const parse = parseStrategyDecision(
      JSON.stringify({
        schema_version: 1,
        strategy: 'in_place',
        rationale: 'risk-minimal first phase',
        selected_by: 'human',
        selected_via: 'workspace',
        selected_at: '2026-09-02T00:00:00Z',
        snapshot_id: 'RSN-deadbeefdeadbeef',
      }),
    );
    expect(parse.ok).toBe(false);
  });
});
