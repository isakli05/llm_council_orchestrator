# Spec Core — Evidence Gate Deneyi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Worker haritası:** W1=Görev 1–3 (scaffold+şema+fixture), W2=Görev 4–6 (compiler+freeze+CLI), W3=Görev 7–8 (lint+traceability), W4=Görev 9–11 (eval), W5=Görev 12 (entegrasyon raporu). W2/W3/W4 paralel; W1 öncül; W5 son.

**Goal:** 4 haftalık "kanıt kapısı" deneyinin kod tarafını kurmak: şema-doğrulamalı Spec IR + derleyici + 12 kuralı lint + dondurma/sürükleme tespiti + 20 görevlik deterministik eval seti + (opsiyonel canlı) konsey-vs-tek-model kıyas raporu.

**Architecture:** `packages/spec-core/` içinde kendi kendine yeterli, framework'süz TypeScript paketi. Mevcut repo koduna SIFIR bağımlılık (çürük build'den izole). Artifact'ler JSON (YOGUN gerekçe: elle YAML escape etme hatası — mevcut deponun DomainSpecWriter kusuru — şema-doğrulamalı JSON ile ortadan kalkar; YAML ileride UX katmanı olur). Tüm doğrulama deterministiktir; LLM yalnızca eval'in opsiyonel `--live` modunda, env-anahtarlı, asla uydurulmaz.

**Tech Stack:** TypeScript 5.3 (strict), zod ^3.22 (tek runtime dep), vitest ^2.1, node --test değil vitest (repo standardı), CLI için `node:util` parseArgs (CLI framework yok), Node >=22 (kullanıcıda 24.14).

## Global Constraints

