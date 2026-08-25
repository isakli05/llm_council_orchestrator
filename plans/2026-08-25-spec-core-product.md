# Spec Core — Ürünleşme (generate + CI + npm) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Sıra:** Task 1 (generate) → Task 2 (CI) → Task 3 (npm). Sıralı.

**Goal:** İlk kullanılabilir ürün eşiği: `lco generate` (niyet→donabilir spec, LLM env üzerinden), GitHub Actions CI, npm-paketi hazır hâl.

**Architecture:** generate, eval'de kanıtlanmış pipeline'ı (prompts+runner+retry+fail-closed) ürün komutuna sarar; LLM yapılandırması mevcut `LCO_LLM_*` env sözleşmesiyle (createHttpLlm, thinking-off EXTRA_BODY dahil). Çıktı bundle'ı spec/ bölüm dosyalarına yazılır (paylaşımlı yazıcı). CI yalnız spec-core scoped komutları koşar (root scriptler bilinen kırık). npm paketi: dist testleri dışlar (tsconfig exclude), files/bin/engines/prepublishOnly tanımlı; publish KULLANICI eylemi.

**Tech Stack:** Mevcut — yeni dep YOK.

## Global Constraints

- Kapsam bu dalgada: `packages/spec-core/**` + `.github/workflows/ci.yml` (yalnız Task 2) + gerektiğinde repo KÖK dosyası YOK. Root package.json DOKUNULMAZ.
- CI dosyası Task 2 dışında hiçbir görevde oluşturulmaz/değişilmez.
- Placeholder-success yasak; TDD zorunlu; fail-closed; exit kodları 0/1/2 sözleşmesi.
- Dal: `feat/spec-core-product` (main'den — Task 1 implementer'ı oluşturur).
- Komutlar scoped: `pnpm --filter @lco/spec-core ...`.

---

## Task 1: `lco generate` — niyetten spec'e ürün komutu

