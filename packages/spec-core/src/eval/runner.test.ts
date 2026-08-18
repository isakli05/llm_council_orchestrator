import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPipeline, stripJsonFences } from './runner';
import type { LlmAdapter, LlmResponse } from './llm/adapter';
import { EVAL_TASKS } from './tasks';
import type { EvalTask, EvalTaskId } from './tasks';
import type { SpecBundle } from '../schemas';

const NOW = '2026-08-18T12:00:00Z';

const PET_CLINIC = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/good/pet-clinic/bundle.json'), 'utf8'),
) as SpecBundle;

function task(id: EvalTaskId): EvalTask {
  const t = EVAL_TASKS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown task ${id}`);
  return t;
}

/** pet-clinic fixture re-intented for ET-01 (URL shortener CLI, p-mini greenfield). */
function et01Bundle(): SpecBundle {
  const b = structuredClone(PET_CLINIC);
  b.intent = {
    statement:
      'URL shortening CLI: 7-char alphanumeric-with-dash codes, single SQLite file, shorten/stats/resolve subcommands, click counting, exit 3 on unknown code.',
    normalized: 'url shortener cli: shorten, stats, resolve; sqlite; click counts',
  };
  b.manifest.project = { name: 'url-shortener-cli', mode: 'greenfield' };
  b.manifest.complexity_profile = 'p-mini';
  return b;
}

/** pet-clinic fixture re-intented for ET-13 with an unresolved leak (L08 fodder). */
function et13UnresolvedBundle(): SpecBundle {
  const b = structuredClone(PET_CLINIC);
  b.intent = {
    statement:
      'Small-shop stock tool; database undecided, report types unknown, user count and concurrency model undecided.',
    normalized: 'stock tracking tool; db/reports/users undecided',
  };
  b.manifest.project = { name: 'stock-tool', mode: 'greenfield' };
  b.manifest.complexity_profile = 'p-mini';
  b.decisions[0]!.status = 'UNRESOLVED';
  b.manifest.unresolved_count = 1;
  return b;
}

/**
 * Counting scripted LLM: records every prompt, counts every call, and returns
 * deterministic per-call usage (in 10*n / out 5*n) so token accounting is
 * arithmetic, not guesswork. Throws on any call beyond the script — the runner
 * must never trigger one.
 */
function makeLlm(responses: string[]): {
  llm: LlmAdapter;
  calls: () => number;
  prompts: string[];
} {
  let n = 0;
  const prompts: string[] = [];
  const llm: LlmAdapter = {
    async complete(prompt: string): Promise<LlmResponse> {
      n += 1;
      prompts.push(prompt);
      const text = responses[n - 1];
      if (text === undefined) {
        throw new Error(`test-llm: unexpected call #${n} (script has ${responses.length})`);
      }
      return { text, usage: { in_tokens: 10 * n, out_tokens: 5 * n } };
    },
  };
  return { llm, calls: () => n, prompts };
}

describe('runPipeline — single variant', () => {
  it('(a) greenfield ET-01 + valid bundle JSON → kind spec, lint clean, exactly 1 call', async () => {
    const { llm, calls } = makeLlm([JSON.stringify(et01Bundle())]);
    const out = await runPipeline(task('ET-01'), 'single', llm, NOW);

    expect(out.kind).toBe('spec');
    expect(out.variant).toBe('single');
    if (out.kind === 'spec') {
      expect(out.bundle.manifest.project.name).toBe('url-shortener-cli');
      expect(out.bundle.manifest.state).toBe('draft');
      expect(out.bundle.requirements).toHaveLength(3);
    }
    expect(calls()).toBe(1);
    expect(out.usage).toEqual({ in: 10, out: 5, calls: 1 });
  });

  it('(a) accepts output wrapped in ```json fences', async () => {
    const fenced = '```json\n' + JSON.stringify(et01Bundle()) + '\n```';
    const { llm } = makeLlm([fenced]);
    const out = await runPipeline(task('ET-01'), 'single', llm, NOW);
    expect(out.kind).toBe('spec');
  });

  it('(b) ambiguous ET-13 + UNRESOLVED decision leak → blocked with L08 reasons', async () => {
    const { llm } = makeLlm([JSON.stringify(et13UnresolvedBundle())]);
    const out = await runPipeline(task('ET-13'), 'single', llm, NOW);

    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') {
      const l08 = out.reasons.filter((r) => r.includes('L08_UNRESOLVED_LEAK'));
      // one error for the UNRESOLVED decision, one for manifest.unresolved_count > 0
      expect(l08).toHaveLength(2);
      expect(out.reasons.some((r) => r.includes('DEC-0001'))).toBe(true);
      expect(out.reasons.some((r) => r.includes('manifest.unresolved_count'))).toBe(true);
    }
    expect(out.usage).toEqual({ in: 10, out: 5, calls: 1 });
  });

  it('(c) garbage text → blocked with schema-validation reason', async () => {
    const { llm } = makeLlm(['I am sorry, I cannot produce that as JSON. Here is prose instead.']);
    const out = await runPipeline(task('ET-01'), 'single', llm, NOW);

    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') {
      expect(out.reasons).toHaveLength(1);
      expect(out.reasons[0]).toMatch(/LLM output failed schema validation/);
    }
  });

  it('(c) valid JSON that is not a SpecBundle → blocked with schema-validation reason', async () => {
    const { llm } = makeLlm(['{"hello":"world"}']);
    const out = await runPipeline(task('ET-01'), 'single', llm, NOW);

    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') {
      expect(out.reasons[0]).toMatch(/LLM output failed schema validation/);
    }
  });

  it('propagates adapter errors instead of fabricating an outcome', async () => {
    const boom: LlmAdapter = {
      complete: async () => {
        throw new Error('provider down');
      },
    };
    await expect(runPipeline(task('ET-01'), 'single', boom, NOW)).rejects.toThrow('provider down');
  });
});

