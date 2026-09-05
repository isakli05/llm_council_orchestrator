import { describe, expect, it } from 'vitest';
import {
  CANONICAL_HASH_VERSION,
  KNOWN_HASH_VERSIONS,
  canonicalJson,
  domainDigest,
  isKnownHashVersion,
  sha256Content,
} from './canonical';

describe('trust canonical serialization', () => {
  it('key order never changes the canonical bytes', () => {
    const a = { z: 1, a: { y: [3, 2, 1], b: 'x' }, m: null };
    const b = { a: { b: 'x', y: [3, 2, 1] }, m: null, z: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('array order IS semantic (never sorted)', () => {
    expect(canonicalJson({ l: [1, 2] })).not.toBe(canonicalJson({ l: [2, 1] }));
  });

  it('is byte-stable for the frozen-spec shape (2-space indent)', () => {
    // The exact bytes artifact_hashes pin — guard against accidental format drift.
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{\n  "a": 2,\n  "b": 1\n}');
  });

  it('sha256Content is the framed sha256 hex form', () => {
    expect(sha256Content('abc')).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(sha256Content('abc')).toBe('sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('trust domain digests', () => {
  it('separates domains: same payload, different domain → different digest', () => {
    const payload = { snapshot_id: 'RSN-0123456789abcdef', files: ['a'] };
    const snap = domainDigest('LCO:SNAPSHOT', 1, payload);
    const auth = domainDigest('LCO:AUTHORITY', 3, payload);
    expect(snap).not.toBe(auth);
  });

  it('separates versions within a domain', () => {
    const payload = { x: 1 };
    expect(domainDigest('LCO:AUTHORITY', 2, payload)).not.toBe(domainDigest('LCO:AUTHORITY', 3, payload));
  });

  it('is deterministic and key-order independent', () => {
    expect(domainDigest('LCO:CONSENT', 1, { a: 1, b: 2 })).toBe(
      domainDigest('LCO:CONSENT', 1, { b: 2, a: 1 }),
    );
  });

  it('a digest from one domain never equals another domain digest of ANY simple payload', () => {
    // structural spot-check: the domain tag is inside the hashed bytes
    const d1 = domainDigest('LCO:PAID_CONTEXT', 1, '');
    const d2 = domainDigest('LCO:STATE_TX', 1, '');
    expect(d1).not.toBe(d2);
  });
});

describe('known hash versions (S3-M-02)', () => {
  it('implements exactly v1 and v2', () => {
    expect(KNOWN_HASH_VERSIONS).toEqual([1, 2]);
    expect(CANONICAL_HASH_VERSION).toBe(2);
  });

  it('future versions fail the knowledge check', () => {
    expect(isKnownHashVersion(1)).toBe(true);
    expect(isKnownHashVersion(2)).toBe(true);
    expect(isKnownHashVersion(3)).toBe(false);
    expect(isKnownHashVersion(99)).toBe(false);
  });
});
