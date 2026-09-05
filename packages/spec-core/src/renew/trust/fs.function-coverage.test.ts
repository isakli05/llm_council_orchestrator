import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { authorizedWrite } from './fs';

/**
 * Deterministic function-coverage hardening for the staging-cleanup path of
 * `authorizedWrite`: when the atomic rename fails AFTER the staging file was
 * written, the module's own staging entry must be removed (resource cleanup
 * contract) while the original error still propagates to the caller.
 *
 * The rename failure is produced WITHOUT any race: POSIX rename() refuses to
 * move a file onto an existing directory (EISDIR), so pre-creating the
 * destination as a real (symlink-free, authorization-clean) directory makes
 * the final renameSync deterministically fail after a successful staging
 * write — exercising exactly the cleanup arm.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

function freshProject(): string {
  const base = mkdtempSync(join(tmpdir(), 'lco-trust-fs-cov-'));
  dirs.push(base);
  return join(base, 'project');
}

describe('authorizedWrite staging cleanup on a failed rename', () => {
  it('a destination occupied by a real directory: the write refuses, the diagnosis propagates, and NO staging orphan is left behind', () => {
    const project = freshProject();
    const renewal = join(project, '.lco', 'renewal');
    mkdirSync(renewal, { recursive: true });
    // A real directory at the final destination: authorization-clean (no
    // symlinks anywhere on the chain) but rename(file -> dir) fails EISDIR.
    const dest = join(renewal, 'project.json');
    mkdirSync(dest);

    expect(() => authorizedWrite({ projectDir: project, path: dest, content: '{"x":1}\n' })).toThrow();

    // Resource-cleanup contract: the only entry in the state dir is the
    // pre-created directory — the `.project.json.lco-*.tmp` staging file the
    // write DID create was removed on the failure path.
    expect(readdirSync(renewal).sort()).toEqual(['project.json']);
    // The occupant itself is never touched (refusal, never clobber).
    expect(readdirSync(dest)).toEqual([]);
  });

  it('the cleanup failure does not poison later writes to clean destinations in the same project', () => {
    const project = freshProject();
    const renewal = join(project, '.lco', 'renewal');
    mkdirSync(renewal, { recursive: true });
    mkdirSync(join(renewal, 'project.json'));

    expect(() => authorizedWrite({ projectDir: project, path: join(renewal, 'project.json'), content: 'x' })).toThrow();

    // A different, clean destination in the same state dir still writes.
    authorizedWrite({ projectDir: project, path: join(renewal, 'snapshot.json'), content: '{"ok":true}\n' });
    expect(readdirSync(renewal).sort()).toEqual(['project.json', 'snapshot.json']);
  });
});
