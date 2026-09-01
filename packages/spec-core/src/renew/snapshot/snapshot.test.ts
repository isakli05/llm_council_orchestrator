import { describe, it, expect } from 'vitest';
import {
  ProjectSnapshotSchema,
  createSnapshot,
  digestGraphManifest,
  evaluateStaleness,
  reloadSnapshot,
  type FileManifest,
} from './snapshot';

const FILES: FileManifest = [
  { path: 'package.json', sha256: 'sha256:' + 'a'.repeat(64) },
  { path: 'src/a.ts', sha256: 'sha256:' + 'b'.repeat(64) },
  { path: 'src/b.ts', sha256: 'sha256:' + 'c'.repeat(64) },
];

const MANIFEST_DIGEST = 'sha256:' + 'd'.repeat(64);

function baseInputs() {
  return {
    rootRealpath: '/repos/legacy-app',
    repoKind: 'git' as const,
    gitCommit: '0f1e2d3c4b5a6978879a6b5c4d3e2f100f1e2d3c',
    files: FILES,
    filesTruncated: false,
    graph: { graphifyVersion: '0.9.50', nodeCount: 11, edgeCount: 15 },
    graphManifest: { digest: MANIFEST_DIGEST, entries: 4 },
    nowIso: '2026-09-02T10:00:00.000Z',
  };
}

function withFiles(files: FileManifest) {
  return { ...baseInputs(), files };
}

describe('createSnapshot', () => {
  it('produces a schema-valid snapshot with an RSN id', () => {
    const snap = createSnapshot(baseInputs());
    expect(ProjectSnapshotSchema.safeParse(snap).success).toBe(true);
    expect(snap.snapshot_id).toMatch(/^RSN-[0-9a-f]{16}$/);
    expect(snap.schema_version).toBe(1);
    expect(snap.created_at).toBe('2026-09-02T10:00:00.000Z');
    expect(snap.target.repo_kind).toBe('git');
    expect(snap.graph.graphify_version).toBe('0.9.50');
  });

  it('identity is deterministic: same tree → same snapshot_id (created_at excluded)', () => {
    const a = createSnapshot(baseInputs());
    const b = createSnapshot({ ...baseInputs(), nowIso: '2026-09-02T11:30:00.000Z' });
    expect(a.snapshot_id).toBe(b.snapshot_id);
    expect(a.created_at).not.toBe(b.created_at);
  });

  it('identity changes when content, commit, or graph identity changes', () => {
    const base = createSnapshot(baseInputs());
    const mutated = createSnapshot(
      withFiles([
        { path: 'package.json', sha256: 'sha256:' + 'a'.repeat(64) },
        { path: 'src/a.ts', sha256: 'sha256:' + 'z'.repeat(64) },
        { path: 'src/b.ts', sha256: 'sha256:' + 'c'.repeat(64) },
      ]),
    );
    const newCommit = createSnapshot({ ...baseInputs(), gitCommit: 'f'.repeat(40) });
    const newGraph = createSnapshot({
      ...baseInputs(),
      graphManifest: { digest: 'sha256:' + 'e'.repeat(64), entries: 4 },
    });
    expect(mutated.snapshot_id).not.toBe(base.snapshot_id);
    expect(newCommit.snapshot_id).not.toBe(base.snapshot_id);
    expect(newGraph.snapshot_id).not.toBe(base.snapshot_id);
  });

  it('supports plain (non-git) targets explicitly', () => {
    const snap = createSnapshot({ ...baseInputs(), repoKind: 'plain', gitCommit: undefined });
    expect(snap.target.repo_kind).toBe('plain');
    expect(snap.target.git_commit).toBeUndefined();
  });
});

describe('reloadSnapshot', () => {
  it('round-trips through JSON', () => {
    const snap = createSnapshot(baseInputs());
    const back = reloadSnapshot(JSON.stringify(snap));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.snapshot).toEqual(snap);
  });

  it('fails closed on corrupt JSON and schema violations', () => {
    expect(reloadSnapshot('{nope').ok).toBe(false);
    const bad = { ...createSnapshot(baseInputs()), schema_version: 99 };
    expect(reloadSnapshot(JSON.stringify(bad)).ok).toBe(false);
  });
});

