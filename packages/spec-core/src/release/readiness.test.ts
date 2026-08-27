import { describe, expect, it } from 'vitest';
import { evaluateReleaseReadiness } from './readiness';

/**
 * P2-6 publish gate — the PURE decision core. The boundary half
 * (spawn git, read package.json, print, exit) lives in
 * `scripts/prepublish-check.js`; these tests pin the decision table so
 * both a local `npm publish` and the CI publish workflow inherit it
 * through `prepublishOnly`.
 */
describe('evaluateReleaseReadiness (P2-6 dirty/untagged publish ban)', () => {
  it('accepts a clean tree at an exact v-prefixed tag matching package.json', () => {
    const r = evaluateReleaseReadiness({
      statusPorcelain: '',
      exactTag: 'v0.1.0',
      packageVersion: '0.1.0',
    });
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('accepts a clean tree at an exact bare tag matching package.json', () => {
    const r = evaluateReleaseReadiness({
      statusPorcelain: '',
      exactTag: '0.1.0',
      packageVersion: '0.1.0',
    });
    expect(r.ok).toBe(true);
  });

  it('treats whitespace-only porcelain output as clean (defensive)', () => {
    const r = evaluateReleaseReadiness({
      statusPorcelain: '   \n',
      exactTag: 'v0.1.0',
      packageVersion: '0.1.0',
    });
    expect(r.ok).toBe(true);
  });

  it('refuses a dirty tree and teaches the fix in the reason', () => {
    const r = evaluateReleaseReadiness({
      statusPorcelain: ' M packages/spec-core/README.md\n',
      exactTag: 'v0.1.0',
      packageVersion: '0.1.0',
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toContain('dirty');
    // actionable: names the offending file and the git command
    expect(r.reasons[0]).toContain('packages/spec-core/README.md');
    expect(r.reasons[0]).toContain('git status --porcelain');
  });

  it('refuses a tree dirtied ONLY by untracked files (?? lines)', () => {
    const r = evaluateReleaseReadiness({
      statusPorcelain: '?? audit-output/draft.md\n',
      exactTag: 'v0.1.0',
      packageVersion: '0.1.0',
    });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toContain('untracked or modified');
  });

  it('caps the listed dirty entries and reports the remainder count', () => {
    const porcelain = Array.from({ length: 8 }, (_, i) => ` M file-${i}.ts`).join('\n') + '\n';
    const r = evaluateReleaseReadiness({
      statusPorcelain: porcelain,
      exactTag: 'v0.1.0',
      packageVersion: '0.1.0',
    });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toContain('file-4.ts'); // 5 listed (0..4)
    expect(r.reasons[0]).not.toContain('file-5.ts'); // rest summarized
    expect(r.reasons[0]).toContain('3 more');
  });

  it('refuses an untagged HEAD and names the tagging command', () => {
    const r = evaluateReleaseReadiness({
      statusPorcelain: '',
      exactTag: null,
      packageVersion: '0.1.0',
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toContain('git tag v0.1.0');
  });

  it('refuses an exact tag that does not match package.json version', () => {
    const r = evaluateReleaseReadiness({
      statusPorcelain: '',
      exactTag: 'v0.2.0',
      packageVersion: '0.1.0',
    });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toContain('v0.2.0');
    expect(r.reasons[0]).toContain('0.1.0');
  });

  it('is not fooled by version-prefix collisions (v0.1.0 vs 0.10.0)', () => {
    const r = evaluateReleaseReadiness({
      statusPorcelain: '',
      exactTag: 'v0.1.0',
      packageVersion: '0.10.0',
    });
    expect(r.ok).toBe(false);
  });

  it('reports dirty AND untagged together (reasons accumulate)', () => {
    const r = evaluateReleaseReadiness({
      statusPorcelain: ' M a.ts\n',
      exactTag: null,
      packageVersion: '0.1.0',
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(2);
  });

  it('refuses an empty-string tag (fail-closed: wrapper passes null on failure)', () => {
    const r = evaluateReleaseReadiness({
      statusPorcelain: '',
      exactTag: '',
      packageVersion: '0.1.0',
    });
    expect(r.ok).toBe(false);
  });
});
