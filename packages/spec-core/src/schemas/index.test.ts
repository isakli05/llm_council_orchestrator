import { describe, it, expect } from 'vitest';

describe('scaffold', () => {
  it('package is importable and exports a version constant', async () => {
    const mod = await import('./index');
    expect(mod.SPEC_SCHEMA_VERSION).toBe('lco-spec/1.0');
  });
});
