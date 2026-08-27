import { describe, it, expect } from 'vitest';
import { ManifestSchema } from './manifest';

const validManifest = {
  spec_schema: 'lco-spec/1.0',
  spec_version: 1,
  project: { name: 'demo', mode: 'greenfield' },
  complexity_profile: 'p-standard',
  evidence_snapshot: { pack_hash: `sha256:${'a'.repeat(64)}`, collected_at: '2026-08-18T00:00:00Z' },
  state: 'draft',
  council_run: { run_id: 'run-1', config_fingerprint: 'fp-1' },
  artifact_hashes: { 'intent.md': `sha256:${'b'.repeat(64)}` },
  unresolved_count: 0,
  blocking_count: 0,
  target_runtime: { platform: 'node', stack: 'typescript' },
};

describe('ManifestSchema', () => {
  it('accepts a valid manifest without frozen_at', () => {
    expect(ManifestSchema.parse(validManifest)).toBeTruthy();
  });
  it('accepts a manifest with frozen_at', () => {
    expect(ManifestSchema.parse({ ...validManifest, frozen_at: '2026-08-18T01:00:00Z' })).toBeTruthy();
  });
  it('rejects wrong spec_schema literal', () => {
    expect(() => ManifestSchema.parse({ ...validManifest, spec_schema: 'lco-spec/2.0' })).toThrow();
  });
  it('rejects a future MAJOR with the DISTINCT version-policy error (PROD-005)', () => {
    const r = ManifestSchema.safeParse({ ...validManifest, spec_schema: 'lco-spec/2.0' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(['spec_schema']);
      // Distinct + actionable: names the major break, the range this
      // compiler reads, and scopes the migration tool to the future major.
      expect(r.error.issues[0].message).toMatch(/major/i);
      expect(r.error.issues[0].message).toMatch(/1\.x/);
      expect(r.error.issues[0].message).toMatch(/migration tool/i);
      expect(r.error.issues[0].message).not.toContain('Invalid literal value');
    }
  });
  it('rejects a newer 1.x minor with the upgrade/read-compat error', () => {
    const r = ManifestSchema.safeParse({ ...validManifest, spec_schema: 'lco-spec/1.2' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('lco-spec/1.2');
      expect(r.error.issues[0].message).toMatch(/upgrade/i);
      expect(r.error.issues[0].message).not.toContain('Invalid literal value');
    }
  });
  it('rejects a malformed version string with the expected-form error', () => {
    const r = ManifestSchema.safeParse({ ...validManifest, spec_schema: 'nonsense' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('lco-spec/<major>.<minor>');
      expect(r.error.issues[0].message).not.toContain('Invalid literal value');
    }
  });
  it('rejects spec_version below 1', () => {
    expect(() => ManifestSchema.parse({ ...validManifest, spec_version: 0 })).toThrow();
  });
  it('rejects negative spec_version', () => {
    expect(() => ManifestSchema.parse({ ...validManifest, spec_version: -1 })).toThrow();
  });
  it('rejects non-integer spec_version', () => {
    expect(() => ManifestSchema.parse({ ...validManifest, spec_version: 1.5 })).toThrow();
  });
  it('rejects invalid evidence pack hash', () => {
    expect(() => ManifestSchema.parse({
      ...validManifest,
      evidence_snapshot: { ...validManifest.evidence_snapshot, pack_hash: 'nope' },
    })).toThrow();
  });
  it('rejects unknown state', () => {
    expect(() => ManifestSchema.parse({ ...validManifest, state: 'done' })).toThrow();
  });
  it('rejects unknown complexity profile', () => {
    expect(() => ManifestSchema.parse({ ...validManifest, complexity_profile: 'p-huge' })).toThrow();
  });
  it('rejects negative counts', () => {
    expect(() => ManifestSchema.parse({ ...validManifest, unresolved_count: -1 })).toThrow();
    expect(() => ManifestSchema.parse({ ...validManifest, blocking_count: -1 })).toThrow();
  });
  it('rejects legacy mode value outside enum', () => {
    expect(() => ManifestSchema.parse({
      ...validManifest,
      project: { ...validManifest.project, mode: 'brownfield' },
    })).toThrow();
  });
  it('rejects empty project name', () => {
    expect(() => ManifestSchema.parse({
      ...validManifest,
      project: { ...validManifest.project, name: '' },
    })).toThrow();
  });
});
