import { describe, it, expect } from 'vitest';
import { parseArgs, commandHelp, USAGE } from './args';

/**
 * Branch-coverage companions to args.test.ts: the usage/error arms of the
 * non-renew command grammar — extra positionals, exactly-empty flag values,
 * invalid enum/numeric values, unknown flags, the models block, the generate
 * budget mapping, and the commandHelp fallback. parseArgs is a pure function
 * of argv: every call feeds an array, the real process.argv is never touched.
 */

const errOf = (argv: string[]): string => {
  const r = parseArgs(argv);
  if (!('error' in r)) throw new Error(`expected a parse error for: ${argv.join(' ')}`);
  return r.error;
};

describe('top-level and single-dir grammar', () => {
  it('change names every extra token after <changeset.json>', () => {
    expect(errOf(['change', 'd', 'c.json', 'extra', 'more'])).toBe(
      'unexpected extra arguments after <changeset.json>: extra more',
    );
  });

  it('renew --help WITHOUT a subcommand prints the generic renew command help (not a subcommand error)', () => {
    const r = parseArgs(['renew', '--help']);
    expect('commandHelp' in r && r.commandHelp).toBe('renew');
  });
});

describe('init', () => {
  it('an exactly-empty --name value is the missing-value case (never a silent empty name)', () => {
    expect(errOf(['init', 'd', '--name', ''])).toBe('missing value for --name');
  });
});

describe('check', () => {
  it('a non-positive or non-integer --timeout-ms is refused naming the bad value', () => {
    expect(errOf(['check', 'd', '--timeout-ms', '0'])).toBe('invalid --timeout-ms 0: expected a positive integer');
    expect(errOf(['check', 'd', '--timeout-ms', 'abc'])).toBe('invalid --timeout-ms abc: expected a positive integer');
  });

  it('a full valid invocation parses task, yes and timeout together', () => {
    expect(parseArgs(['check', 'd', '--task', 'TASK-0001', '--yes', '--timeout-ms', '60000'])).toEqual({
      command: 'check',
      dir: 'd',
      task: 'TASK-0001',
      yes: true,
      timeoutMs: 60000,
    });
  });
});

describe('models', () => {
  it('parses provider, config, json and limit together', () => {
    expect(parseArgs(['models', '--provider', 'openrouter', '--config', 'lco.config.json', '--json', '--limit', '5'])).toEqual({
      command: 'models',
      provider: 'openrouter',
      configPath: 'lco.config.json',
      json: true,
      limit: 5,
    });
  });

  it('a bare built-in provider parses without config or limit keys', () => {
    expect(parseArgs(['models', '--provider', 'routellm'])).toEqual({
      command: 'models',
      provider: 'routellm',
      json: false,
    });
  });

  it('a non-positive --limit is refused', () => {
    expect(errOf(['models', '--provider', 'openrouter', '--limit', '0'])).toBe(
      'invalid --limit 0: expected a positive integer',
    );
  });
});

describe('generate flag grammar', () => {
  it('exactly-empty values are missing values for every text flag', () => {
    expect(errOf(['generate', 'd', '--intent', ''])).toBe('missing value for --intent');
    expect(errOf(['generate', 'd', '--intent-file', ''])).toBe('missing value for --intent-file');
    expect(errOf(['generate', 'd', '--intent', 'x', '--llm-profile', ''])).toBe('missing value for --llm-profile');
    expect(errOf(['generate', 'd', '--intent', 'x', '--answers', ''])).toBe('missing value for --answers');
  });

  it('an invalid profile names the expectation (p-legacy stays unselectable)', () => {
    expect(errOf(['generate', 'd', '--intent', 'x', '--profile', 'p-critical'])).toBe(
      'invalid --profile p-critical: expected p-mini or p-standard',
    );
  });

  it('an unknown flag is an unexpected argument (never silently ignored)', () => {
    expect(errOf(['generate', 'd', '--intent', 'x', '--wat'])).toBe("unexpected argument for 'generate': --wat");
  });

  it('all three budget flags map onto ONE budget object', () => {
    expect(
      parseArgs(['generate', 'd', '--intent', 'x', '--max-attempts', '5', '--max-tokens', '1000', '--max-wall-ms', '60000']),
    ).toEqual({
      command: 'generate',
      dir: 'd',
      intent: 'x',
      intentFile: undefined,
      variant: 'single',
      profile: 'p-standard',
      budget: { maxAttempts: 5, maxTokens: 1000, maxWallMs: 60000 },
    });
  });

  it('a headless --answers round parses with answersFile set and no interactive flag', () => {
    expect(parseArgs(['generate', 'd', '--intent', 'x', '--answers', 'answers.json'])).toEqual({
      command: 'generate',
      dir: 'd',
      intent: 'x',
      intentFile: undefined,
      variant: 'single',
      profile: 'p-standard',
      answersFile: 'answers.json',
    });
  });
});

describe('commandHelp fallback', () => {
  it('a command missing from USAGE falls back to the full overview (never an empty help)', () => {
    // defensive arm: USAGE lost the entry — the overview is still honest help
    expect(commandHelp('nope' as Parameters<typeof commandHelp>[0])).toBe(USAGE);
  });
});
