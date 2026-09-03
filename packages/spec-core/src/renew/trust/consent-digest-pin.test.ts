import { describe, expect, it } from 'vitest';

/**
 * Re-verifier 2 (Low note): pin the F-7/E-L-01 consent graph-digest arm —
 * the MCP consent state's graph identity flows through authorizedRead +
 * structuralIdentity, so malformed workspace graph state can NEVER produce a
 * wrong (present-but-wrong) digest — it yields undefined (unbound), and the
 * consent digest changes across graph-state transitions.
 */
describe('F-7 pin: consent graph digest via the kernel', () => {
  it('graph-state transitions change the structural identity digest (the consent preimage)', async () => {
    const { structuralIdentity } = await import('./structural');
    const manifest = '{"src/a.ts": {"ast_hash": "h1"}}';
    const graphA = JSON.stringify({ nodes: [{ id: 'n1' }], links: [] });
    const graphB = JSON.stringify({ nodes: [{ id: 'n2' }], links: [] });
    const a = structuralIdentity({ manifestText: manifest, graphText: graphA });
    const b = structuralIdentity({ manifestText: manifest, graphText: graphB });
    if (!a.ok || !b.ok) throw new Error('healthy inputs must parse');
    expect(a.identity.graph_digest).not.toBe(b.identity.graph_digest);
  });

  it('malformed graph state NEVER yields a present-but-wrong identity — typed refusal only', async () => {
    const { structuralIdentity } = await import('./structural');
    for (const bad of ['not json', '{"nodes":[]}', '{"nodes":[{"id":"x"},{"id":"x"}]}', '']) {
      const r = structuralIdentity({ manifestText: '{"a.ts": {"ast_hash": "h"}}', graphText: bad });
      expect(r.ok).toBe(false);
    }
    expect(structuralIdentity({ manifestText: 'garbage{', graphText: '{"nodes":[{"id":"x"}]}' }).ok).toBe(false);
    expect(structuralIdentity({ manifestText: undefined, graphText: '{"nodes":[{"id":"x"}]}' }).ok).toBe(false);
  });
});
