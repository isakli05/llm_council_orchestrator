# Spec Core — Model-Bağımsız Çekirdek Tamamlama Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Sıra:** Aşama A = Task 1–3 (kusursuzluk), B = Task 4–6 (uçtan uca akış), C = Task 7–8 (tüketim yüzeyi). Sıralı yürütülür.

**Goal:** Modelden bağımsız çekirdeği eksiksiz ve kusursuz hale getirmek: strictness hizalaması, eksik CLI komutları (change/trace/init/plan/check), MCP tüketim yüzeyi, uçtan uca dokümantasyon.

**Architecture:** Mevcut `packages/spec-core` (zod+vitest, kendi kendine yeterli) üzerine ekleme. CLI komutları `runCli` desenini izler (process.exit yok, dönüş kodu); MCP sunucusu CLI komut implementasyonlarını yeniden kullanır ve YALNIZ JSON-RPC'yi stdout'a yazar (logger stderr — eski mcp_bridge hatasının tekrarı yasak). `lco check` güvenlik modeli: varsayılan DRY-RUN, komut çalıştırma yalnız açık `--yes` ile.

**Tech Stack:** TypeScript 5 strict, zod ^3.22, vitest ^2.1, node:child_process (yalnız Task 6), yeni dep YASAK.

## Global Constraints

