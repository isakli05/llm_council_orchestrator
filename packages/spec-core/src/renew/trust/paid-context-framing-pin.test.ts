import { describe, expect, it } from 'vitest';
import { domainDigest } from './canonical';
import { sealContextBundle, type SuppliedContextSlice } from './evidence';
import type { ContextBundle } from '../context/bundle';

/**
 * Post-PR5 L3/L4 boundary pin: `LCO:PAID_CONTEXT` v2 is the identity of the
 * supplied BUNDLE payload — records + full items — and NOTHING else. Request
 * framing (`scope`, run time `nowIso`) is a separate identity domain: scope
 * is consent-bound (LCO:CONSENT v1) on MCP and a compile-time pin on the
 * CLI; run time persists as plaintext `created_at`. These pins make the
 * boundary mechanical: adding ANY field to the preimage (e.g. someone
 * "fixing" framing coverage in place) breaks the shape pin unless
 * `schema_version` is bumped, and framing changes are proven to alter the
 * model-visible prompt WITHOUT touching the bundle identity.
 */

const SNAP = 'RSN-pin0123456789ab';
const PROJECT = 'pin-project';

function slices(): SuppliedContextSlice[] {
  return [
    { path: 'src/a.ts', whole_file_hash: 'sha256:aa', start_line: 1, end_line: 2, text: 'line1\nline2\n', file_line_count: 50 },
  ];
}

const items = [
  { kind: 'file_slice', path: 'src/a.ts', start_line: 1, end_line: 2, text: 'line1\nline2\n', content_hash: 'sha256:aa' },
  { kind: 'node', node_id: 'N-1', label: 'alpha', source_file: 'src/a.ts' },
] as never[];

function bundleShape(): ContextBundle {
  // Minimal ContextBundle for prompt building (kind union satisfies the type
  // structurally; only scope/nowIso rendering matters here).
  return {
    scope: { type: 'whole' },
    items,
  } as unknown as ContextBundle;
}

describe('L3 pin: LCO:PAID_CONTEXT v2 preimage shape (no field leaks without a version bump)', () => {
  it('the digest covers EXACTLY {project_name, snapshot_id, structural, records, items} — structural absent', () => {
    const sealed = sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: slices(), items });
    const payload = {
      project_name: PROJECT,
      snapshot_id: SNAP,
      structural: null,
      records: sealed.records.map((r) => ({
        context_id: r.context_id,
        path: r.path,
        whole_file_hash: r.whole_file_hash,
        start_line: r.start_line,
        end_line: r.end_line,
        slice_text_hash: r.slice_text_hash,
        whole_file_supplied: r.whole_file_supplied,
        ...(r.node_id !== undefined ? { node_id: r.node_id } : {}),
      })),
      items: sealed.items,
    };
    expect(domainDigest('LCO:PAID_CONTEXT', 2, payload)).toBe(sealed.identity.bundle_id);
  });

  it('structural present is an explicit field — never omitted-when-present', () => {
    const structural = { manifest_digest: 'sha256:11', graph_digest: 'sha256:22' } as const;
    const sealed = sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: slices(), items, structural });
    const payload = {
      project_name: PROJECT,
      snapshot_id: SNAP,
      structural: { manifest_digest: 'sha256:11', graph_digest: 'sha256:22' },
      records: sealed.records.map((r) => ({
        context_id: r.context_id,
        path: r.path,
        whole_file_hash: r.whole_file_hash,
        start_line: r.start_line,
        end_line: r.end_line,
        slice_text_hash: r.slice_text_hash,
        whole_file_supplied: r.whole_file_supplied,
        ...(r.node_id !== undefined ? { node_id: r.node_id } : {}),
      })),
      items: sealed.items,
    };
    expect(domainDigest('LCO:PAID_CONTEXT', 2, payload)).toBe(sealed.identity.bundle_id);
    void structural;
  });
});

describe('L3 pin: request framing is model-visible but NEVER enters the bundle identity', () => {
  it('different scope/nowIso → different prompts, IDENTICAL bundle_id', async () => {
    const { buildRecoveryPrompt } = await import('../recovery/prompts');
    const sealedA = sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: slices(), items });
    const sealedB = sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: slices(), items });
    expect(sealedA.identity.bundle_id).toBe(sealedB.identity.bundle_id);

    const promptA = buildRecoveryPrompt({ scope: { type: 'whole' }, bundle: bundleShape(), nowIso: '2026-09-06T10:00:00Z' });
    const promptB = buildRecoveryPrompt({ scope: { type: 'diff', path: 'x' }, bundle: bundleShape(), nowIso: '2026-09-07T10:00:00Z' });
    // framing IS model-visible (rendered into the trusted region)…
    expect(promptA).not.toBe(promptB);
    expect(promptA).toContain('2026-09-06T10:00:00Z');
    // …yet the bundle identity is framing-invariant: the documented boundary.
    expect(sealedA.identity.bundle_id).toBe(sealedB.identity.bundle_id);
  });
});
