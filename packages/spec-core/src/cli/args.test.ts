import { describe, it, expect } from 'vitest';
import { parseArgs, renewSubHelp } from './args';
import type { RenewParsedArgs } from './args';


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

// --- S2-M-03/INV-H2: strict renew grammar (trim, duplicates, positionals) ----------

describe('renew strict grammar (INV-H2)', () => {
  const SUBS = ['init', 'refresh', 'status', 'analyze', 'review', 'plan', 'export'] as const;
  const VALUE_FLAGS: Record<(typeof SUBS)[number], readonly string[]> = {
    init: ['--target', '--name'],
    refresh: [],
    status: [],
    analyze: ['--llm-profile', '--max-attempts', '--max-tokens', '--max-wall-ms'],
    review: ['--answers'],
    plan: ['--strategy', '--strategy-rationale'],
    export: ['--out'],
  };
  const BOOL_FLAGS: Record<(typeof SUBS)[number], readonly string[]> = {
    init: [],
    refresh: [],
    status: ['--json'],
    analyze: [],
    review: ['--interactive', '--no-open'],
    plan: ['--freeze'],
    export: [],
  };
  const p = (argv: string[]): ReturnType<typeof parseArgs> => parseArgs(['renew', ...argv]);
  const errOf = (argv: string[]): string => {
    const r = p(argv);
    if (!('error' in r)) throw new Error(`expected a parse error for: renew ${argv.join(' ')}`);
    return r.error;
  };

  // 1. <dir> that is empty AFTER trim is a grammar error — never a silent
  //    whitespace path (values are used as paths: reject, don't normalize).
  it.each([...SUBS])('renew %s: whitespace-only <dir> is rejected', (sub) => {
    for (const ws of ['   ', ' \t ', '\n ']) {
      expect(errOf([sub, ws])).toMatch(/requires the LCO project <dir>/);
    }
  });

  // 2. Value flags: a whitespace-only value is empty AFTER trim — an error
  //    naming the flag ("requires a non-empty value").
  it.each(
    SUBS.flatMap((sub) => VALUE_FLAGS[sub].map((f) => [sub, f] as const)),
  )('renew %s: whitespace-only value for %s is rejected', (sub, flagName) => {
    const message = errOf([sub, '/tmp/p', flagName, '   ']);
    expect(message).toContain(`${flagName} requires a non-empty value`);
  });

  // 3. Duplicate value flags are an ambiguous invocation — never first-wins.
  it.each(
    SUBS.flatMap((sub) => VALUE_FLAGS[sub].map((f) => [sub, f] as const)),
  )('renew %s: duplicate value flag %s is rejected', (sub, flagName) => {
    const message = errOf([sub, '/tmp/p', flagName, 'first', flagName, 'second']);
    expect(message).toBe(`flag ${flagName} appears more than once — ambiguous invocation`);
  });

  // 4. Duplicate bool flags are equally ambiguous.
  it.each(
    SUBS.flatMap((sub) => BOOL_FLAGS[sub].map((f) => [sub, f] as const)),
  )('renew %s: duplicate bool flag %s is rejected', (sub, flagName) => {
    expect(errOf([sub, '/tmp/p', flagName, flagName])).toBe(
      `flag ${flagName} appears more than once — ambiguous invocation`,
    );
  });

  // 5. Extra positionals: renew <sub> takes exactly one <dir>.
  it.each([...SUBS])('renew %s: extra positional after <dir> is rejected', (sub) => {
    const message = errOf([sub, '/tmp/p', 'stray']);
    expect(message).toBe(`unexpected positional 'stray' — renew ${sub} takes exactly one <dir> argument`);
  });

  it('a non-flag token before the flags is the same extra-positional error', () => {
    expect(errOf(['status', '/tmp/p', 'stray', '--json'])).toBe(
      "unexpected positional 'stray' — renew status takes exactly one <dir> argument",
    );
  });

  it('a single-dash token is a positional (only -- prefixes flags)', () => {
    expect(errOf(['refresh', '/tmp/p', '-x'])).toBe(
      "unexpected positional '-x' — renew refresh takes exactly one <dir> argument",
    );
  });

  // Pre-INV-H2 contract retained: exactly-empty value = missing value.
  it('exactly-empty values keep the missing-value error', () => {
    expect(errOf(['init', '/tmp/p', '--target', ''])).toContain('--target requires a value');
    expect(errOf(['init', '/tmp/p', '--target', '/repo', '--name', ''])).toContain('--name requires a value');
  });

  it('non-empty values pass through verbatim (no silent trimming)', () => {
    const r = p(['export', '/tmp/p', '--out', '  r.md  ']);
    expect('renew' in r && (r.renew as { out?: string }).out).toBe('  r.md  ');
  });

  // 6. Valid canonical invocations parse to the EXACT same objects as before.
  it.each([
    [['init', '/tmp/p', '--target', '/repo'], { sub: 'init', dir: '/tmp/p', target: '/repo' }],
    [
      ['init', '/tmp/p', '--target', '/repo', '--name', 'legacy'],
      { sub: 'init', dir: '/tmp/p', target: '/repo', name: 'legacy' },
    ],
    [['refresh', '/tmp/p'], { sub: 'refresh', dir: '/tmp/p' }],
    [['status', '/tmp/p'], { sub: 'status', dir: '/tmp/p', json: false }],
    [['status', '/tmp/p', '--json'], { sub: 'status', dir: '/tmp/p', json: true }],
    [['analyze', '/tmp/p'], { sub: 'analyze', dir: '/tmp/p' }],
    [['analyze', '/tmp/p', '--llm-profile', 'renewal'], { sub: 'analyze', dir: '/tmp/p', llmProfile: 'renewal' }],
    [
      ['analyze', '/tmp/p', '--max-attempts', '5', '--max-tokens', '1000', '--max-wall-ms', '60000'],
      { sub: 'analyze', dir: '/tmp/p', budget: { maxAttempts: 5, maxTokens: 1000, maxWallMs: 60000 } },
    ],
    [['review', '/tmp/p', '--interactive'], { sub: 'review', dir: '/tmp/p', interactive: true, noOpen: false }],
    [
      ['review', '/tmp/p', '--interactive', '--no-open'],
      { sub: 'review', dir: '/tmp/p', interactive: true, noOpen: true },
    ],
    [
      ['review', '/tmp/p', '--answers', 'a.json'],
      { sub: 'review', dir: '/tmp/p', answersFile: 'a.json', interactive: false, noOpen: false },
    ],
    [['plan', '/tmp/p'], { sub: 'plan', dir: '/tmp/p', freeze: false }],
    [
      ['plan', '/tmp/p', '--strategy', 'strangler', '--strategy-rationale', 'why', '--freeze'],
      { sub: 'plan', dir: '/tmp/p', strategy: 'strangler', strategyRationale: 'why', freeze: true },
    ],
    [['export', '/tmp/p'], { sub: 'export', dir: '/tmp/p' }],
    [['export', '/tmp/p', '--out', 'r.md'], { sub: 'export', dir: '/tmp/p', out: 'r.md' }],
  ] as [string[], RenewParsedArgs][])('canonical invocation %j parses unchanged', (argv, expected) => {
    const r = p(argv);
    if (!('renew' in r)) throw new Error(`expected a parsed renew command for: ${argv.join(' ')}`);
    expect(r.renew).toEqual(expected);
  });
});
