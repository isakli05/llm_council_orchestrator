import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { authorizeRenewalPaths } from './paths';

/**
 * Deterministic function-coverage hardening for `authorizeRenewalPaths`
 * (INV-A / S2-C-01): the read-side authorization verdict for every renewal
 * state destination. Each case asserts the CONTRACT verdict and refusal
 * reason, not mere execution.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

function freshBase(): { base: string; root: string } {
  const base = mkdtempSync(join(tmpdir(), 'lco-paths-auth-'));
  dirs.push(base);
  const root = join(base, 'project');
  mkdirSync(root);
  return { base, root };
}

describe('authorizeRenewalPaths (INV-A renewal state-domain authorization)', () => {
  it('a project root that does not exist yet authorizes trivially (nothing can be pre-planted below it)', () => {
    const base = mkdtempSync(join(tmpdir(), 'lco-paths-auth-'));
    dirs.push(base);
    const ghost = join(base, 'never-created-root');
    const verdict = authorizeRenewalPaths({
      projectDir: ghost,
      destinations: [join(ghost, '.lco/renewal/state.json')],
    });
    expect(verdict).toEqual({ ok: true });
  });

  it('real-directory destinations under an existing root authorize', () => {
    const { root } = freshBase();
    const renewal = join(root, '.lco', 'renewal');
    mkdirSync(renewal, { recursive: true });
    const verdict = authorizeRenewalPaths({
      projectDir: root,
      destinations: [join(renewal, 'state.json'), join(renewal, 'snapshot.json')],
    });
    expect(verdict).toEqual({ ok: true });
  });

  it('a destination resolving OUTSIDE the root refuses with the containment reason', () => {
    const { base, root } = freshBase();
    const elsewhere = join(base, 'elsewhere', 'state.json');
    const verdict = authorizeRenewalPaths({ projectDir: root, destinations: [elsewhere] });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.message).toContain('outside the resolved project root');
  });

  it('a symlink planted on the state chain refuses (S2-C-01 attack shape: `.lco` redirecting outside)', () => {
    const { base, root } = freshBase();
    const victim = join(base, 'victim-target');
    mkdirSync(victim);
    // `<project>/.lco` -> outside: the destination RESOLVES outside the root.
    symlinkSync(victim, join(root, '.lco'));
    const verdict = authorizeRenewalPaths({
      projectDir: root,
      destinations: [join(root, '.lco/renewal/state.json')],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.message).toContain('outside the resolved project root');
  });

  it('a symlink planted AT the final destination component refuses naming the link (no-follow walk arm)', () => {
    const { root } = freshBase();
    const renewal = join(root, '.lco', 'renewal');
    mkdirSync(renewal, { recursive: true });
    // The final component itself is a link (dangling included): the resolved
    // destination stays inside the root, so the containment check passes and
    // the no-follow walk is what must refuse — naming the link.
    symlinkSync(join(root, 'elsewhere-inside'), join(renewal, 'state.json'));
    const verdict = authorizeRenewalPaths({
      projectDir: root,
      destinations: [join(renewal, 'state.json')],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.message).toContain('renewal state domain refused');
    expect(verdict.message).toContain('state.json');
  });
});
