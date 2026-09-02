import { describe, it, expect } from 'vitest';
import { parseArgs, renewSubHelp } from './args';


// --- M-04/H-05/L-01: renew per-subcommand grammar ---------------------------------

describe('renew CLI grammar (M-04)', () => {
  const p = (argv: string[]): ReturnType<typeof parseArgs> =>
    parseArgs(['renew', ...argv]);

  it('rejects --answers together with --interactive', () => {
    const r = p(['review', '/tmp/p', '--answers', 'a.json', '--interactive']);
    expect('error' in r && r.error).toMatch(/mutually exclusive/i);
  });

  it('rejects --no-open without --interactive', () => {
    const r = p(['review', '/tmp/p', '--answers', 'a.json', '--no-open']);
    expect('error' in r && r.error).toMatch(/only meaningful with --interactive/i);
  });

  it('rejects a flag belonging to ANOTHER subcommand', () => {
    const r = p(['status', '/tmp/p', '--out', 'x.md']);
    expect('error' in r && r.error).toMatch(/not valid for 'renew status'/);
  });

  it('rejects a missing flag VALUE (value is itself a flag)', () => {
    const r = p(['init', '/tmp/p', '--target', '/repo', '--name', '--target']);
    expect('error' in r && r.error).toMatch(/--name requires a value/);
  });

  it('rejects invalid numeric budget values', () => {
    const r = p(['analyze', '/tmp/p', '--max-attempts', 'abc']);
    expect('error' in r && r.error).toMatch(/positive integer/);
  });

  it('accepts valid budget flags on analyze', () => {
    const r = p(['analyze', '/tmp/p', '--max-attempts', '5', '--max-wall-ms', '60000']);
    expect('renew' in r && r.renew.sub === 'analyze' && (r.renew as { budget?: object }).budget).toBeTruthy();
  });

  it('per-subcommand help is specific and carries no models prose (L-01)', () => {
    for (const sub of ['init', 'refresh', 'status', 'analyze', 'review', 'plan', 'export'] as const) {
      const help = renewSubHelp(sub);
      expect(help).toContain(`lco renew ${sub}`);
      expect(help).not.toMatch(/models|MODEL_REGISTRY/i);
      expect(help.length).toBeGreaterThan(80);
    }
    expect(renewSubHelp('analyze')).toMatch(/PAID/);
    expect(renewSubHelp('export')).toMatch(/read-only/);
  });

  it('renew <sub> --help routes to the subcommand help', () => {
    const r = parseArgs(['renew', 'init', '/tmp/p', '--help']);
    expect('renewSubHelp' in r && r.renewSubHelp).toBe('init');
  });
});
