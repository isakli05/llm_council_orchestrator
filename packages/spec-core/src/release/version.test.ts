import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPackageVersion } from './version';

/**
 * The version-identity authority (release blocker, v0.2.0): the package.json
 * version is the ONE source; CLI --version and MCP serverInfo.version both
 * read it through ./version at runtime. These tests pin the reader itself:
 * the happy path is checked against an INDEPENDENT read of package.json
 * (bump-proof — a package.json change the module does not follow fails
 * here), and the malformed-package branches (driven through the path seam
 * with real files) must fail predictably (throw), never return a silently
 * stale value.
 */
describe('readPackageVersion (single release-version authority)', () => {
  it('returns exactly the package.json version (independent bump-proof read)', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as {
      version: string;
    };
    expect(readPackageVersion()).toBe(pkg.version);
    expect(readPackageVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('throws predictably when the version field is not a string', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lco-version-notstring-'));
    try {
      const path = join(dir, 'package.json');
      writeFileSync(path, '{"version":42}');
      expect(() => readPackageVersion(path)).toThrow('package.json has no usable version field');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws predictably when the version field is an empty string', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lco-version-empty-'));
    try {
      const path = join(dir, 'package.json');
      writeFileSync(path, '{"version":""}');
      expect(() => readPackageVersion(path)).toThrow('package.json has no usable version field');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws predictably when package.json is unparseable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lco-version-garbage-'));
    try {
      const path = join(dir, 'package.json');
      writeFileSync(path, 'not json at all');
      expect(() => readPackageVersion(path)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('propagates a missing package.json instead of inventing a version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lco-version-missing-'));
    try {
      expect(() => readPackageVersion(join(dir, 'package.json'))).toThrow(/ENOENT/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