**Files:** Modify: `src/eval/runner.ts` (imza genişletme — yıkımsız); Create: `src/cli/commands/write-spec.ts`, `src/cli/commands/generate.ts`; Test: `src/cli/commands/generate.test.ts`, `write-spec.test.ts` (+ runner.test'e bir uyumluluk ucu); Modify: `src/cli/index.ts` (kayıt+kullanım).

**Interfaces:**
```ts
// runner.ts — EvalTask yerine yapısal tip (mevcut çağrılar SHADETSIZ çalışır):
export async function runPipeline(task: Pick<EvalTask, 'intent' | 'profile'>, variant, llm, nowIso): Promise<PipelineOutcome>
// write-spec.ts
export function writeSpecDir(dir: string, bundle: SpecBundle): void   // 9 bölüm dosyası (legacy varsa 10); mkdir -p; mevcut spec/ varsa THROW 'refusing to overwrite'
// generate.ts
export interface GenerateOptions { intent: string; variant: 'single'|'council'; profile: 'p-mini'|'p-standard'; nowIso: string; llm?: LlmAdapter }
export interface GenerateResult { code: number; output: string }
export async function cmdGenerate(dir: string, opts: GenerateOptions): Promise<GenerateResult>
```

**Davranış (bağlayıcı):**
1. `dir/spec` mevcut → {code:2, 'refusing to overwrite'} (yazılmaz).
2. LLM: opts.llm verilmediyse `createHttpLlm()` (env eksik → throw; sarmalayıcı catch → exit 2, net mesaj).
3. `runPipeline({intent, profile}, variant, llm, nowIso)` — kind 'blocked' → reasons yazılır, HİÇBİR dosya yazılmaz, {code:1}. kind 'spec' → bundle lintBundle → hata varsa (teori: runner zaten lint'li; savunma) reasons + {code:1}, dosya yok.
4. Temiz → `writeSpecDir` → özet: proje adı (bundle.manifest.project.name), REQ/TASK sayıları, calls, in/out token, state draft → {code:0}.
5. CLI: `lco generate <dir> --intent "<metin>" | --intent-file <path> [--variant council|single] [--profile p-mini|p-standard]` — varsayılan variant **council** (ürünün farklılaştırıcısı; maliyet notu kullanımda), profile p-standard. nowIso sarmalayıcıda.
6. --intent/--intent-file ikisi de yok → 2; ikisi birden → 2; dosya okunamadı → 2.

**Testler (TDD):** mock adapter (fixture-türetilmiş geçerli bundle — eval runner.test'in builder deseni): spec → 0 + 9 dosya + içerik doğrulama (manifest state draft, tasks.json dizisi); blocked (UNRESOLVED'lu) → 1 + dizin YOK; no-clobber → 2; env'siz ve llm'siz → 2; --intent-file; council tam 3 çağrı (mock sayaç); lint-hatası-savunması (mock lint-kirli bundle dönerse) → 1 + dosya yok. writeSpec: 10. dosya legacy varsa; varolan spec/ throw.

## Task 2: CI — GitHub Actions

**Files:** Create: `.github/workflows/ci.yml` (tek dosya; başka hiçbir şey).

**Bağlayıcı içerik:** `name: ci`; push main + pull_request; ubuntu-latest; pnpm/action-setup@v4 (packageManager pin pnpm@10.17.1 — repo kökünde packageManager alanı YOKSA corepack pin işlemez: pnpm sürümünü env `PNPM_VERSION: 10.17.1` sabitiyle kurulum adımında kullan); actions/setup-node@v4 node [22, 24] matrix, cache pnpm; adımlar SIRAYLA: `pnpm install --frozen-lockfile` → `pnpm --filter @lco/spec-core build` (MCP spawn testi dist gerektirir — build TESTTEN ÖNCE şart) → `pnpm --filter @lco/spec-core lint` → `pnpm --filter @lco/spec-core test`. concurrency grubu (aynı ref'te eski koşuları iptal).

**Doğrulama (lokalde mümkün olan):** YAML geçerli (node -e yaml parse? js-yaml dep YOK — `node:util` ile olmaz; ÇÖZÜM: `npx --yes yaml-lint` GEÇİCİ aracı çağrılabilir mi? Yeni dep eklemek yasak ama npx ile tek-seferlik lint aracı dep eklemez — kabul; ya da python3 yaml). Adım komutlarının birebirini lokalde koş (install/build/lint/test zaten yeşil). DÜRÜST SINIR: gerçek çalışma ancak push'ta görülür — README'ye değil, commit mesajına not; push kullanıcı kararı.

## Task 3: npm paketi

**Files:** Modify: `packages/spec-core/package.json`, `packages/spec-core/tsconfig.json`, `packages/spec-core/README.md` (kurulum bölümü); Test: `src/cli/commands/*` değişmez; doğrulama script'siz komutlarla.

**Bağlayıcı:**
1. **Ad**: `npm view <name>` ile sırayla dene: `lco-spec`, `spec-core`, `spec-compiler-core` — İLK MÜSAİT olan; scope'suz (kullanıcı npm sahipliği bilinmiyor). Seçim commit mesajında gerekçelendirilir.
2. **tsconfig**: `"exclude": ["src/**/*.test.ts"]` — dist'ten testler çıkar (final review'ün eski notu; vitest src'ten koşar, etkilenmez; dist boyutu küçülür). Build sonrası `ls dist/cli/commands | grep -c test` = 0 doğrulaması.
3. **package.json**: `"version": "0.1.0"`, `"description"`, `"license": "MIT"`, `"engines": {"node": ">=22"}`, `"files": ["dist", "generated", "examples", "README.md"]`, scripts + `"prepublishOnly": "pnpm run build && pnpm run test"`, main/bin korunan değerler.
4. **Doğrulama**: `pnpm --filter <pkg> build && test` yeşil; `npm pack --dry-run` çıktısında: dist test-dışık, generated/spec-schema.json dahil, .env* YOK, fixtures YOK (files listesi dışı — pack only files+defaults: README/package.json/license; LICENSE repo kökünde → package.json "license" alanı yeterli yayınlamada? npm otomatik LICENSE kök arar — paket kökü packages/spec-core; dosya listesine README dahil; LICENSE kopyası EKLENMEZ (kök repo MIT metni zaten; npm uyarısı kabul, not edilir) — HAYIR: temiz paket için packages/spec-core/LICENSE dosyası KÖK METNİN KOPYASIYLA eklenir (tek dosya istisnası, gerekçe: npm otomatik görür).
5. README hızlı-başlangıç: `npm i -n <pkg>` (publish sonrası) + mevcut kaynak-kurulum korunur.
6. `npm publish` YAPILMAZ — kullanıcı eylemi (hesap/token gerekir); README'ye yayınlama talimatı değil, kurulum talimatı.

---

## Self-Review (yapıldı)
- generate'in LLM yüzeyi mevcut env sözleşmesini birebir kullanır (yeni konfig katmanı yok — YAGNI); runner imza değişimi yapısal-tip ile yıkımsız (mevcut testler dokunulmaz). CI'ın build-before-test sırası MCP spawn testinin bilinen gereksinimi. npm adı çakışma denetimi runtime'da; publish dışlanır (dış-eylem).
