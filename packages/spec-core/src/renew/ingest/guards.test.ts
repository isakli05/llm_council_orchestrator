import { describe, it, expect } from 'vitest';
import { DEFAULT_INGEST_LIMITS, guardPath, looksBinary } from './guards';

describe('guardPath (default-deny ingest rules for untrusted target repos)', () => {
  it('denies secret-shaped basenames', () => {
    for (const p of [
      '.env',
      '.env.production',
      'config/.env.local',
      'server.key',
      'certs/api.pem',
      'id_rsa',
      'ssh/id_rsa_old',
      'credentials.json',
      'secrets.yaml',
      'vault/token.p12',
    ]) {
      const v = guardPath(p);
      expect(v.include, p).toBe(false);
      if (v.include) return;
      expect(v.reason, p).toBe('denied_pattern');
    }
  });

  it('denies vendored/VCS/generated directory segments', () => {
    for (const p of [
      'node_modules/lib/x.js',
      '.git/config',
      'graphify-out/graph.json',
      'vendor/pkg/a.php',
      'dist/bundle.js',
      'build/out.js',
      '.lco/renewal/snapshot.json',
      'coverage/lcov.info',
    ]) {
      expect(guardPath(p).include, p).toBe(false);
    }
  });

  it('denies archives (never expanded)', () => {
    for (const p of ['backup.zip', 'dump.tar.gz', 'data.tgz', 'bundle.jar', 'old.7z']) {
      expect(guardPath(p).include, p).toBe(false);
    }
  });

  it('allows ordinary source and documentation files', () => {
    for (const p of ['src/orders.ts', 'README.md', 'package.json', 'src/components/App.vue', 'legacy/cobol-ish/cbl.src']) {
      expect(guardPath(p).include, p).toBe(true);
    }
  });

  it('matches basenames case-insensitively', () => {
    expect(guardPath('CERT.PEM').include).toBe(false);
    expect(guardPath('Keys/ID_RSA').include).toBe(false);
    expect(guardPath('Dist/app.js').include).toBe(false);
  });

  it('reports the matched rule as detail', () => {
    const v = guardPath('config/.env.production');
    if (v.include) throw new Error('expected deny');
    expect(v.detail).toMatch(/\.env/);
  });
});

describe('looksBinary', () => {
  it('detects NUL bytes early in the buffer', () => {
    expect(looksBinary(Buffer.from('text before\0binary after'))).toBe(true);
    expect(looksBinary(Buffer.concat([Buffer.from('a'.repeat(100)), Buffer.from([0])]))).toBe(true);
  });

  it('passes UTF-8 text and empty buffers', () => {
    expect(looksBinary(Buffer.from('export const x = 1;\n'))).toBe(false);
    expect(looksBinary(Buffer.alloc(0))).toBe(false);
  });
});

describe('DEFAULT_INGEST_LIMITS', () => {
  it('exposes the documented caps', () => {
    expect(DEFAULT_INGEST_LIMITS.maxFileBytes).toBeGreaterThan(0);
    expect(DEFAULT_INGEST_LIMITS.maxFiles).toBeGreaterThan(0);
    expect(DEFAULT_INGEST_LIMITS.maxTotalBytes).toBeGreaterThan(0);
  });
});
