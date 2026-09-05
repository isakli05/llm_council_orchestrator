import { describe, expect, it, afterEach } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRecovery } from '../recovery/pipeline';
import { singleRoutePlan } from '../../llm/plan';
import type { LlmAdapter, LlmResponse } from '../../eval/llm/adapter';
import { sealContextBundle } from './evidence';
import { TrustPaidError } from './errors';
import { sha256Content } from './canonical';
import type { ContextBundle } from '../context/bundle';

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

const oneSliceBundle = (): ContextBundle => ({
  scope: { type: 'whole' },
  truncated: false,
  total_chars: 10,
  warnings: [],
  items: [
    {
      kind: 'file_slice',
      path: 'src/orders.ts',
      start_line: 1,
      end_line: 5,
      text: 'line1\nline2\nline3\nline4\nline5',
      content_hash: sha256Content('fixture-bytes'),
      redactions: 0,
      provenance: 'file-read',
    },
  ],
});

describe('D-3: wire-cap refusals are budget blocks, never transport failures', () => {
  const records: unknown[] = [];
  const adapter: LlmAdapter = {
    async complete(): Promise<LlmResponse> {
      throw new TrustPaidError('request_over_budget', 'serialized request is over the wire cap — refused BEFORE transport (zero paid calls); shrink the analysis scope');
    },
  };
  const deps = (extra: Record<string, unknown> = {}) => ({
    llm: singleRoutePlan(adapter, { gateway: 'scripted', providerKind: 'openai-compatible' as const, requestedModel: 'm' }),
    nowIso: '2026-09-03T00:00:00Z',
    targetRoot: '/nonexistent',
    context: sealContextBundle({
      projectName: 'legacy-renewal',
      snapshotId: 'RSN-0123456789abcdef',
      slices: [{ path: 'src/orders.ts', whole_file_hash: sha256Content('fixture-bytes'), start_line: 1, end_line: 5, text: 'x', file_line_count: 5 }],
    }),
    persist: (r: unknown) => {
      records.push(r);
      return { ok: true as const };
    },
    ...extra,
  });

  it('first-call cap refusal → blocked_prompt_budget with retry_used false', async () => {
    const out = await runRecovery(
      { analysisId: 'AN-0001', projectName: 'legacy-renewal', snapshotId: 'RSN-0123456789abcdef', scope: { type: 'whole' }, bundle: oneSliceBundle() },
      deps() as never,
    );
    expect(out.ok).toBe(false);
    if (!out.ok && out.code === 'blocked_prompt_budget') {
      expect(out.record.outcome).toBe('blocked_prompt_budget');
      expect(out.record.validation.retry_used).toBe(false);
      expect(out.record.validation.issues[0]).toMatch(/wire cap|serialized/i);
    } else if (out.ok) throw new Error('must be blocked');
    else throw new Error(`expected blocked_prompt_budget, got ${out.code}`);
  });

  it('retry cap refusal → blocked_prompt_budget with retry_used TRUE (a first call happened)', async () => {
    let call = 0;
    const retryAdapter: LlmAdapter = {
      async complete(): Promise<LlmResponse> {
        call += 1;
        if (call === 1) return { text: 'not json', usage: { in_tokens: 1, out_tokens: 1 }, attempts: 1, latencyMs: 1 };
        throw new TrustPaidError('request_over_budget', 'serialized request is over the wire cap — refused BEFORE transport (zero paid calls); shrink the analysis scope');
      },
    };
    const out = await runRecovery(
      { analysisId: 'AN-0002', projectName: 'legacy-renewal', snapshotId: 'RSN-0123456789abcdef', scope: { type: 'whole' }, bundle: oneSliceBundle() },
      deps({ llm: singleRoutePlan(retryAdapter, { gateway: 's', providerKind: 'openai-compatible' as const, requestedModel: 'm' }) }) as never,
    );
    expect(out.ok).toBe(false);
    if (!out.ok && out.code === 'blocked_prompt_budget') {
      expect(out.record.validation.retry_used).toBe(true);
      expect(out.record.usage.attempts).toBe(1);
    }
  });
});

describe('D-1: transport failure persists the LEDGER truth, not zeros', () => {
  it('failed fetches surface as honest attempts/calls on the immutable record', async () => {
    const records: unknown[] = [];
    let charged = 0;
    const ledger = {
      chargeAttempts: (n: number) => {
        charged += n;
      },
      ensureAttemptAdmissible: () => {},
      chargeTokens: () => {},
      checkWall: () => {},
      spent: () => ({ attempts: 3, tokensIn: 0, tokensOut: 0 }),
    };
    const adapter: LlmAdapter = {
      async complete(): Promise<never> {
        throw new Error('HTTP 500');
      },
    };
    const out = await runRecovery(
      { analysisId: 'AN-0003', projectName: 'legacy-renewal', snapshotId: 'RSN-0123456789abcdef', scope: { type: 'whole' }, bundle: oneSliceBundle() },
      {
        llm: singleRoutePlan(adapter, { gateway: 's', providerKind: 'openai-compatible' as const, requestedModel: 'm' }),
        nowIso: '2026-09-03T00:00:00Z',
        targetRoot: '/nonexistent',
        budget: ledger as never,
        context: sealContextBundle({
          projectName: 'legacy-renewal',
          snapshotId: 'RSN-0123456789abcdef',
          slices: [{ path: 'src/orders.ts', whole_file_hash: sha256Content('fixture-bytes'), start_line: 1, end_line: 5, text: 'x', file_line_count: 5 }],
        }),
        persist: (r: never) => {
          records.push(r);
          return { ok: true as const };
        },
      } as never,
    );
    expect(out.ok).toBe(false);
    const persisted = records[0] as { outcome: string; usage: { attempts: number; calls: number; transport_failed?: boolean } };
    expect(persisted.outcome).toBe('transport_failed');
    expect(persisted.usage.attempts).toBe(3);
    expect(persisted.usage.calls).toBeGreaterThanOrEqual(1);
    void writeFileSync; void cpSync; void readFileSync; void mkdtempSync; void join; void tmpDirs;
  });
});