- Yalnız `packages/spec-core/**` (+ lockfile istisnası yok — yeni dep yok). Ana depo root komutları yasak; her şey `pnpm --filter @lco/spec-core ...` scoped.
- Dal: `feat/spec-core-completion` (main'den — Task 1 implementer'ı oluşturur, sonraki implementer'lar üstüne commit).
- Placeholder-success yasak; boş test yasak; TDD zorunlu (RED→GREEN kanıt raporda).
- Fail-closed: tanınmayan durumlar hata; `lco check` komutları varsayılan koşmaz.
- Kırık fixture güncellemesi yasak: şema sıkılaştırması (Task 1) fixture'ları kırarsa önce Fixture'I değil ŞEMAYI sorgula — fixture'lar Task 3'te tek-kusur ilkesiyle donmuş sözleşmeler; bir good fixture strictness altında düşüyorsa bu, fixture'da fazladan anahtar VAR demektir → fixture'dan fazlalık anahtar silinir (bu tek istisna, raporda belgelenir).
- Çıkış kodları tutarlı: 0 başarı, 1 doğrulama başarısızlığı (lint/drift/plan-döngü/check-fail), 2 kullanım/şema/reddi.
- Dosya başına tek sorumluluk; >400 satırda böl.

## Dosya Yapısı (sözleşme)

```
packages/spec-core/src/
  schemas/*.ts                 # Task 1: her z.object'e .strict() + trim-refine'lar
  cli/index.ts                 # Task 2,3,5: change/trace/plan komutları (check Task 6)
  cli/commands/                # Task 7 öncesi refactor: komut implementasyonları
    change.ts trace.ts plan.ts check.ts init.ts   # (exportlu, process.exit'siz, yapılandırılmış sonuç döner)
  check/runner.ts              # Task 6: komut yürütme+kanıt toplama (cli'den ayrı, test edilebilir)
  mcp/server.ts                # Task 7: stdio MCP sunucusu
  cli/mcp-entry.ts             # Task 7: bin girişi (veya mcp/server.ts içinde require.main koruması)
README.md                      # Task 8
```

---

## Task 1: Şema sıkılaştırma — .strict() + trim-refine + Minor kapanışı

**Files:** Modify: `src/schemas/` tüm şema dosyaları (her `z.object` → `z.object({...}).strict()`: common, manifest, intent, glossary, evidence, requirements, decisions, contracts, tasks, legacy + index.ts'teki SpecBundle ve inline assumption/TraceEdge nesneleri); Test: ilgili `*.test.ts`'ler + yeni `strictness.test.ts`.

**Interfaces (Produces):** Şema API'si değişmez (aynı export'lar); davranış değişimi: bilinmeyen anahtarlar artık Parse'ta REDDEDİLİR (zod ↔ generated/spec-schema.json `additionalProperties:false` tam hizalı); `tasks.ts` metin alanlarına `z.string().trim().min(1)` (title, purpose, instructions, rollback, verification[].command/expect, tests[].file, cases[] metinleri) + requirements.statement, decisions.decision, glossary term/definition, intent.statement/normalized aynı refine.

**Bağlayıcı kurallar:**
- ÖNECE RED testleri: (a) her seviyede fazladan anahtar reddi (bundle kökü, manifest, task, refs, verification item, decision.alternatives item); (b) boşluk-string reddi (`title: '   '` throw); (c) 5 good fixture hâlâ parse eder; (d) bad/schema-invalid + L09/L11 hâlâ throw.
- Global constraint istisnası uygulanabilir: good fixture'da fazladan anahtar bulunursa fixture'dan silinir (raporda liste).
- `src/schemas/index.test.ts:127-131` tekrarlayan assert: ikinci test gerçekten `legacy`'siz İKİNCİ bir girdi kurar (structuredClone + delete legacy) — ya da silinir; tercih: düzeltilir.
- `generated/spec-schema.json` yeniden üretilir (build) ve commit edilir; `additionalProperties:false` zaten vardı → diff minimal beklenir.

- [ ] TDD RED → implement → GREEN (`pnpm --filter @lco/spec-core test` + lint + build; spec-schema.json tazelenir) → commit `feat(spec-core): strict schema surfaces + trimmed text fields (final-review FIX items)`

## Task 2: `lco change` — changeset operasyonelleştirme

**Files:** Create: `src/cli/commands/change.ts`; Modify: `src/cli/index.ts` (alt komut kaydı + yönlendirme); Test: `src/cli/commands/change.test.ts` (+ cli.test'e bir uç).

**Interfaces (Consumes):** `applyChangeSet(b, cp, nowIso)` (src/compiler/changeset.ts), `compileSpecDir`, `lintBundle`. **Produces:** `export async function cmdChange(dir: string, changesetPath: string, opts: { nowIso: string }): Promise<{ code: number; summary: string }>` — CLI sarmalayıcısı bunu yazdırır/kodla döner.

**Davranış sözleşmesi:**
1. `compileSpecDir(dir)` !ok → {code:2}.
2. changeset JSON'u oku+parse; parse hatası → {code:2, 'changeset not valid JSON'}.
3. `applyChangeSet(bundle, cp, nowIso)` — nowIso CLI sınırında `new Date().toISOString()` (yalnız sarmalayıcıda).
4. ok:false → hatalar yazılır → {code:2}.
5. ok:true → değişen bölümleri geri yaz: `spec/manifest.json` (yeni sürüm/state) + `spec/tasks.json` (modified/removed) + `spec/requirements.json` (added_requirements varsa). Yazım atomik-vari (tmp+rename) olmasa da yazım hatası → {code:2}.
6. Yeni bundle üzerinde `lintBundle` → errors varsa tablo + {code:1}; temizse özet (version, task sayıları) + {code:0}.
7. `lco change` kullanım metni: `lco change <dir> <changeset.json>`; changeset şablonu kullanımda gösterilir.
- Testler: donmuş good dizin + geçerli changeset → dosyalar güncellenir (manifest spec_version 2, state draft) + 0; draft dizin → 2 ('only frozen'); bilinmeyen task_id → 2; typo patch anahtarı → 2 (strict); değişiklik-sonrası lint hatası (kasıtlı kötü patch: task'ı L02 tetikleyecek şekilde boz — örn refs.requirements'ı boşalt... şema min yok — refs.requirements boş olamaz mı? TaskContract.refs.requirements array min yok → boşabilir → L02 orphan... ama L10 da etkilenir; tek kusur: TASK-0001.refs.requirements=[] → REQ-0001 yetim → L02) → 1.
- [ ] TDD → commit `feat(spec-core): lco change — operable change-sets with re-lint gate`

## Task 3: `lco trace` — izlenebilirlik raporu

**Files:** Create: `src/cli/commands/trace.ts`; Modify: cli/index.ts; Test: trace.test.ts.

**Interfaces (Consumes):** `compileSpecDir`, `buildTrace` (src/lint/trace.ts). **Produces:** `export function cmdTrace(dir: string): Promise<{ code: number; report: string }>`.

**Davranış:** compile !ok → {code:2}. ok → buildTrace → rapor (insan-okur): kenar sayıları tür bazında; REQ başına satır: `REQ-0001 → TASK-0001 (✓test-bağ) | TASK-0002 (✗test-bağ yok)`; yetim REQ'ler (hiç task refs yok — L02 görünümü) `ORPHAN` etiketiyle; test-bağısız REQ'ler `NO-TEST-LINK` etiketiyle. Çıkış 0 (bilgilendirici; lint'in kendi komutu var). `--json` yok (YAGNI; plan'da var).
- Testler: good pet-clinic → 0 + çıktı her REQ id'yi içerir + kenar sayıları pozitif; bad/L02 → REQ-0003 ORPHAN satırı; bad/L10 → NO-TEST-LINK satırı; schema-invalid → 2.
- [ ] TDD → commit `feat(spec-core): lco trace — traceability coverage report`

## Task 4: `lco init` — spec iskeleti

**Files:** Create: `src/cli/commands/init.ts`; Test: init.test.ts.

**Interfaces (Produces):** `export function cmdInit(dir: string, opts: { profile: 'p-mini'|'p-standard'; name: string; nowIso: string }): Promise<{ code: number; files: string[] }>` — `spec/` altına BÜTÜN bölümler için dosyalar yazar.

**Bağlayıcı tasarım (placeholder-uccess tuzağına karşı):** Boş iskelet şemaya göre GEÇERSİZ olacağından (min(1)'ler), init ÇALIŞAN MİNİMAL ÖRNEK yazar: 1 evidence (E-0001, kind user_input, source 'intent', hash=sha256 boş-dize özeti `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`), 1 glossary terimi, 1 requirement (REQ-0001 'Örnek gereksinim — kendi gereksiniminle değiştir' cümleli İNGİLİZCE content: 'EXAMPLE requirement — replace with your own'), 1 decision (accepted, confidence 0.5), 1 task (TASK-0001, verification `node --version` expect 'exit 0' — HER ORTAMDA GERÇEKTEN ÇALIŞIR), intent.statement 'EXAMPLE intent — replace...'. manifest: state draft, spec_version 1, council_run {run_id:'manual', config_fingerprint:'manual'}, evidence_snapshot.pack_hash boş-dize özeti + collected_at nowIso, target_runtime {platform:'unspecified', stack:'unspecified'}, profile param'a göre complexity_profile; p-standard ek: 1 contract + NFR: önekli OPS-0001 gereksinimi + 2. task (TASK-0002, TASK-0001'e bağlı). **Kabıt test: init → compile ok → lint 0 hata → freeze ok (komut zinciri kanıtı).** Hedef dizinde `spec/` zaten varsa → {code:2, 'refusing to overwrite'}.
- Testler: p-mini init → files listesi tam (10 dosya) → compile/lint/freeze zinciri 0/0/0; p-standard → NFR: statement var (L07 geçer) + TASK-0002 depends_on TASK-0001; overwrite → 2.
- [ ] TDD → commit `feat(spec-core): lco init — working minimal spec scaffold (p-mini/p-standard)`

## Task 5: `lco plan` — yürütme planı

**Files:** Create: `src/cli/commands/plan.ts`; Modify: cli/index.ts; Test: plan.test.ts.

**Interfaces (Consumes):** compileSpecDir. **Produces:** `export function cmdPlan(dir: string, opts: { json: boolean }): Promise<{ code: number; output: string }>`.

**Davranış:** compile !ok → 2. Kahn topolojik sıralama (deterministik: aynı seviyede task_id lexicographic); döngü → döngü üyeleri listelenir → {code:1}. Çıktı (tablo): sıra #, task_id, complexity, depends_on, verification komutları, permitted_scope. `--json` → `{order: string[], tasks: Record<id, {title, complexity, depends_on, verification, permitted_scope}>}` (ajana makine-okur). Bilinmeyen depends_on referansı → uyarı satırı ama plan yine çıkar (lint L-haric not; aslında böyle referans zaten lint'te L05/... kapsamı değil — sadece uyarı).
- Testler: pet-clinic (bağımlılıklı) → order bağımlılıklara saygılı (TASK-0001 öncesi TASK-0002 yok) + deterministik iki çağrı; bad/L04 → 1 + döngü üyeleri çıktıda; --json parse edilir, order.length = tasks.length; schema-invalid → 2.
- [ ] TDD → commit `feat(spec-core): lco plan — topological execution plan (human + json)`

## Task 6: `lco check` — doğrulama komutlarını gerçek koşma + kanıt

**Files:** Create: `src/check/runner.ts` (çekirdek) + `src/cli/commands/check.ts`; Modify: cli/index.ts; Test: check/runner.test.ts + commands/check.test.ts.

**Interfaces (Produces):**
```ts
export interface CheckOutcome { taskId: string; command: string; expect: string; expectedExit: number | null; actualExit: number | null; status: 'PASS'|'FAIL'|'TIMEOUT'|'UNPARSEABLE-EXPECT'|'DRY'; durationMs: number; outputTail: string }
export function parseExpect(expect: string): number | null   // /exit (\d+)/ → sayı; yoksa null
export async function runChecks(dir: string, opts: { task?: string; yes: boolean; timeoutMs?: number; nowIso: string; exec?: Executor }): Promise<{ code: number; outcomes: CheckOutcome[] }>
// Executor = (cmd: string, cwd: string, timeoutMs: number) => Promise<{ exit: number | null; stdout: string; timedOut: boolean }> — injectable; üretim exec'i child_process.exec sarmalayıcı; testler sahte Executor ile (gerçek süreç YOK — tek istisna: bir smoke testi `node -e "process.exit(7)"` gerçek koşar).
```
**Güvenlik modeli (bağlayıcı):** `yes:false` (varsayılan) → komutlar HİÇ koşulmaz, tüm status 'DRY', çıktı komut+expect tablosu, code 0. `yes:true` → komut çalışır. `expectedExit===null` → status 'UNPARSEABLE-EXPECT' → FAIL sayılır (fail-closed). TIMEOUT (default 60_000) → FAIL sayılır. `outputTail` 500 karakter. Kanıt: her koşulan komut için `spec/evidence/<TASK-ID>-check.json` yazılır: {task_id, command, expect, expectedExit, actualExit, status, durationMs, outputTail, checkedAt: nowIso}.
- CLI: `lco check <dir> [--task TASK-0001] [--yes] [--timeout-ms 60000]` → tablo + code (0 hepsi PASS|DRY, 1 en bir FAIL/UNPARSEABLE/TIMEOUT, 2 compile/usage). `--yes` verilmeden komut koşulduğunda herhangi bir test fail eder (DRY iddiası).
- Testler: sahte Executor (exit 0 / exit 3 / timeout) → status/kanıt dosyası/kodlar; parseExpect ('exit 0'→0, 'çıktı boş olmalı'→null); DRY hiç exec çağırmaz (sayaç 0) + evidence yazılmaz; tek görev seçimi; gerçek smoke: tmp spec + verification `node -e "process.exit(7)"` expect 'exit 7' → --yes PASS.
- [ ] TDD → commit `feat(spec-core): lco check — execute verification commands, collect evidence (dry-run default)`

## Task 7: `lco-mcp` — MCP sunucusu

**Files:** Create: `src/mcp/server.ts`; Modify: `package.json` (bin'e `"lco-mcp": "dist/mcp/server.js"`), `src/cli/commands/*` zaten yapılandırılmış sonuç döndürüyor (Task 2–6) — MCP bunları çağırır, yazdırma yapmaz; Test: `src/mcp/server.test.ts` (child process spawn ile gerçek stdio).

**Bağlayıcı protokol (minimal MCP):** Satır-ayraçlı JSON-RPC 2.0 stdio. Metodlar: `initialize` → {protocolVersion:'2025-06-18', capabilities:{tools:{}}, serverInfo:{name:'lco-mcp', version:pkg}}; `notifications/initialized` → yanıt yok; `tools/list` → 7 araç: lco_compile{dir}, lco_lint{dir}, lco_freeze{dir}, lco_verify{dir}, lco_trace{dir}, lco_plan{dir, json?}, lco_check{dir, task?, yes?} (inputSchema basit object, required [dir]); `tools/call` → komut fonksiyonunu çağır → yanıt `{content:[{type:'text',text: <özet+rapor>}], isError: code!==0}`. Bilinmeyen id/metod → standart JSON-RPC hatası. **STDOUT YALNIZ JSON-RPC satırları — her log stderr'e** (anti-F18: test, spawn edilen sürecin stdout'undaki HER satırı JSON.parse ile doğrular). `require.main === module` koruması (typeof require dahil), readline ile satır okuma.
- Testler: spawn → initialize+initialized+tools/list el sıkışması (7 araç, isimler tam); tools/call lco_lint good fixture → isError:false + içerik '0 errors'; bad/L02 → isError:true + 'L02' içerik; lco_check yes'siz → DRY satırı; stdout'un tamamı geçerli JSON satırları (kirli log taraması); bozuk JSON satırı → error response id:null.
- [ ] TDD → commit `feat(spec-core): lco-mcp — stdio MCP server exposing the engine (clean stdout)`

## Task 8: README — uçtan uca dokümantasyon

**Files:** Modify: `packages/spec-core/README.md`; (opsiyonel Create: `packages/spec-core/examples/changeset.example.json`).

**Bağlayıcı içerik:** (1) yeni komutların kullanımı (init/change/trace/plan/check + check güvenlik modeli: varsayılan DRY, `--yes` açık onay, kanıt dosyaları); (2) **gerçek koşulmuş** uçtan uca tur: tmp dizinde init→compile→lint→freeze→(kasıtlı tamper→verify 1)→change→verify→plan→check --yes — implementer KOMUTLARI GERÇEKTEN KOŞAR ve çıktıları (kırpılmış) README'ye koyar; uydurma çıktı YASAK; (3) MCP bölümü: Claude Code/Cursor yapılandırma snippet'i (`claude mcp add lco -- node .../dist/mcp/server.js` tarzı) + araç listesi; (4) strictness politikası (bilinmeyen anahtar reddi; zod↔JSON-Schema hizalı); (5) değişiklik günlüğü bölümü.
- Kabul: README'deki her komut kopyala-yapıştır çalışır (implementer hepsini koşmuş olmalı); lint/build/test etkilenmez (README-only + örnek json).
- [ ] İçerik + gerçek koşu kanıtı → commit `docs(spec-core): end-to-end walkthrough, MCP guide, check security model`

---

## Self-Review (yapıldı)
- Task 1'in fixture etkisi açıklandı (tek istisna kuralı); Task 4'ün placeholder-tuzağı çalışma-örneği tasarımıyla çözüldü; Task 6 güvenlik modeli (DRY varsayılan + injectable Executor) bağlayıcı; Task 7 stdout-saflığı test-enforcelı; Task 8 gerçek-koşu zorunlu.
- Çıkış kodları tutarlı; her komut yapılandırılmış sonuç döner (MCP yeniden kullanımı için); bağımlılık sırası: Task 7, Task 2–6'nın komut fonksiyonlarını tüketir → sıralı yürütme şart.
