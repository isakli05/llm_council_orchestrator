import { lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadRenewalProject,
  loadSnapshotFile,
  persistRenewalProject,
  persistSnapshotFile,
  readStateRevision,
  renewalPaths,
} from './project';
import { authorizedWrite } from '../trust/fs';
import { TrustStateError } from '../trust/errors';
import { createSnapshot } from '../core/snapshot-record';

/**
 * Deterministic function-coverage hardening for the renewal project store
 * wrappers (persist helpers + the INV-B2 revision reader). Each test asserts
 * the write/read CONTRACT (path layout, content shape, mode, fail-closed
 * corruption handling), not mere execution.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

function freshProject(): string {
  const base = mkdtempSync(join(tmpdir(), 'lco-proj-store-'));
  dirs.push(base);
  return join(base, 'project');
}

const SHA64 = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const MINIMAL_PROJECT = {
  schema_version: 1 as const,
  name: 'store-roundtrip',
  target_path: '/tmp/lco-target-under-test',
  created_at: '2026-09-05T00:00:00.000Z',
  snapshot_id: 'RSN-0123456789abcdef',
};

// Built through the sanctioned constructor: the loader recomputes the
// content-bound identity (LCO:SNAPSHOT domain digest), so a hand-rolled id
// would (correctly) fail the tamper check. createSnapshot derives it.
const MINIMAL_SNAPSHOT = createSnapshot({
  rootRealpath: '/tmp/lco-target-under-test',
  repoKind: 'plain',
  files: [],
  filesTruncated: false,
  graph: { graphifyVersion: '0.9.50', nodeCount: 0, edgeCount: 0, graphDigest: SHA64 },
  graphManifest: { digest: SHA64, entries: 0 },
  nowIso: '2026-09-05T00:00:00.000Z',
});

describe('persistRenewalProject / loadRenewalProject round-trip', () => {
  it('writes project.json through the trusted writer (stable layout, 2-space JSON + newline, 0600) and reloads it', () => {
    const dir = freshProject();
    persistRenewalProject(dir, MINIMAL_PROJECT);

    const path = renewalPaths(dir).projectJson;
    const text = readFileSync(path, 'utf8');
    // The stores promise stable-on-disk shape: pretty JSON with a trailing newline.
    expect(text).toBe(`${JSON.stringify(MINIMAL_PROJECT, null, 2)}\n`);
    expect(lstatSync(path).mode & 0o777).toBe(0o600);

    const loaded = loadRenewalProject(dir);
    expect(loaded).toEqual({ ok: true, project: MINIMAL_PROJECT });
  });
});

describe('persistSnapshotFile / loadSnapshotFile round-trip', () => {
  it('writes snapshot.json through the trusted writer and reloads a schema-valid snapshot', () => {
    const dir = freshProject();
    persistSnapshotFile(dir, MINIMAL_SNAPSHOT);

    const path = renewalPaths(dir).snapshot;
    expect(readFileSync(path, 'utf8')).toBe(`${JSON.stringify(MINIMAL_SNAPSHOT, null, 2)}\n`);
    expect(lstatSync(path).mode & 0o777).toBe(0o600);

    const loaded = loadSnapshotFile(dir);
    expect(loaded).toEqual({ ok: true, snapshot: MINIMAL_SNAPSHOT });
  });
});

describe('readStateRevision (INV-B2 trusted revision, project-store wrapper)', () => {
  it('reads 0 for a pre-revision project (absent state.json stays loadable)', () => {
    const dir = freshProject();
    expect(readStateRevision(dir)).toBe(0);
  });

  it('reads the on-disk revision written through the trusted writer', () => {
    const dir = freshProject();
    const path = renewalPaths(dir).state;
    authorizedWrite({ projectDir: dir, path, content: `${JSON.stringify({ schema_version: 1, revision: 7 })}\n` });
    expect(readStateRevision(dir)).toBe(7);
  });

  it('fails CLOSED on a corrupt state.json (never silently resets the revision)', () => {
    const dir = freshProject();
    const path = renewalPaths(dir).state;
    authorizedWrite({ projectDir: dir, path, content: 'not json at all\n' });
    expect(() => readStateRevision(dir)).toThrowError(TrustStateError);
    expect(() => readStateRevision(dir)).toThrowError(/state_corrupt|corrupt/);
  });
});
