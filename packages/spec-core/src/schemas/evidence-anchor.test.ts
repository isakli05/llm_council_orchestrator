import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CodeAnchorPayloadSchema, EvidenceItemSchema } from './evidence';
import { SpecBundleSchema } from './index';

const H = `sha256:${'a'.repeat(64)}`;

const codeAnchorItem = {
  id: 'E-0101',
  kind: 'code_anchor',
  source: 'src/orders.ts',
  hash: H,
  anchor: { path: 'src/orders.ts', content_hash: H },
};

describe('code_anchor evidence extension (backward compatible)', () => {
  it('parses a code_anchor item carrying an anchor payload', () => {
    expect(EvidenceItemSchema.parse(codeAnchorItem)).toBeTruthy();
  });

  it('rejects kind code_anchor WITHOUT an anchor payload', () => {
    const { anchor: _drop, ...rest } = codeAnchorItem;
    expect(EvidenceItemSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an anchor payload on any other kind (strict objects)', () => {
    for (const kind of ['user_input', 'code', 'runtime', 'doc', 'constraint'] as const) {
      const r = EvidenceItemSchema.safeParse({
        id: 'E-0102',
        kind,
        source: 'src/orders.ts',
        hash: H,
        anchor: { path: 'src/orders.ts', content_hash: H },
      });
      expect(r.success, kind).toBe(false);
    }
  });

  it('requires hash === anchor.content_hash (one canonical whole-file hash)', () => {
    const r = EvidenceItemSchema.safeParse({
      ...codeAnchorItem,
      hash: `sha256:${'b'.repeat(64)}`,
      anchor: { path: 'src/orders.ts', content_hash: H },
    });
    expect(r.success).toBe(false);
  });

  it('still accepts every pre-existing kind without an anchor (no regression)', () => {
    for (const kind of ['user_input', 'code', 'runtime', 'doc', 'constraint'] as const) {
      expect(EvidenceItemSchema.parse({ id: 'E-0001', kind, source: 's', hash: H })).toBeTruthy();
    }
  });

  it('anchor payload: optional node_id and lines, strict elsewhere', () => {
    expect(
      CodeAnchorPayloadSchema.safeParse({
        node_id: 'src_orders_createorder',
        path: 'src/orders.ts',
        content_hash: H,
        start_line: 21,
        end_line: 33,
      }).success,
    ).toBe(true);
    expect(CodeAnchorPayloadSchema.safeParse({ path: 'src/orders.ts', content_hash: H, bogus: 1 }).success).toBe(false);
    expect(CodeAnchorPayloadSchema.safeParse({ path: '', content_hash: H }).success).toBe(false);
    expect(CodeAnchorPayloadSchema.safeParse({ path: 'a.ts', content_hash: 'nope' }).success).toBe(false);
    expect(CodeAnchorPayloadSchema.safeParse({ path: 'a.ts', content_hash: H, start_line: 9, end_line: 4 }).success).toBe(false);
  });

  it('a full bundle carrying code_anchor evidence stays schema-valid', () => {
    // The existing good fixture is the backward-compat baseline; adding a
    // code_anchor item must not disturb it.
    const fixturePath = join(__dirname, '..', '..', 'fixtures', 'good', 'legacy-crm', 'bundle.json');
    const bundle = JSON.parse(readFileSync(fixturePath, 'utf8')) as { evidence: unknown[] };
    const withAnchor = {
      ...bundle,
      evidence: [...bundle.evidence, { ...codeAnchorItem, id: 'E-0999' }],
    };
    expect(SpecBundleSchema.safeParse(withAnchor).success).toBe(true);
  });
});