describe('evaluateStaleness', () => {
  const current = () => ({
    gitCommit: '0f1e2d3c4b5a6978879a6b5c4d3e2f100f1e2d3c',
    files: FILES,
    graphManifestDigest: MANIFEST_DIGEST,
    graphPresent: true,
    graphValid: true,
  });

  it('unchanged state → fresh', () => {
    const snap = createSnapshot(baseInputs());
    expect(evaluateStaleness(snap, current())).toEqual({ status: 'fresh' });
  });

  it('one-byte-equivalent content change → stale with file_changed + path', () => {
    const snap = createSnapshot(baseInputs());
    const r = evaluateStaleness(snap, {
      ...current(),
      files: [
        FILES[0],
        { path: 'src/a.ts', sha256: 'sha256:' + '1'.repeat(64) },
        FILES[2],
      ],
    });
    expect(r.status).toBe('stale');
    if (r.status !== 'stale') return;
    const changed = r.reasons.find((x) => x.code === 'file_changed');
    expect(changed?.paths).toEqual(['src/a.ts']);
  });

  it('added and removed files get distinct machine-readable codes', () => {
    const snap = createSnapshot(baseInputs());
    const r = evaluateStaleness(snap, {
      ...current(),
      files: [FILES[0], FILES[1]], // src/b.ts removed
    });
    if (r.status !== 'stale') throw new Error('expected stale');
    expect(r.reasons.some((x) => x.code === 'file_removed' && x.paths?.includes('src/b.ts'))).toBe(true);

    const r2 = evaluateStaleness(snap, {
      ...current(),
      files: [...FILES, { path: 'src/new.ts', sha256: 'sha256:' + '2'.repeat(64) }],
    });
    if (r2.status !== 'stale') throw new Error('expected stale');
    expect(r2.reasons.some((x) => x.code === 'file_added' && x.paths?.includes('src/new.ts'))).toBe(true);
  });

  it('commit change → target_commit_changed', () => {
    const snap = createSnapshot(baseInputs());
    const r = evaluateStaleness(snap, { ...current(), gitCommit: 'a'.repeat(40) });
    if (r.status !== 'stale') throw new Error('expected stale');
    expect(r.reasons.some((x) => x.code === 'target_commit_changed')).toBe(true);
  });

  it('graph manifest change → graph_manifest_changed', () => {
    const snap = createSnapshot(baseInputs());
    const r = evaluateStaleness(snap, { ...current(), graphManifestDigest: 'sha256:' + '9'.repeat(64) });
    if (r.status !== 'stale') throw new Error('expected stale');
    expect(r.reasons.some((x) => x.code === 'graph_manifest_changed')).toBe(true);
  });

  it('missing or invalid graph → graph_missing / graph_invalid', () => {
    const snap = createSnapshot(baseInputs());
    const missing = evaluateStaleness(snap, { ...current(), graphPresent: false });
    expect(missing.status).toBe('stale');
    if (missing.status === 'stale') {
      expect(missing.reasons.some((x) => x.code === 'graph_missing')).toBe(true);
    }
    const invalid = evaluateStaleness(snap, { ...current(), graphValid: false });
    if (invalid.status !== 'stale') throw new Error('expected stale');
    expect(invalid.reasons.some((x) => x.code === 'graph_invalid')).toBe(true);
  });

  it('bounds the reported path lists (first 20 + count)', () => {
    const snap = createSnapshot(baseInputs());
    const many: FileManifest = [];
    for (let i = 0; i < 30; i++) {
      many.push({ path: `src/f${String(i).padStart(2, '0')}.ts`, sha256: 'sha256:' + String(i % 10).repeat(64) });
    }
    const r = evaluateStaleness(snap, { ...current(), files: many });
    if (r.status !== 'stale') throw new Error('expected stale');
    const added = r.reasons.find((x) => x.code === 'file_added');
    expect(added?.paths).toHaveLength(20);
    expect(added?.more).toBe(10);
  });
});

describe('digestGraphManifest (stable graph identity)', () => {
  const manifestAt = (mtime: number, ast: string) => ({
    'src/a.ts': { mtime, seen: mtime + 1, ast_hash: ast, semantic_hash: ast },
  });

  it('ignores mtime/seen noise — same ASTs → same digest', () => {
    const a = digestGraphManifest(JSON.stringify(manifestAt(100, 'aa11')));
    const b = digestGraphManifest(JSON.stringify(manifestAt(999, 'aa11')));
    expect(a.digest).toBe(b.digest);
    expect(a.entries).toBe(1);
  });

  it('changes when an ast_hash changes', () => {
    const a = digestGraphManifest(JSON.stringify(manifestAt(100, 'aa11')));
    const b = digestGraphManifest(JSON.stringify(manifestAt(100, 'bb22')));
    expect(a.digest).not.toBe(b.digest);
  });

  it('handles absent/empty manifests with an explicit constant digest', () => {
    const a = digestGraphManifest('');
    const b = digestGraphManifest('{}');
    expect(a.digest).toBe(b.digest);
    expect(a.entries).toBe(0);
    expect(a.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('tolerates non-object garbage without throwing (defensive)', () => {
    const r = digestGraphManifest('not json');
    expect(r.entries).toBe(0);
  });
});
