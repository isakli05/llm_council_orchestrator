import { describe, it, expect } from 'vitest';
import { redactSecrets } from './redact';

describe('redactSecrets (before ANY prompt inclusion)', () => {
  it('redacts private-key blocks wholesale', () => {
    const src = 'const k = `-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\nmore\n-----END RSA PRIVATE KEY-----`;';
    const r = redactSecrets(src);
    expect(r.text).not.toContain('MIIEow');
    expect(r.text).toContain('[REDACTED:private-key]');
    expect(r.count).toBe(1);
  });

  it('redacts AWS-style access key ids', () => {
    const r = redactSecrets('const accessKey = "AKIAIOSFODNN7EXAMPLE";');
    expect(r.text).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(r.count).toBe(1);
  });

  it('redacts bearer tokens', () => {
    const r = redactSecrets('curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" https://x');
    expect(r.text).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(r.text).toContain('[REDACTED:bearer-token]');
  });

  it('redacts secret-shaped assignments while keeping the key NAME', () => {
    const r = redactSecrets('const conf = { api_key: "supersecretvalue123", password: "hunter2hunter2" };');
    expect(r.text).toMatch(/api_key\s*[:=]\s*\[REDACTED:secret\]/);
    expect(r.text).not.toContain('supersecretvalue123');
    expect(r.count).toBeGreaterThanOrEqual(2);
  });

  it('leaves ordinary code untouched (count 0)', () => {
    const src = 'export function applyDiscount(subtotal: number): number {\n  return subtotal;\n}\n';
    const r = redactSecrets(src);
    expect(r.text).toBe(src);
    expect(r.count).toBe(0);
  });

  it('counts multiple occurrences across kinds', () => {
    const r = redactSecrets('a=AKIA1234567890ABCDEF; b="Bearer abcdefghijklmnopqrstuvwx"; token: zzz1234567890aaa');
    expect(r.count).toBeGreaterThanOrEqual(3);
  });
});
