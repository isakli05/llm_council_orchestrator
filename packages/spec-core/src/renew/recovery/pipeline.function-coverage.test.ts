import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRecovery } from './pipeline';
import { sealContextBundle } from '../trust/evidence';
import { singleRoutePlan } from '../../llm/plan';
import type { LlmAdapter, LlmResponse } from '../../eval/llm/adapter';
import type { AnalysisRecord } from './schemas';
import type { ContextBundle } from '../context/bundle';

/**
 * Deterministic function-coverage hardening for the ZOD-shaped schema
 * failure path of the recovery pipeline: a response that IS valid JSON but
 * fails RecoveryOutputSchema must produce validation-informed issues (the
 * zodIssues formatter: `path: message`) that (a) feed the ONE retry prompt
 * and (b) land in the honestly-persisted blocked_schema record. The existing
 * blocked_schema tests feed non-JSON garbage (the JSON.parse arm), so the
 * zod arm is driven here with structurally-wrong-but-parseable payloads.
 */

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

const PRICING = 'export function applyDiscount(s: number): number {\n  return s * 0.95;\n}\n';
const ORDERS = 'export function createOrder(c: string) {\n  return { accepted: true };\n}\n';

const SCRIPTED_INVALID = [JSON.stringify({ bogus: 'shape-one' }), JSON.stringify({ also: 'shape-two' })];

function setupTarget(): string {
  const targetRoot = mkdtempSync(join(tmpdir(), 'lco-rec-fn-'));
  tmpDirs.push(targetRoot);
  mkdirSync(join(targetRoot, 'src'));
  writeFileSync(join(targetRoot, 'src', 'pricing.ts'), PRICING);
  writeFileSync(join(targetRoot, 'src', 'orders.ts'), ORDERS);
  return targetRoot;
}

function makeBundle(hashes: { pricing: string; orders: string }): ContextBundle {
  return {
    scope: { type: 'community', id: 1 },
    items: [
      {
        kind: 'node',
        node_id: 'src_pricing_applydiscount',
        label: 'applyDiscount',
        source_file: 'src/pricing.ts',
        community: 1,
        provenance: 'graph',
      },
      {
        kind: 'file_slice',
        path: 'src/pricing.ts',
        start_line: 1,
        end_line: 3,
        text: PRICING,
        content_hash: hashes.pricing,
        redactions: 0,
        provenance: 'file-read',
        slice_text_hash: hashes.pricing,
        file_line_count: 3,
      },
      {
        kind: 'file_slice',
        path: 'src/orders.ts',
        start_line: 1,
        end_line: 3,
        text: ORDERS,
        content_hash: hashes.orders,
        redactions: 0,
        provenance: 'file-read',
        slice_text_hash: hashes.orders,
        file_line_count: 3,
      },
    ],
    truncated: false,
    total_chars: 500,
    warnings: [],
  } as ContextBundle;
}

function scripted(responses: string[]): { adapter: LlmAdapter; prompts: string[] } {
  let i = 0;
  const prompts: string[] = [];
  const adapter: LlmAdapter = {
    complete: async (prompt: string): Promise<LlmResponse> => {
      prompts.push(prompt);
      const next = responses[i++];
      if (next === undefined) throw new Error('script exhausted — mock adapter refuses to invent output');
      return { text: next, usage: { in_tokens: 100, out_tokens: 50 } };
    },
  };
  return { adapter, prompts };
}

describe('runRecovery — schema-invalid-but-parseable responses (the zod issues arm)', () => {
  it('formats zod issues as `path: message`, feeds them to the ONE retry, and persists an honest blocked_schema record', async () => {
    const targetRoot = setupTarget();
    const sha = (s: string | Buffer) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
    const hashes = { pricing: sha(PRICING), orders: sha(ORDERS) };
    const bundle = makeBundle(hashes);
    const { adapter, prompts } = scripted(SCRIPTED_INVALID);
    const persisted: AnalysisRecord[] = [];
    const outcome = await runRecovery(
      { analysisId: 'AN-0001', projectName: 'legacy-renewal', snapshotId: 'RSN-deadbeefdeadbeef', scope: bundle.scope, bundle },
      {
        llm: singleRoutePlan(adapter, { gateway: 'gateway-x', providerKind: 'openai-compatible' as const, requestedModel: 'model-y' }),
        budget: undefined,
        nowIso: '2026-09-05T12:00:00.000Z',
        targetRoot,
        context: sealContextBundle({
          projectName: 'legacy-renewal',
          snapshotId: 'RSN-deadbeefdeadbeef',
          slices: bundle.items
            .filter((i): i is Extract<ContextBundle['items'][number], { kind: 'file_slice' }> => i.kind === 'file_slice')
            .map((i) => ({
              path: i.path,
              start_line: i.start_line,
              end_line: i.end_line,
              text: i.text,
              whole_file_hash: i.content_hash,
              file_line_count: i.file_line_count ?? i.end_line,
            })),
        }),
        persist: (record) => {
          persisted.push(record);
          return { ok: true };
        },
      },
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('blocked_schema');
    expect(outcome.record.outcome).toBe('blocked_schema');
    expect(outcome.record.validation.schema_ok).toBe(false);

    // TWO calls: the initial attempt plus exactly ONE validation-informed retry.
    expect(prompts).toHaveLength(2);
    // The retry prompt carries the FORMATTED zod issues (`path: message`),
    // not raw error dumps — the validation-informed retry contract.
    expect(prompts[1]).not.toEqual(prompts[0]);
    expect(prompts[1]).toMatch(/Required|Unrecognized|Invalid/);
    // the failure record was persisted honestly
    expect(persisted).toHaveLength(1);
  });
});
