import { describe, it, expect } from 'vitest';
import {
  classifySingle,
  propose,
  proposeB,
  judgeMerge,
  classifyAndProposeSingle,
} from './prompts';

const INTENT = 'URL kısaltma CLI istiyorum; 7 karakterli kodlar, SQLite, üç alt komut.';
const INTENT2 = 'Stok takibi istiyoruz ama veritabanı henüz belli değil.';

describe('prompt templates — shared contract', () => {
  const all = () => [
    classifySingle(INTENT, 'p-mini'),
    propose(INTENT, 'p-mini'),
    proposeB(INTENT, 'p-mini', '{"sentinel":"a"}'),
    judgeMerge(INTENT, 'p-mini', '{"sentinel":"a"}', '{"sentinel":"b"}'),
    classifyAndProposeSingle(INTENT, 'p-mini'),
  ];

  it('every template embeds the intent and the expected profile', () => {
    for (const p of all()) {
      expect(p).toContain(INTENT);
      expect(p).toContain('p-mini');
    }
  });

  it('every template demands JSON-only output', () => {
    for (const p of all()) {
      expect(p).toMatch(/output only.*json|json.*only/i);
    }
  });

  it('every template forbids hidden chain-of-thought', () => {
    for (const p of all()) {
      expect(p).toContain('do not include hidden chain-of-thought');
      expect(p).toMatch(/concise auditable rationale/i);
    }
  });

  it('every template instructs UNRESOLVED over invention for ambiguous/conflicting intents', () => {
    for (const p of all()) {
      expect(p).toContain('UNRESOLVED');
      expect(p).toMatch(/do not invent|never invent/i);
    }
  });
});

describe('prompt templates — individual shape', () => {
  it('classifySingle asks for the {profile, must_be_blocked} JSON verdict', () => {
    const p = classifySingle(INTENT2, 'p-standard');
    expect(p).toContain('must_be_blocked');
    expect(p).toContain('profile');
    expect(p).toMatch(/ambiguous|conflicting/i);
  });

  it('propose describes the SpecBundle top-level shape', () => {
    const p = propose(INTENT, 'p-mini');
    for (const key of ['manifest', 'intent', 'glossary', 'assumptions', 'evidence', 'requirements', 'decisions', 'contracts', 'tasks', 'test_files']) {
      expect(p).toContain(key);
    }
  });

  it('proposeB embeds proposal A verbatim and demands independent drafting then merging', () => {
    const a = '{"sentinel":"proposal-a-7q4z"}';
    const p = proposeB(INTENT, 'p-mini', a);
    expect(p).toContain(a);
    expect(p).toMatch(/independent/i);
    expect(p).toMatch(/merge/i);
    expect(p).toContain('unresolved_count');
  });

  it('judgeMerge embeds both proposals verbatim', () => {
    const a = '{"sentinel":"proposal-a-7q4z"}';
    const b = '{"sentinel":"proposal-b-9w1x"}';
    const p = judgeMerge(INTENT, 'p-mini', a, b);
    expect(p).toContain(a);
    expect(p).toContain(b);
    expect(p).toMatch(/merge/i);
    expect(p).toContain('unresolved_count');
  });

  it('classifyAndProposeSingle merges classification and proposal into one output instruction', () => {
    const p = classifyAndProposeSingle(INTENT, 'p-mini');
    expect(p).toContain('must_be_blocked');
    expect(p).toContain('tasks'); // proposal half present
    expect(p).toMatch(/final output.*bundle|bundle.*final output/i);
  });

  it('templates are pure: identical inputs give identical prompts', () => {
    expect(classifySingle(INTENT, 'p-mini')).toBe(classifySingle(INTENT, 'p-mini'));
    expect(proposeB(INTENT, 'p-mini', 'A')).toBe(proposeB(INTENT, 'p-mini', 'A'));
  });
});
