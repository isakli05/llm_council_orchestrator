import { describe, expect, it } from 'vitest';
import { parseGraphManifestStrict, structuralIdentity } from './structural';

const GOOD_GRAPH = JSON.stringify({
  nodes: [{ id: 'n1', label: 'a.ts', source_file: 'src/a.ts' }],
  links: [],
});

describe('structural: strict manifest acceptance', () => {
  it('accepts a well-formed manifest and digests sorted [path, ast_hash] pairs', () => {
    const a = parseGraphManifestStrict('{"b.ts": {"ast_hash": "x", "mtime": 1}, "a.ts": {"ast_hash": "y"}}');
    const b = parseGraphManifestStrict('{"a.ts": {"ast_hash": "y"}, "b.ts": {"mtime": 9, "ast_hash": "x"}}');
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.identity.digest).toBe(b.identity.digest); // volatile fields out, order stable
      expect(a.identity.entries).toBe(2);
    }
  });

  it('rejects: absent, blank, non-JSON, non-object, {}, array, malformed entries', () => {
    expect(parseGraphManifestStrict(undefined).ok).toBe(false);
    expect(parseGraphManifestStrict('').ok).toBe(false);
    expect(parseGraphManifestStrict('garbage{').ok).toBe(false);
    expect(parseGraphManifestStrict('null').ok).toBe(false);
    expect(parseGraphManifestStrict('{}').ok).toBe(false);
    expect(parseGraphManifestStrict('[]').ok).toBe(false);
    expect(parseGraphManifestStrict('{"a.ts": "scalar"}').ok).toBe(false);
    expect(parseGraphManifestStrict('{"a.ts": {"ast_hash": ""}}').ok).toBe(false);
    expect(parseGraphManifestStrict('{"a.ts": {"ast_hash": 7}}').ok).toBe(false);
    expect(parseGraphManifestStrict('{"a.ts": null}').ok).toBe(false);
  });
});

describe('structural: full identity is STRICT — no fallback digest exists', () => {
  it('healthy graph + healthy manifest → identity with both digests', () => {
    const r = structuralIdentity({
      manifestText: '{"src/a.ts": {"ast_hash": "h1"}}',
      graphText: GOOD_GRAPH,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.identity.manifest_entries).toBe(1);
      expect(r.identity.node_count).toBe(1);
      expect(r.identity.graph_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it('malformed manifest → REFUSAL, never an empty-identity digest (S3-L-03)', () => {
    const r = structuralIdentity({ manifestText: 'garbage{', graphText: GOOD_GRAPH });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('manifest_invalid');
  });

  it('absent manifest → manifest_missing refusal', () => {
    const r = structuralIdentity({ manifestText: undefined, graphText: GOOD_GRAPH });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('manifest_missing');
  });

  it('duplicate node ids / dangling links → graph_invalid refusal', () => {
    const dup = structuralIdentity({
      manifestText: '{"src/a.ts": {"ast_hash": "h1"}}',
      graphText: JSON.stringify({ nodes: [{ id: 'n1' }, { id: 'n1' }], links: [] }),
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.code).toBe('graph_invalid');

    const dangling = structuralIdentity({
      manifestText: '{"src/a.ts": {"ast_hash": "h1"}}',
      graphText: JSON.stringify({ nodes: [{ id: 'n1' }], links: [{ source: 'n1', target: 'ghost' }] }),
    });
    expect(dangling.ok).toBe(false);
    if (!dangling.ok) expect(dangling.code).toBe('graph_invalid');
  });

  it('graph bytes changing changes the graph digest (identity drifts)', () => {
    const a = structuralIdentity({ manifestText: '{"a.ts": {"ast_hash": "h"}}', graphText: GOOD_GRAPH });
    const b = structuralIdentity({
      manifestText: '{"a.ts": {"ast_hash": "h"}}',
      graphText: GOOD_GRAPH.replace('n1', 'nX'),
    });
    if (a.ok && b.ok) expect(a.identity.graph_digest).not.toBe(b.identity.graph_digest);
  });
});