- Depo kökünde `pnpm build`/`pnpm test` KIRIK (apps/orchestrator 85 TS hatası, 60 test başarısız) — MEVCUT dosyalara DOKUNMA; yalnız `packages/spec-core/**` ve bu plan dosyası altında çalış.
- Komutlar daima scoped: `pnpm --filter @lco/spec-core test|build|lint`. Root komutları çalıştırma.
- **Commit politika:** Sadece W1 bir dal oluşturur ve scaffold commit'ler (`feat/spec-core-experiment`). W2/W3/W4/W5 COMMIT ETMEZ — dosya yazar + scoped test koşar; ebeveyn inceleyip toplu commit'ler. (Paralel çalışanlar aynı working tree'yi paylaşır; index.lock yarışı önlenir.)
- Gizli anahtar YOK: kod yalnız `LCO_LLM_BASE_URL`, `LCO_LLM_API_KEY`, `LCO_LLM_MODEL` env'lerini OKUR; testlerde yalnız Mock adapter. `.env.test`'e DOKUNMA.
- Zincir-dışı-düşünce (chain-of-thought) asla istenmez/saklanmaz; Decision.rationale ≤200 kelime şema düzeyinde `z.string().max(2000)`.
- Placeholder-success YASAK: tanınmayan her durum hata fırlatır veya `{ok:false}` döner; `success:true` yalnızca gerçek doğrulamadan sonra.
- Test adlandırma: `describe('<birim>', ...)` + deterministik assert'ler; `expect(true).toBe(true)` tarzı boş test YASAK.
- Her dosya tek sorumluluk; dosya >400 satırsa böl.

## Dosya Yapısı (sözleşme — isimler değişmez)

```
packages/spec-core/
  package.json            # W1: name @lco/spec-core, bin {"lco":"dist/cli/index.js"}, scripts
  tsconfig.json           # W1: strict, outDir dist, module commonjs, target ES2022
  vitest.config.ts        # W1: include src/**/*.test.ts + fixtures/**/expected*.test yok (fixture'lar src testlerinde yüklenir)
  src/schemas/            # W1
    common.ts  manifest.ts  intent.ts  glossary.ts  evidence.ts
    requirements.ts  decisions.ts  contracts.ts  tasks.ts  legacy.ts
    index.ts               # SpecBundleSchema + tüm tipler re-export
    export-json-schema.ts  # W1: dist/spec-schema.json üretir (build sonrası node script)
  src/compiler/           # W2
    compile.ts  hash.ts  freeze.ts  changeset.ts
  src/cli/                # W2
    index.ts               # bin; alt komutlar: compile|lint|freeze|verify
  src/lint/               # W3
    engine.ts  trace.ts  rules/  (12 dosya: L01..L12)
  src/eval/               # W4
    runner.ts  score.ts  report.ts  llm/adapter.ts  llm/mock.ts  llm/http.ts
    tasks/index.ts         # 20 EvalTask
  fixtures/               # W1
    good/{pet-clinic,todo-api,session-service,legacy-crm,embed-cli}/...
    bad/{L01..L12,drift,unresolved,schema-invalid}/...
  README.md               # W5: kullanım + kanıt kapısı ölçütleri
```

---

## Task 1: Scaffold (W1)

**Files:** Create: `packages/spec-core/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/schemas/index.ts` (boş barrel — şablon), `.gitignore` (dist, node_modules).

**Interfaces (Produces):**
- `package.json`: `{ "name": "@lco/spec-core", "version": "0.1.0", "type": "commonjs", "main": "dist/schemas/index.js", "bin": { "lco": "dist/cli/index.js" }, "scripts": { "build": "tsc -p tsconfig.json && node dist/schemas/export-json-schema.js", "test": "vitest run", "test:watch": "vitest", "lint": "tsc -p tsconfig.json --noEmit" }, "dependencies": { "zod": "^3.22.0" }, "devDependencies": { "typescript": "^5.3.3", "vitest": "^2.1.0", "@types/node": "^20.10.0" } }`
- `tsconfig.json`: `{ "compilerOptions": { "strict": true, "target": "ES2022", "module": "commonjs", "moduleResolution": "node", "outDir": "dist", "rootDir": "src", "declaration": true, "skipLibCheck": true, "esModuleInterop": true } }, "include": ["src/**/*"] }`
- `vitest.config.ts`: `import { defineConfig } from 'vitest/config'; export default defineConfig({ test: { globals: true, environment: 'node', include: ['src/**/*.test.ts'] } });`

- [ ] **Adım 1: Dalı oluştur**: `git checkout -b feat/spec-core-experiment` (main'den).
- [ ] **Adım 2: Dosyaları yukarıdaki birebir içerikle yaz.**
- [ ] **Adım 3: Kurulum**: `pnpm install --filter @lco/spec-core` → exit 0.
- [ ] **Adım 4: Tırnak testi**: `packages/spec-core/src/schemas/index.test.ts` oluştur:
```ts
import { describe, it, expect } from 'vitest';
describe('scaffold', () => {
  it('package is importable and exports a version constant', async () => {
    const mod = await import('./index');
    expect(mod.SPEC_SCHEMA_VERSION).toBe('lco-spec/1.0');
  });
});
```
`src/schemas/index.ts` içine `export const SPEC_SCHEMA_VERSION = 'lco-spec/1.0' as const;` ekle.
- [ ] **Adım 5: Çalıştır**: `pnpm --filter @lco/spec-core test` → PASS (1 test).
- [ ] **Adım 6: Commit**: `git add packages/spec-core && git commit -m "feat(spec-core): scaffold package on feat/spec-core-experiment"`

## Task 2: Şemalar (W1)

**Files:** Create: `src/schemas/common.ts`, `manifest.ts`, `intent.ts`, `glossary.ts`, `evidence.ts`, `requirements.ts`, `decisions.ts`, `contracts.ts`, `tasks.ts`, `legacy.ts`; Modify: `src/schemas/index.ts` (barrel + SpecBundleSchema); Test: her dosyanın yanına `<ad>.test.ts`.

**Interfaces (Produces — W2/W3/W4 bu imzaları kullanır, İSİM DEĞİŞMEZ):**

```ts
// common.ts
export const SpecStateSchema = z.enum(['draft','reviewed','frozen','superseded','blocked']);
export type SpecState = z.infer<typeof SpecStateSchema>;
export const ImpactLevelSchema = z.enum(['low','medium','high']);
export const ComplexityProfileSchema = z.enum(['p-mini','p-standard','p-legacy','p-critical']);
export const Sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const IdSchema = z.string().regex(/^(REQ|DEC|CON|TASK|TST|E|AS|GLS|UX|ARC|DAT|SEC|OPS|LGC)-\d{4}$/);

// manifest.ts
export const ManifestSchema = z.object({
  spec_schema: z.literal('lco-spec/1.0'),
  spec_version: z.number().int().positive(),          // 1'den başlar, changeset ++ eder
  project: z.object({ name: z.string().min(1), mode: z.enum(['greenfield','legacy']) }),
  complexity_profile: ComplexityProfileSchema,
  evidence_snapshot: z.object({ pack_hash: Sha256Schema, collected_at: z.string().min(1) }),
  state: SpecStateSchema,
  council_run: z.object({ run_id: z.string().min(1), config_fingerprint: z.string().min(1) }),
  artifact_hashes: z.record(z.string()),               // görece yol -> 'sha256:...'
  unresolved_count: z.number().int().nonnegative(),
  blocking_count: z.number().int().nonnegative(),
  target_runtime: z.object({ platform: z.string().min(1), stack: z.string().min(1) }),
  frozen_at: z.string().min(1).optional(),
});
export type Manifest = z.infer<typeof ManifestSchema>;

// intent.ts
export const IntentSchema = z.object({ statement: z.string().min(1), normalized: z.string().min(1) });
// glossary.ts
export const GlossaryEntrySchema = z.object({ term: z.string().min(1), definition: z.string().min(1) });
// evidence.ts
export const EvidenceItemSchema = z.object({
  id: IdSchema, kind: z.enum(['user_input','code','runtime','doc','constraint']),
  source: z.string().min(1), hash: Sha256Schema,
});
// requirements.ts
export const RequirementSchema = z.object({
  id: IdSchema, statement: z.string().min(1),
  priority: z.enum(['must','should','could']),
  evidence: z.array(IdSchema).min(1),
  acceptance_refs: z.array(IdSchema).min(1),          // TST id'leri
  terms_used: z.array(z.string()).default([]),         // L01: '**Terim**' işaretli kelimeler; lint glossary ile karşılaştırır
});
// decisions.ts
export const DecisionSchema = z.object({
  claim_id: IdSchema, decision: z.string().min(1),
  rationale: z.string().max(2000),                     // ≤~200 kelime
  evidence: z.array(IdSchema), confidence: z.number().min(0).max(1),
  impact: ImpactLevelSchema, assumptions: z.array(z.string()),
  alternatives: z.array(z.object({ option: z.string(), rejected_because: z.string() })).min(0),
  status: z.enum(['proposed','accepted','rejected','UNRESOLVED']),
});
// contracts.ts
export const ContractSchema = z.object({
  id: IdSchema, kind: z.enum(['openapi','json-schema','ts-signature','grpc']),
  symbol: z.string().min(1), definition: z.string().min(1),
});
// tasks.ts — 15 alanlık sözleşme
export const TaskContractSchema = z.object({
  task_id: IdSchema, title: z.string().min(1), purpose: z.string().min(1),
  refs: z.object({ requirements: z.array(IdSchema), architecture: z.array(z.string()),
                   decisions: z.array(IdSchema) }),
  depends_on: z.array(IdSchema),
  preconditions: z.array(z.string()).min(1),
  permitted_scope: z.array(z.string()).min(1),         // glob path'ler
  protected: z.array(z.string()),
  interface_changes: z.array(z.object({ symbol: z.string().min(1), file: z.string().min(1) })),
  invariants: z.array(z.string()).min(1),
  instructions: z.string().min(1),
  tests: z.array(z.object({ kind: z.enum(['unit','integration','property','e2e']),
                            file: z.string().min(1), cases: z.array(z.string()).min(1) })).min(1),
  verification: z.array(z.object({ command: z.string().min(1), expect: z.string().min(1) })).min(1),
  acceptance: z.array(z.string()).min(1),
  rollback: z.string().min(1),
  completion_evidence: z.object({ required: z.array(z.enum(['verification_outputs','test_summary','diff_scope_check'])).min(1) }),
  risk: z.object({ level: ImpactLevelSchema, note: z.string() }),
  complexity: z.enum(['xs','s','m','l']),
});
export type TaskContract = z.infer<typeof TaskContractSchema>;
// legacy.ts (şema-only; compiler v1'de pass-through)
export const LegacyPackageSchema = z.object({
  as_is_summary: z.string().min(1),
  preserve_change_drop: z.array(z.object({
    behavior: z.string().min(1), decision: z.enum(['preserve','change','drop']),
    rationale: z.string().min(1), evidence: z.array(IdSchema) })).min(1),
}).partial() p-legacy'de zorunlu kılan kural lint'te (L07 benzeri profil kuralı) DEĞİL — schema optional; derive edilir.

// index.ts
export const SpecBundleSchema = z.object({
  manifest: ManifestSchema,
  intent: IntentSchema,
  glossary: z.array(GlossaryEntrySchema),
  assumptions: z.array(z.object({ id: IdSchema, statement: z.string().min(1),
    evidence: z.array(IdSchema), impact_if_wrong: z.string().min(1) })),
  evidence: z.array(EvidenceItemSchema),
  requirements: z.array(RequirementSchema),
  decisions: z.array(DecisionSchema),
  contracts: z.array(ContractSchema),
  tasks: z.array(TaskContractSchema),
  test_files: z.array(z.string().min(1)),              // L03: task.tests[].file bu kayıt defterinde olmalı
  legacy: LegacyPackageSchema.optional(),
});
export type SpecBundle = z.infer<typeof SpecBundleSchema>;
export const TraceEdgeSchema = z.object({
  from: IdSchema, to: IdSchema, kind: z.enum(['req-task','task-test','dec-task','evidence-req']) });
export type TraceEdge = z.infer<typeof TraceEdgeSchema>;
```

**Görev 2'nin ek zorunlu çıktısı — `src/lint/types.ts`** (W3'ün kuralları ve W2'nin freeze'i bu tipleri KULLANIR; burada tanımlanır, başka yerde yeniden tanımlanmaz):
```ts
// src/lint/types.ts
export const LINT_RULES = ['L01_UNDEFINED_TERM','L02_ORPHAN_REQUIREMENT','L03_TASK_TEST_FILE_UNKNOWN',
  'L04_CYCLIC_TASK_DEPS','L05_INTERFACE_MISMATCH','L06_DUPLICATE_ID','L07_MISSING_NFR_BUDGET',
  'L08_UNRESOLVED_LEAK','L10_TRACEABILITY_GAP','L12_SCOPE_OVERLAP'] as const;
export type LintRuleId = typeof LINT_RULES[number];
export interface LintFinding { rule: LintRuleId; severity: 'error'|'warning'; path: string; message: string }
export interface LintResult { errors: LintFinding[]; warnings: LintFinding[]; summary: Record<string, number> }
```
Test: `src/lint/types.test.ts` — LINT_RULES dizisinin uzunluğu 10 ve id'ler benzersiz.

- [ ] **Adım 1 (TDD): Her şema için önce red testi.** Örnek (`tasks.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { TaskContractSchema } from './tasks';
const validTask = { task_id: 'TASK-0001', title: 't', purpose: 'p',
  refs: { requirements: ['REQ-0001'], architecture: [], decisions: ['DEC-0001'] },
  depends_on: [], preconditions: ['pc'], permitted_scope: ['src/**'], protected: [],
  interface_changes: [{ symbol: 'f()', file: 'src/a.ts' }], invariants: ['inv'],
  instructions: 'do', tests: [{ kind: 'unit', file: 'a.test.ts', cases: ['c1'] }],
  verification: [{ command: 'npm test', expect: 'exit 0' }], acceptance: ['ac'],
  rollback: 'git revert', completion_evidence: { required: ['test_summary'] },
  risk: { level: 'low', note: '' }, complexity: 'xs' };
describe('TaskContractSchema', () => {
  it('accepts a valid contract', () => expect(TaskContractSchema.parse(validTask)).toBeTruthy());
  it('rejects bad id format', () => {
    expect(() => TaskContractSchema.parse({ ...validTask, task_id: 'X-1' })).toThrow();
  });
  it('rejects task without verification (fail-closed core)', () => {
    expect(() => TaskContractSchema.parse({ ...validTask, verification: [] })).toThrow();
  });
});
```
- [ ] **Adım 2:** Testleri koş → RED (modüller yok). **Adım 3:** Şemaları yaz → `pnpm --filter @lco/spec-core test` → GREEN (tüm şema testleri).
- [ ] **Adım 4: `export-json-schema.ts`** (zod manual import edilemiyorsa elle JSON üretme — zod-to-json-schema DEP EKLEME; bu yüzden bu script şemaları import edip `zodToJsonSchema` YERİNE kendi minimal dönüştürücüsünü yazma girişimi YASAK — bunun yerine script, sabit bir el yazımı JSON Schema taslağı DEĞİL; **karar: `devDependencies`'e `zod-to-json-schema@^3.23` EKLE** — tek istisna, gerekçesiyle: IR'ın dilden bağımsız doğrulanabilirliği paketin temel iddiası).
```ts
// src/schemas/export-json-schema.ts
import { zodToJsonSchema } from 'zod-to-json-schema';
import { writeFileSync, mkdirSync } from 'node:fs';
import { SpecBundleSchema } from './index';
mkdirSync('generated', { recursive: true });
writeFileSync('generated/spec-schema.json', JSON.stringify(zodToJsonSchema(SpecBundleSchema, 'SpecBundle'), null, 2));
console.log('generated/spec-schema.json yazıldı');
```
`package.json` build scriptini güncelle: `"build": "tsc -p tsconfig.json && node dist/schemas/export-json-schema.js"`.
- [ ] **Adım 5:** `pnpm --filter @lco/spec-core build` → exit 0 + `generated/spec-schema.json` var. Test: script'in çıktısını parse edip `JSON.parse` başarılı.

## Task 3: Fixture korpusu (W1)

**Files:** Create: `fixtures/good/{pet-clinic,todo-api,session-service,legacy-crm,embed-cli}/bundle.json` (5 iyi, her biri SpecBundleSchema'dan geçen TAM paket; pet-clinic=p-mini 3 REQ/3 TASK, todo-api=p-standard +contract+NFR OPS kaydı, session-service=p-standard, legacy-crm=p-legacy+legacy alanı, embed-cli=p-mini); `fixtures/bad/{L01..L12,drift,unresolved,schema-invalid}/` her biri `bundle.json` + `expected.json`.
**Interfaces (Produces):**
```ts
// fixtures/bad/<id>/expected.json şeması — W3/W4/W5 bunu okur:
export interface BadFixtureExpectation {
  expect: 'lint-error' | 'freeze-rejected' | 'verify-drift' | 'schema-error';
  rule?: 'L01_UNDEFINED_TERM' | ... | 'L12_SCOPE_OVERLAP';   // expect=lint-error iken zorunlu
  message_includes?: string;                                   // opsiyonel断片
}
```
Kötü vektör tanımları (her biri İYİ fixture'ın kopyasından TEK kusur enjekte edilerek — minimal diff ilkesi):
- L01: pet-clinic'de requirement statement'da glossary'de olmayan "**Kuyruk Sistemi**" terimi + `terms_used: string[]` alanı requirement'a eklenmiş olmalı → şemaya `terms_used: z.array(z.string()).default([])` EKLE (Görev 2'ye işle).
- L02: todo-api'de REQ-0003'ü hiçbir task refs etmiyor.
- L03: session-service'te TASK-0002'nin `tests: []` yerine 1 test ama `cases: []`… hayır — L03 "testi olmayan task": şema zaten min(1) zorunlu tuttuğundan L03 vektörü şema HATASI verir; kural testi için şemayı GEVŞETME. **Karar:** L03 vektörü `task.tests[0].file` var ama dosya `bundle.tests[]` kayıt defterinde yok → lint, task.tests.file'ların `fixtures` sanal kayıt defteriyle eşleşmesini kontrol eder; bundle'a `test_files: z.array(z.string())` alanı EKLE (Görev 2'ye işle: `test_files: z.array(z.string().min(1))` — lint L03 task.test.file ∉ test_files ise error).
- L04: embed-cli'de TASK-0001→TASK-0002→TASK-0001 döngüsü.
- L05: todo-api'de task.interface_changes.symbol `createUser` ama contracts'ta sembol `create_user`.
- L06: iki requirement aynı id REQ-0001.
- L07: todo-api (p-standard) OPS kaydı olmaksızın operations NFR budget içermiyor → kural: p-standard/p-legacy/p-critical profillerinde en az 1 `OPS-` id'li requirement… **basitleştirme:** kural şöyle — `complexity_profile != 'p-mini'` iken `requirements` içinde `statement` metni `/NFR:/` içeren en az 1 kayıt OLMALI. L07 vektörü: p-standard bundle'ından NFR satırını sil.
- L08: decisions'da DEC-0002 `status:'UNRESOLVED'` VE manifest.unresolved_count=1 (tutarlı ama dondurulamaz).
- L09: task.verification[0].command `""`… şema min(1) engeller → L09 vektörü: verification var ama `expect` alanı yalnız boşluk `' '` — kural: command/expect trim sonrası boş OLAMAZ → şemaya `.refine(s => s.trim().length > 0)` EKLE (Görev 2) ve L09 vektörü `expect: ' '` (şema hatası olur — HAYIR; refine şemadaysa vektör schema-error düşer). **Nihai karar:** L09 tamamen şema düzeyine aittir → expected.json `expect:'schema-error'` yazar; LINT kural listesi 12 yerine: L01,L02,L04,L05,L06,L07,L08,L10,L11,L12 lint'te; L03,L09 şema. (W3'ün kural sayısı buna göre: 10 lint kuralı + şema katmanı.)
- L10: trace kenarı eksik: REQ-0002'yi task refs ediyor ama task'ın `tests` referans verdiği TST id'si requirement.acceptance_refs'ta yok (eşleşmeyen kenar).
- L11: TASK-0003.rollback `""` → şema min(1)… aynen L09: `expect:'schema-error'`. Kalan lint listesi: **L01,L02,L04,L05,L06,L07,L08,L10,L12 (9 kural) + L03 (test_files) = 10 lint kuralı; L09,L11 şema katmanında.** (Bu cümle W3'ün bağlayıcı listesidir.)
- L12: iki task'ın permitted_scope'u `src/auth/**` kesişiyor ve birbirlerine depends_on'da YOK.
- drift: frozen manifest'li İYİ bundle + bir task dosyası elle değiştirilmiş (hash bozulur) → `expect:'verify-drift'`. (Bundle tek JSON olduğundan drift vektörü: manifest.artifact_hashes'te SADECE `tasks/TASK-0002` anahtarının hash'i eski değere sabitlenmiş; verify yeniden hesaplayınca eşleşmez.)
- unresolved: L08'in dondurma denemesi → `expect:'freeze-rejected'`.
- schema-invalid: manifest.spec_version `"1"` (sayı değil string) → `expect:'schema-error'`.

- [ ] **Adım 1:** Her İYİ bundle'ı yaz; hızlı doğrulayıcı test `src/fixtures.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SpecBundleSchema } from './schemas';
const GOOD = join(__dirname, '../../fixtures/good');
describe('good fixtures', () => {
  for (const d of readdirSync(GOOD)) {
    it(`${d} parses against SpecBundleSchema`, () => {
      const b = JSON.parse(readFileSync(join(GOOD, d, 'bundle.json'), 'utf8'));
      expect(() => SpecBundleSchema.parse(b)).not.toThrow();
    });
  }
});
```
- [ ] **Adım 2:** Kötü vektörleri yaz + `src/fixtures-bad.test.ts`: her bad dizininde expected.json okunur; `schema-error` beklenenler `SpecBundleSchema.parse` THROW etmeli; diğerleri parse ETMELİ (kusur lint/freeze/verify katmanında). → GREEN.
- [ ] **Adım 3:** `pnpm --filter @lco/spec-core test` tam pas. **Adım 4:** COMMIT ETME (ebeveyn 1–3'ü tek commit yapacak; W1 zaten Görev 1'de scaffold'u commit etti — Görev 2–3 dosyaları ebeveyn commit'ini bekler).

## Task 4: hash + compile (W2; W1 bitmiş olmalı)

**Files:** Create: `src/compiler/hash.ts`, `src/compiler/compile.ts`; Test: yanlarına `.test.ts`.
**Interfaces (Consumes):** `SpecBundle`, `SpecBundleSchema` (Görev 2). **Produces:**
```ts
// hash.ts
export function sha256Content(content: string): `sha256:${string}`;
export function artifactHashes(b: SpecBundle): Record<string, string>;
// anahtarlar: 'manifest'(hariç — hash'ler manifest'e yazılır), 'intent','glossary','assumptions','evidence','requirements','decisions','contracts','tasks','legacy'?  → değer: JSON.stringify(o bölüm, null, 2) hash'i
// compile.ts
export interface CompileError { path: string; message: string }
export interface CompileResult { ok: boolean; bundle?: SpecBundle; errors: CompileError[] }
export function compileSpecDir(root: string): Promise<CompileResult>;
// root: spec/ dizini içeren klasör; dosya adları bölüm adlarıyla eşleşir:
//   spec/manifest.json, spec/intent.json, spec/glossary.json, spec/assumptions.json,
//   spec/evidence.json, spec/requirements.json, spec/decisions.json, spec/contracts.json,
//   spec/tasks.json, spec/legacy.json (ops)
// eksik zorunlu dosya → CompileError (path, 'missing file'); şema ihlali → ZodError mesajları CompileError'a çevrilir.
```
- [ ] **Adım 1 (TDD):** hash.test.ts: bilinen sabit string'in sha256'i sabit değerle karşılaştırılır (`sha256Content('hello')` === `'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'` — bu gerçek değeri doğrula, yanlışsa düzelt: `echo -n hello | sha256sum`); artifactHashes: determinizm (aynı bundle iki çağrı aynı), duyarlılık (tek karakter değişikliği ilgili anahtarın hash'ini değiştirir).
- [ ] **Adım 2 (TDD):** compile.test.ts: `fixtures/good/pet-clinic`'i `spec/` düzene getir (ya da good bundle'ları `spec/` alt dizinli de sakla — **karar:** compile testi, tmp dizine good bundle'ın bölümlerini `spec/*.json` olarak yazıp `ok:true` bekler; eksik `tasks.json` → `ok:false` + path içeren hata; `schema-invalid` bölümü → şema hatası listesi).
- [ ] **Adım 3–4:** Implement → testler GREEN. `pnpm --filter @lco/spec-core test`.

## Task 5: freeze + changeset (W2)

**Files:** Create: `src/compiler/freeze.ts`, `src/compiler/changeset.ts`; Test: `.test.ts` yanlarına.
**Interfaces (Consumes):** Görev 4 hash'leri; W3'ün `LintResult` **TİPÜ** (W3 paralel yazıldığından — W2 bu tipi KENDİ dosyasında tanımlamaz; `src/lint/engine.ts`'ten import edilecekse dairesel bekleme doğar → **karar:** `src/lint/types.ts` dosyasını W2 ÖNCE yazar (yalnız tip: `LintFinding`, `LintResult`, `LintRuleId` union'ı Görev 3'teki 10 kural listesiyle) ve W3 o dosyayı KULLANIR/kuralları oraya yazar.) **Produces:**
```ts
// freeze.ts
export interface FreezeResult { ok: boolean; bundle?: SpecBundle; reasons: string[] }
export function freeze(b: SpecBundle, lint: LintResult): FreezeResult;
// kapı: lint.errors.length===0 && manifest.unresolved_count===0 && manifest.blocking_count===0
//       && decisions'ta status!=='UNRESOLVED' kalmamış
// geçerse: state='frozen', frozen_at=ISO (env'siz — determinizm için parametre: freeze(b, lint, nowIso: string))
//          artifact_hashes=artifactHashes(b) — frozen bundle'a gömülü döner
// kalırsa: reasons her kapı ihlalini insan-okur cümleyle listeler (fail-closed, asla sessız)
// changeset.ts
export interface ChangeSet { id: string; rationale: string;
  added_requirements?: unknown[]; modified_tasks?: Array<{ task_id: string; patch: Partial<TaskContract> }>;
  removed_task_ids?: string[] }
export interface ApplyResult { ok: boolean; bundle?: SpecBundle; errors: string[] }
export function applyChangeSet(b: SpecBundle, cp: ChangeSet, nowIso: string): ApplyResult;
// kurallar: b.manifest.state==='frozen' DEĞİLSE hata ('yalnızca donmuş spec değiştirilebilir');
// frozen ise: spec_version+1, state='draft', frozen_at silinir; patch şema-doğrulamalı
// (TaskContractSchema.partial() ile parse; bilinmeyen task_id hata; removed id varlık kontrolü)
```
- [ ] **Adım 1 (TDD):** freeze.test.ts: (a) good+lint(errors:[]) → ok:true, state frozen, frozen_at parametreden; (b) fixtures/bad/unresolved → ok:false reasons UNRESOLVED içerikli; (c) lint.errors>0 → ok:false; (d) determinizm: aynı girdi → aynı artifact_hashes.
- [ ] **Adım 2 (TDD):** changeset.test.ts: frozen bundle'a geçerli patch → version 2, state draft; draft bundle'a changeset → hata; olmayan task_id → hata.
- [ ] **Adım 3–4:** Implement → GREEN.

## Task 6: CLI (W2)

**Files:** Create: `src/cli/index.ts`; Test: `src/cli/cli.test.ts` (vitest `execFile` ile dist'ten değil — **karar:** CLI testleri fonksiyonel çekirdeği `runCli(argv: string[]): Promise<number>` imzasıyla test eder; process.exit YASAK, çıkış kodu return).
**Interfaces (Produces):** `export async function runCli(argv: string[]): Promise<number>` — `0` başarı, `1` lint/freeze/drift başarısızlığı, `2` kullanım/şema hatası. Alt komutlar: `lco compile <dir>`, `lco lint <dir>` (compile+lint, tablo çıktısı), `lco freeze <dir>`, `lco verify <dir>` (yeniden hash + freeze sonrası drift). `verify` için `src/compiler/verify.ts` EKLE: `export function verifyFrozen(b: SpecBundle): { ok: boolean; drifted: string[] }` — manifest.artifact_hashes ile artifactHashes(b) karşılaştırması (drift fixture'ı yakalamalı — test: fixtures/bad/drift → drifted=['tasks']).
- [ ] **Adım 1 (TDD):** cli.test.ts: compile good → 0; compile bad/schema-invalid → 2; lint bad/L02 → 1 ve stdout'ta 'L02_ORPHAN_REQUIREMENT'; freeze bad/unresolved → 1; verify drift → 1. (stdout yakalama: `vi.spyOn(console, 'log')`.)
- [ ] **Adım 2–3:** parseArgs ile implement → GREEN. `package.json` bin zaten tanımlı; elle dene: `node packages/spec-core/dist/cli/index.js lint fixtures/good/pet-clinic` → 0.

## Task 7: Lint kuralları (W3)

**DÜZELTME (plan içi):** `src/lint/types.ts` W1 Görev 2'de oluşur:
```ts
export const LINT_RULES = ['L01_UNDEFINED_TERM','L02_ORPHAN_REQUIREMENT','L03_TASK_TEST_FILE_UNKNOWN',
  'L04_CYCLIC_TASK_DEPS','L05_INTERFACE_MISMATCH','L06_DUPLICATE_ID','L07_MISSING_NFR_BUDGET',
  'L08_UNRESOLVED_LEAK','L10_TRACEABILITY_GAP','L12_SCOPE_OVERLAP'] as const;
export type LintRuleId = typeof LINT_RULES[number];
export interface LintFinding { rule: LintRuleId; severity: 'error'|'warning'; path: string; message: string }
export interface LintResult { errors: LintFinding[]; warnings: LintFinding[]; summary: Record<string, number> }
```

**Files (W3):** Create: `src/lint/engine.ts`, `src/lint/trace.ts`, `src/lint/rules/{l01,l02,l03,l04,l05,l06,l07,l08,l10,l12}.ts`; Test: her kuralın `.test.ts`'i VE `src/lint/all-bad-fixtures.test.ts`.
**Interfaces (Produces):**
```ts
export interface LintRule { id: LintRuleId; check(b: SpecBundle): LintFinding[] }
export function lintBundle(b: SpecBundle): LintResult;   // tüm kurallar sırayla; hata=error finding
export function buildTrace(b: SpecBundle): TraceEdge[];  // req-task (task.refs.requirements), task-test (tests[].file↔acceptance_refs eşleşmesi DEC'b unseen), dec-task (task.refs.decisions), evidence-req
```
Kural özülleri (her kural tek dosya, ≤60 satır hedef):
- l01: requirement.statement + task.instructions içindeki `**...**` işaretli terimler → glossary'de olmayan her terim error (path: requirement id).
- l02: hiçbir task.refs.requirements'ta geçmeyen REQ id → error.
- l03: task.tests[].file ∉ bundle.test_files → error. (`test_files` alanı Görev 2 şemasında.)
- l04: depends_on grafiğinde döngü (iteratif DFS; path: döngüdeki task id'leri virgülle).
- l05: task.interface_changes.symbol'ları contracts.symbol kümesiyle karşılaştır; eksik → error.
- l06: tüm id alanlarının (REQ/DEC/CON/TASK) benzersizliği; tekrar → error (path: tekrar eden id).
- l07: `complexity_profile !== 'p-mini'` && requirements'ta `/NFR:/i` eşleşen statement yok → error.
- l08: decisions'ta `status==='UNRESOLVED'` VEYA `manifest.unresolved_count>0` VEYA `blocking_count>0` → error (path: DEC id / 'manifest').
- l10: her REQ'in acceptance_refs'taki TST id'si… bundle'da TST kayıt defteri `test_files` (string list) olduğundan **karar:** acceptance_refs TST kalıbında id'lerden oluşur; kural: her REQ en az 1 acceptance_refs girdisi ve o girdinin `TST-xxxx` olduğunun yanında task.tests.cases ile eşleşen bir case adı İÇERMESİ beklenir… fazla karmaşık. **Sadeleştirilmiş bağlayıcı tanım:** l10 = her REQ id, en az bir task.refs.requirements'ta VE o task'ın en az bir test kaydının `cases` dizisinde REQ id'sinin geçtiği bir case metni olmalı; değilse error. (Vektör L10: REQ-0002'yi task refs'ten SİL ve acceptance_refs'ta tut.)
- l12: task çiftleri A,B: permitted_scope glob kesişimi boş değil VE A∈B.depends_on ∪ B∈A.depends_on değil VE aynı `file` alt ağacına dokunuyorlarsa → warning (error değil — vektör `expect:'lint-error'` isterse expected.json'u W1 `rule:'L12_SCOPE_OVERLAP'` + severity uyumu için lint sonucunda error'a çevir: **bağlayıcı: L12 error'dur**, false-positive riskini kabul ediyoruz çünkü izolasyon ihlali yürütme güvenliği meselesi).
- [ ] **Adım 1 (TDD):** Her kural için: ilgili bad fixture'ı yükleyen test `expect(findings.map(f=>f.rule)).toContain('L0X_...')` → RED.
- [ ] **Adım 2:** Implement → her kural GREEN.
- [ ] **Adım 3:** `all-bad-fixtures.test.ts`: fixtures/bad/* gez; expected.json'a göre: lint-error → lintBundle tam olarak o kuralı içerir VE başka BEKLENMEYEN error içermez; freeze-rejected → freeze(lint ile) ok:false; verify-drift → verifyFrozen drifted boş değil; schema-error → parse throw. → GREEN.
- [ ] **Adım 4:** `pnpm --filter @lco/spec-core test` tam pas. COMMIT ETME.

## Task 8: traceability (W3)

**Files:** Create: `src/lint/trace.ts` (yukarıdaki buildTrace) + `trace.test.ts`.
- [ ] **TDD:** good bundle'lar: her REQ'den en az bir req-task kenarı; kenarların iki ucu bundle'da mevcut (varlık kontrolü — yoksa finding değil TypeError DEĞİL, l10 zaten kapsıyor; burada saf graf üretimi test edilir: sayılar deterministik, sıra kararlı (id sıralı)).
- [ ] Implement → GREEN.

## Task 9: Eval görev seti + mock LLM (W4; W1 bitmiş olmalı)

**Files:** Create: `src/eval/tasks/index.ts`, `src/eval/llm/adapter.ts`, `src/eval/llm/mock.ts`.
**Interfaces (Produces):**
```ts
// adapter.ts
export interface LlmResponse { text: string; usage?: { in_tokens: number; out_tokens: number } }
export interface LlmAdapter { complete(prompt: string, opts: { max_tokens?: number }): Promise<LlmResponse> }
// mock.ts — deterministik: prompt içindeki EvalTask id'sini ayıran kayıt defterli fixture yanıtlar
export interface MockScript { byTaskId: Record<string, LlmResponse[]> } // art arda çağrılarda sıradaki yanıt
export function createMockLlm(script: MockScript, taskId: string): LlmAdapter;
// tasks/index.ts
export interface EvalTask {
  id: string;                       // 'ET-01'..'ET-20'
  kind: 'greenfield' | 'ambiguous' | 'conflicting';
  profile: 'p-mini' | 'p-standard';
  intent: string;                   // doğal dil kullanıcı niyeti
  must_be_blocked: boolean;         // ambiguous/conflicting → true
  assertions: DeterministicAssertion[];
}
export type DeterministicAssertion =
  | { type: 'HAS_REQUIREMENTS'; min: number }
  | { type: 'TASKS_ACYCLIC' }
  | { type: 'TASKS_HAVE_VERIFICATION' }
  | { type: 'TRACE_REQ_TASK_COVERED' }
  | { type: 'STATE_IS_DRAFT_OR_BLOCKED' }
  | { type: 'BLOCKED' };
```
20 görev dağılımı: ET-01..ET-12 greenfield (6'sı p-mini: küçük CLI/oyun/dönüştürücü; 6'sı p-standard: API'li servisler; her biri 3–8 gerçekçi niyet metni — ör. "KullanıcılarınURL kısaltabildiği, tıklanma sayan, tek dosyalık SQLite'lı bir CLI"), ET-13..ET-17 ambiguous (bilinçli eksik: "veritabanı kullan" ama hangisi belirsiz, kimlik doğrulama gereksinimi çelişkili…), ET-18..ET-20 conflicting (aynı niyette iki çelişen kısıt: "verileri sonsuza dek sakla" + "GDPR sağ-unutma").
- [ ] **Adım 1 (TDD):** tasks.test.ts: 20 görev, id benzersiz, must_be_blocked yalnız kind ambiguous|conflicting'de, her görevde ≥2 assertion.
- [ ] **Adım 2:** mock.test.ts: ikinci complete çağrısı dizideki ikinci yanıtı verir; bilinmeyen taskId → throw (fail-closed).
- [ ] **Adım 3:** Implement → GREEN.

## Task 10: Pipeline runner + score (W4)

**Files:** Create: `src/eval/runner.ts`, `src/eval/score.ts`.
**Interfaces (Consumes):** LlmAdapter; SpecBundleSchema; lintBundle; freeze. **Produces:**
```ts
export type PipelineVariant = 'single' | 'council';
export interface PipelineOutcome { kind: 'spec'; bundle: SpecBundle }
                        | { kind: 'blocked'; reasons: string[] }
export async function runPipeline(task: EvalTask, variant: PipelineVariant,
                                  llm: LlmAdapter, nowIso: string): Promise<PipelineOutcome>;
// 'single': 1 çağrı — prompt: sınıflandırma+spec üretimi birleşik (şablon src/eval/prompts.ts'te)
// 'council': 3 çağrı — (1) sınıflandırıcı (profile+must-be-blocked çıkarımı JSON), (2) bağımsız öneri A,
//            (3) öneri B + hakem birleştirme (A,B verilir, çelişki varsa UNRESOLVED karar ÜRETME — blocked dön)
// her varyantta çıktı: LLM'den JSON spec → SpecBundleSchema.parse → lint → hata varsa blocked(reasons=lint errors)
// (fail-closed: LLM çıktısı şemaya uymazsa → blocked, ASLA tamir/uydurma yok)
export interface RunScore { taskId: string; variant: PipelineVariant;
  assertionsPassed: number; assertionsTotal: number; blockedCorrectly: boolean | null;
  inTokens: number; outTokens: number; calls: number }
export function scoreRun(task: EvalTask, outcome: PipelineOutcome, usage: {in:number;out:number;calls:number}): RunScore;
// BLOCKED assertion: must_be_blocked && kind==='blocked' → true; !must_be_blocked && blocked → false (geçersiz kılma)
```
- [ ] **TDD (Adım 1–2):** runner.test.ts mock'la: (a) greenfield + mock geçerli spec JSON → kind spec, lint temiz; (b) ambiguous + mock UNRESOLVED'lü decision → blocked; (c) mock bozuk JSON → blocked (şema hatası nedendi); (d) council varyantı tam 3 çağrı yapar (mock çağrı sayacı). score.test.ts: yukarıdaki 4 durum.
- [ ] **Adım 3–4:** Implement → GREEN.

## Task 11: Rapor + http adapter (W4)

**Files:** Create: `src/eval/report.ts`, `src/eval/llm/http.ts`, `src/eval/prompts.ts` (runner'ın kullanacağı 4 şablon: classifySingle, propose, proposeB, judgeMerge — her biri `<INTENT>`, `<PROFILE>` placeholder'lı, JSON-çıktı talimatlı, chain-of-thought İSTEMEYEN).
**Interfaces (Produces):**
```ts
// http.ts — OpenAI-uyumlu chat/completions; env: LCO_LLM_BASE_URL, LCO_LLM_API_KEY, LCO_LLM_MODEL
// ikisi de yoksa createHttpLlm() throw 'live mode requires LCO_LLM_* env' (asla uydurma)
export function createHttpLlm(): LlmAdapter;
// report.ts
export interface GateReportInput { runs: RunScore[]; badFixtureResults: { id: string; expect: string; caught: boolean }[];
  driftCaught: boolean; unresolvedFreezeRejected: boolean }
export function renderGateReport(r: GateReportInput): string;   // markdown
// raporun KANIT HÜKMÜ satırları (deterministik kısmın):
//   G1: bad fixture yakalama oranı (hedef 15/15 — L09/L11 schema-error dahil (plan düzeltmesi: dizin tanımı 12 lint vektörü + drift + unresolved + schema-invalid = 15))
//   G2: drift tespiti (verifyFrozen) → true
//   G3: ambiguous/conflicting 5 görevin mock modda BLOCKED üretmesi → 5/5
//   G4 (yalnız --live varsa): council assertion toplamı > single VE council maliyet ≤ 3× single
export async function runEvalAll(opts: { variant: 'mock'|'live'; reportPath?: string }): Promise<GateVerdict>;
export type GateVerdict = 'PASS' | 'FAIL' | 'PASS_DETERMINISTIC_ONLY';
```
- [ ] **TDD:** report.test.ts: mock full-pass girdisi → metin 'PASS' + G1..G3 satırları; drift yakalanmamışsa 'FAIL'. http.test.ts: env yokken throw; env varken (cihazda test YOK — fetch mock'lu birim test: global.fetch vi.stubGlobal ile 200 + usage dönen sahte) parse.
- [ ] Implement → GREEN. `node dist/eval/...` değil — `runEvalAll`'ı CLI'ya EKLEME (YAGNI; `pnpm --filter @lco/spec-core exec node -e "..."` çağrısı W5'te).

## Task 12: Entegrasyon + kanıt raporu (W5; W2+W3+W4 bitmiş olmalı)

**Files:** Create: `packages/spec-core/README.md`; run: `src/eval/run-eval.ts` (giriş: `node dist/eval/run-eval.js --variant mock --report ../audit-output/spec-core-gate-report.md` — audit-output'a YAZAR, denetim izini tamamlar).
- [ ] **Adım 1:** `pnpm --filter @lco/spec-core build && test` → tümü GREEN kaydı.
- [ ] **Adım 2:** `node packages/spec-core/dist/eval/run-eval.js --variant mock` → rapor üretilir; G1/G2/G3 satırları kanıtla doldurulur (PASS beklenir — beklenmezse bu bir BULGU, gizlenmez).
- [ ] **Adım 3 (opsiyonel, kullanıcı anahtarı varsa):** `LCO_LLM_BASE_URL=... LCO_LLM_API_KEY=... LCO_LLM_MODEL=... node ... --variant live` — anahtar KULLANICI tarafından sağlanır; denetici SORAR, asla env okuyup sessiz harcamaz.
- [ ] **Adım 4:** README: kurulum, komutlar, kanıt kapısı ölçütleri (G1–G4), mock/live modlar. 
- [ ] **Adım 5 (ebeveyn):** Tüm dal incelemesi + commit'ler.

---

## Self-Review (yapıldı)
- Şema katmanı (L09/L11) ile lint katmanı ayrımı netleştirildi; W3'ün bağlayıcı kural listesi 10 kural olarak sabitlendi (L01,L02,L03,L04,L05,L06,L07,L08,L10,L12).
- `test_files` ve `terms_used` alanları Görev 2 şemasına işlendi (L01/L03 bağımlılığı).
- W2/W3 arası dairesel bağımlılık `src/lint/types.ts`'in W1'e taşınmasıyla giderildi.
- Paralel worker'ların aynı working tree'de commit yarışı: W2/W3/W4 commit etmez kuralı kondu.
- Kapsam: legacy paketi şema-only (kanıt kapısı için derleyici mantığı YOGUN değil — YAGNI); canlı deney opsiyonel.