describe('runPipeline — council variant', () => {
  const CLASSIFIER_OK = JSON.stringify({ profile: 'p-mini', must_be_blocked: false });
  const proposalAJson = (): string => {
    const b = et01Bundle();
    b.manifest.council_run = { run_id: 'sentinel-proposal-a-7q4z', config_fingerprint: 'cfg-x' };
    return JSON.stringify(b);
  };

  it('(d) makes EXACTLY 3 calls and returns the final bundle as spec', async () => {
    const { llm, calls, prompts } = makeLlm([
      CLASSIFIER_OK,
      proposalAJson(),
      JSON.stringify(et01Bundle()),
    ]);
    const out = await runPipeline(task('ET-01'), 'council', llm, NOW);

    expect(out.kind).toBe('spec');
    expect(out.variant).toBe('council');
    expect(calls()).toBe(3);
    // usage sums across the three calls: in 10+20+30, out 5+10+15
    expect(out.usage).toEqual({ in: 60, out: 30, calls: 3 });
    expect(prompts).toHaveLength(3);
    // call 3 (proposeB+judge) receives proposal A's JSON verbatim
    expect(prompts[2]).toContain('sentinel-proposal-a-7q4z');
    // call 2 (independent proposal) does not see A
    expect(prompts[1]).not.toContain('sentinel-proposal-a-7q4z');
  });

  it('garbage FINAL output → blocked after exactly 3 calls', async () => {
    const { llm, calls } = makeLlm([CLASSIFIER_OK, proposalAJson(), 'not json, sorry']);
    const out = await runPipeline(task('ET-01'), 'council', llm, NOW);

    expect(out.kind).toBe('blocked');
    expect(calls()).toBe(3);
    if (out.kind === 'blocked') {
      expect(out.reasons[0]).toMatch(/LLM output failed schema validation/);
    }
  });

  it('garbage CLASSIFIER output → blocked (fail-closed on step 1, no further calls)', async () => {
    const { llm, calls } = makeLlm(['nope']);
    const out = await runPipeline(task('ET-01'), 'council', llm, NOW);

    expect(out.kind).toBe('blocked');
    expect(calls()).toBe(1);
    if (out.kind === 'blocked') {
      expect(out.reasons[0]).toMatch(/schema validation/);
    }
  });

  it('UNRESOLVED leak in the final council output → blocked with L08 reasons', async () => {
    const { llm } = makeLlm([
      JSON.stringify({ profile: 'p-mini', must_be_blocked: true }),
      proposalAJson(),
      JSON.stringify(et13UnresolvedBundle()),
    ]);
    const out = await runPipeline(task('ET-13'), 'council', llm, NOW);

    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') {
      expect(out.reasons.some((r) => r.includes('L08_UNRESOLVED_LEAK'))).toBe(true);
    }
  });
});

describe('stripJsonFences', () => {
  it('returns plain JSON untouched', () => {
    expect(stripJsonFences('{"a":1}')).toBe('{"a":1}');
  });

  it('unwraps a ```json fence', () => {
    expect(stripJsonFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('unwraps a bare ``` fence', () => {
    expect(stripJsonFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('trims surrounding whitespace of unfenced text', () => {
    expect(stripJsonFences('  {"a":1}\n')).toBe('{"a":1}');
  });
});
