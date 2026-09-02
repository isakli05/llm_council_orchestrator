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

describe('auth-header shapes (S2-C-03: the scheme-less charset cannot cross the space after the scheme)', () => {
  // Synthetic base64 ONLY — "username:password" of equally synthetic bytes.
  const BASIC = 'Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=';

  it('redacts Basic auth headers including the scheme-prefixed token', () => {
    const r = redactSecrets(`const req = { headers: { '${BASIC}' } };`);
    expect(r.text).not.toContain('dXNlcm5hbWU6cGFzc3dvcmQ=');
    expect(r.text).toContain('[REDACTED:auth-header]');
    expect(r.count).toBeGreaterThanOrEqual(1);
  });

  it('redacts Digest and other named auth schemes (case-insensitive)', () => {
    const digest = redactSecrets('Authorization: Digest YWJjZGVmZ2hpamtsbW5vcA==');
    expect(digest.text).not.toContain('YWJjZGVmZ2hpamtsbW5vcA==');
    expect(digest.text).toContain('[REDACTED:auth-header]');
    const lower = redactSecrets('authorization: basic dXNlcm5hbWU6cGFzc3dvcmQ=');
    expect(lower.text).toContain('[REDACTED:auth-header]');
    const aws = redactSecrets('Authorization: AWS4-HMAC-SHA256 SGVsbG9Bd3M0U2lnbmluZ0tleQ==');
    expect(aws.text).toContain('[REDACTED:auth-header]');
  });

  it('keeps the scheme-less high-entropy header rule and bearer markers distinct', () => {
    const raw = redactSecrets('X-Api-Key: c3ludGhldGljLWFwaS1rZXktMTIzNDU2');
    expect(raw.text).toContain('[REDACTED:auth-header]');
    const bearer = redactSecrets('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(bearer.text).toContain('[REDACTED:bearer-token]');
    // The scheme-aware rule never re-consumes an already-emitted marker.
    expect(bearer.text).not.toContain('[REDACTED:auth-header]');
  });
});

describe('L3 linear-time guarantee (ReDoS regression)', () => {
  it('long identifier-like runs redact in bounded time (no catastrophic backtracking)', () => {
    const minified = `const x${'a'.repeat(20_000)} = "${'v'.repeat(50)}";\nconst githubToken = "abcdef1234567890abcd";`;
    const started = Date.now();
    const r = redactSecrets(minified);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(2_000); // linear — completes near-instantly
    expect(r.text).toContain('[REDACTED:secret]');
    expect(r.text).not.toContain('abcdef1234567890abcd');
    // The non-credential long identifier and its value pass through untouched…
    expect(r.text).toContain('v'.repeat(50));
    // …and the credential-named assignment on the next line is redacted.
    expect(r.text).toContain('githubToken=[REDACTED:secret]');
  });

  // S2-H-07: the committed test above exercises a SUCCESSFUL match; the audit
  // measured the no-match worst case (80k≈3.0s, 120k≈6.8s on the old engine).
  // This fixture is the scanner's true worst case per character: credential-
  // tailed identifiers that force the full assignment walk (separator, quote
  // probe, value run) yet never reach the 8-char value minimum, followed by
  // value characters that must be re-walked as ordinary identifiers.
  const noMatchWorstCase = (n: number): string => {
    const unit = 'apikey:vvvvvvv '; // tail match, 7-char value → full scan, NO redaction
    return unit.repeat(Math.floor(n / unit.length)) + 'a'.repeat(n % unit.length);
  };

  const bestOf = (fn: () => void, runs = 7): number => {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now();
      fn();
      best = Math.min(best, performance.now() - t0);
    }
    return best;
  };

  it('a no-match identifier line stays linear: time(2N) < time(N)×4, each run bounded', () => {
    // Sizes bracket the audit's measurements (80k≈3.0s, 120k≈6.8s on the old
    // engine; this scanner measures single-digit milliseconds at both).
    const n100 = noMatchWorstCase(100_000);
    const n200 = noMatchWorstCase(200_000);
    const r100 = { count: -1, len: -1 };
    const r200 = { count: -1, len: -1 };
    const t100 = bestOf(() => {
      const r = redactSecrets(n100);
      r100.count = r.count;
      r100.len = r.text.length;
    });
    const t200 = bestOf(() => {
      const r = redactSecrets(n200);
      r200.count = r.count;
      r200.len = r.text.length;
    });
    // No-match means no redaction: output length is input length, count is 0.
    expect(r100.count).toBe(0);
    expect(r200.count).toBe(0);
    expect(r100.len).toBe(n100.length);
    expect(r200.len).toBe(n200.length);
    // Absolute sanity bound (the old engine needed ~3s at 80k)…
    expect(t100).toBeLessThan(1_500);
    expect(t200).toBeLessThan(1_500);
    // …and the linear-ish ratio bound (quadratic would sit at ~4× already).
    expect(t200).toBeLessThan(t100 * 4);
  });
});
