import { describe, it, expect } from 'vitest';
import {
  classifySingle,
  propose,
  proposeB,
  proposeBDegraded,
  judgeMerge,
  classifyAndProposeSingle,
} from './prompts';
import { buildValidationRetryPrompt } from './runner';

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

  it('proposeB puts the independence instruction BEFORE the embedded proposal A (anti-anchoring order)', () => {
    const a = '{"sentinel":"proposal-a-7q4z"}';
    const p = proposeB(INTENT, 'p-mini', a);
    const instructionAt = p.indexOf('Draft your OWN independent proposal');
    const proposalAAt = p.indexOf('PROPOSAL A');
    expect(instructionAt).toBeGreaterThan(-1);
    expect(proposalAAt).toBeGreaterThan(-1);
    expect(instructionAt).toBeLessThan(proposalAAt);
    // the instruction and the A JSON stay in the prompt at all
    expect(p).toContain(a);
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

describe('prompt templates — BACK-001/BACK-008 enforcement copy (code is the enforcer, prompts teach)', () => {
  it('classifySingle states that must_be_blocked=true is FINAL (monotonic gate)', () => {
    const p = classifySingle(INTENT2, 'p-standard');
    expect(p).toContain('must_be_blocked=true is FINAL');
    expect(p).toMatch(/no later output can overrule/i);
  });

  it('buildValidationRetryPrompt forbids dropping/resolving/re-id-ing unresolved material, with the consequence named', () => {
    const p = buildValidationRetryPrompt('ORIGINAL', ['L02_ORPHAN_REQUIREMENT [REQ-0001]: orphan']);
    expect(p).toContain('ORIGINAL');
    expect(p).toContain('same claim_id');
    expect(p).toMatch(/silently resolving.*will be rejected|will be rejected/i);
  });

  it('proposeBDegraded teaches the judge to work alone — no proposal-A slot, degraded status stated', () => {
    const p = proposeBDegraded(INTENT, 'p-mini');
    expect(p).toContain(INTENT);
    expect(p).toContain('p-mini');
    expect(p).toMatch(/DEGRADED/i);
    expect(p).toMatch(/withheld/i);
    expect(p).toContain('UNRESOLVED'); // invention ban still in force
    expect(p).toMatch(/output only.*json|json.*only/i);
    expect(p).not.toContain('PROPOSAL A (verbatim'); // no A slot at all — invalid text cannot leak in
    expect(proposeBDegraded(INTENT, 'p-mini')).toBe(proposeBDegraded(INTENT, 'p-mini')); // pure
  });

  it('proposeBDegraded embeds the generated schema verbatim (same contract as every spec template)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const schemaText = readFileSync(
      path.resolve(__dirname, '../../generated/spec-schema.json'),
      'utf8',
    );
    expect(proposeBDegraded(INTENT, 'p-mini')).toContain(schemaText);
  });
});

describe('prompt templates — machine-generated schema embedding (live attempt-2 fix)', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const schemaText = readFileSync(
    path.resolve(__dirname, '../../generated/spec-schema.json'),
    'utf8',
  );

  it('spec templates embed the generated schema VERBATIM (drift-proof by construction)', () => {
    const templates = [
      propose(INTENT, 'p-mini'),
      proposeB(INTENT, 'p-mini', '{"proposal":"A"}'),
      judgeMerge(INTENT, 'p-mini', '{"a":1}', '{"b":2}'),
      classifyAndProposeSingle(INTENT, 'p-mini'),
    ];
    for (const p of templates) {
      expect(p).toContain(schemaText);
    }
    // classifier stays schema-free (tiny output, no bundle)
    expect(classifySingle(INTENT, 'p-mini')).not.toContain(schemaText);
  });

  it('spec templates place the schema BEFORE the intent (stable prefix for provider caching)', () => {
    for (const p of [
      propose(INTENT, 'p-mini'),
      classifyAndProposeSingle(INTENT, 'p-mini'),
    ]) {
      expect(p.indexOf('lco-spec/1.0')).toBeGreaterThan(-1);
      expect(p.indexOf('lco-spec/1.0')).toBeLessThan(p.indexOf(INTENT));
    }
  });

  it('spec templates warn against the observed object-shape pitfalls', () => {
    for (const p of [propose(INTENT, 'p-mini'), classifyAndProposeSingle(INTENT, 'p-mini')]) {
      expect(p).toMatch(/alternatives.*OBJECTS|alternatives\[\] items are OBJECTS/i);
      expect(p).toContain('rejected_because');
      expect(p).toContain('completion_evidence');
      expect(p).toMatch(/user_input, code, runtime, doc, constraint/);
    }
  });
});
