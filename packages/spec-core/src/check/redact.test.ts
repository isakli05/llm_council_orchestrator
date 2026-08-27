import { describe, it, expect } from 'vitest';
import { redactSecrets, REDACTION_RULES } from './redact';

/**
 * SEC-004: a conservative best-effort redaction pass over captured command
 * output BEFORE it is persisted as evidence. Every rule is pinned here
 * per-pattern, together with the non-mangling guarantees — ordinary test
 * output must survive byte-identical.
 */

describe('redactSecrets: bearer tokens', () => {
  it('Authorization: Bearer <token> -> [REDACTED:bearer-token]', () => {
    const out = 'fetch failed\nAuthorization: Bearer AbCdEf1234567890aBcDeF';
    expect(redactSecrets(out)).toBe('fetch failed\nAuthorization: [REDACTED:bearer-token]');
  });

  it('lowercase bearer is caught too; a trailing separator is not swallowed', () => {
    expect(redactSecrets('bearer AbCdEf1234567890aBcDeF')).toBe('[REDACTED:bearer-token]');
    expect(redactSecrets('Bearer AbCdEf1234567890aBcDeF.')).toBe('[REDACTED:bearer-token].');
  });

  it('a SHORT bearer word is left alone (conservative — no false positives)', () => {
    expect(redactSecrets('Authorization: Bearer abc')).toBe('Authorization: Bearer abc');
    expect(redactSecrets('Bearer tokens are sent in headers')).toBe(
      'Bearer tokens are sent in headers',
    );
  });
});

describe('redactSecrets: sk-/zai- style API keys', () => {
  it('sk-<key> -> [REDACTED:api-key]', () => {
    expect(redactSecrets('invalid api key: sk-AbCdEf1234567890aBcDeF')).toBe(
      'invalid api key: [REDACTED:api-key]',
    );
  });

  it('zai-<key> -> [REDACTED:api-key]', () => {
    expect(redactSecrets('zai-AbCdEf1234567890aBcDeF rejected')).toBe(
      '[REDACTED:api-key] rejected',
    );
  });

  it('short/ordinary strings with sk- are NOT mangled', () => {
    expect(redactSecrets('sk-test')).toBe('sk-test');
    expect(redactSecrets('task-1 skip-pong')).toBe('task-1 skip-pong');
    // "task-" is not an sk- prefix; "sk-pong" is too short to be a key.
  });

  it('an sk- key embedded mid-word-boundary is still caught, not a longer word', () => {
    expect(redactSecrets('key=sk-AbCdEf1234567890aBcDeF!')).toBe('key=[REDACTED:api-key]!');
  });
});

describe('redactSecrets: PASSWORD=/TOKEN= style assignments', () => {
  it('PASSWORD=<value> keeps the name, redacts the value', () => {
    expect(redactSecrets('PASSWORD=hunter42')).toBe('PASSWORD=[REDACTED:secret]');
  });

  it('lowercase token= and api_key= forms are caught', () => {
    expect(redactSecrets('token=AbCdEf123456')).toBe('token=[REDACTED:secret]');
    expect(redactSecrets('api_key: "AbCdEf123456"')).toBe('api_key: [REDACTED:secret]');
  });

  it('SECRET=, ACCESS_KEY=, PRIVATE_KEY= variants', () => {
    expect(redactSecrets('SECRET=s3cr3tvalue')).toBe('SECRET=[REDACTED:secret]');
    expect(redactSecrets('ACCESS_KEY=AKIA1234567890')).toBe('ACCESS_KEY=[REDACTED:secret]');
    expect(redactSecrets('PRIVATE_KEY="pem-data-here"')).toBe('PRIVATE_KEY=[REDACTED:secret]');
  });

  it('ordinary KEY=value pairs are NOT mangled', () => {
    expect(redactSecrets('NODE_ENV=test')).toBe('NODE_ENV=test');
    expect(redactSecrets('exit 0')).toBe('exit 0');
    // 'token=1' style short values are below the redaction threshold.
    expect(redactSecrets('?token=1&x=2')).toBe('?token=1&x=2');
  });
});

describe('redactSecrets: JWT shapes (eyJ...)', () => {
  it('a three-segment JWT -> [REDACTED:jwt]', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N0w5N_X';
    expect(redactSecrets(`session: ${jwt}`)).toBe('session: [REDACTED:jwt]');
  });

  it('an unsigned (empty-signature) JWT is caught too', () => {
    expect(redactSecrets('eyJhbGciOiJub25lIn0.eyJ4IjoxfQ.')).toBe('[REDACTED:jwt]');
  });

  it('a bare eyJ-prefixed word is NOT a JWT (needs both dots)', () => {
    expect(redactSecrets('eyJNotAJwtTokenPlain')).toBe('eyJNotAJwtTokenPlain');
  });
});

describe('redactSecrets: non-secret output survives byte-identical', () => {
  it('typical test output is untouched', () => {
    const out = [
      'RUNS v1.2.3 /work/spec',
      '',
      '✓ tests/appointments.test.ts (3 tests) 12ms',
      '',
      'Test Files  1 passed (1)',
      '     Tests  3 passed (3)',
      '',
      'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ].join('\n');
    expect(redactSecrets(out)).toBe(out);
  });

  it('empty string stays empty; idempotent over its own output', () => {
    expect(redactSecrets('')).toBe('');
    const once = redactSecrets('TOKEN=AbCdEf123456 done');
    expect(redactSecrets(once)).toBe(once);
  });
});

describe('REDACTION_RULES surface', () => {
  it('exposes the four SEC-004 rule kinds for documentation/tests', () => {
    expect(REDACTION_RULES.map((r) => r.kind).sort()).toEqual([
      'api-key',
      'bearer-token',
      'jwt',
      'secret',
    ]);
  });
});
