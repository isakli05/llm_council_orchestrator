# Codex Dış Denetimi Düzeltme Programı — Implementation Plan

Kaynak kanıt: `audit-output/codex-external-audit/` (kanonik: 11-findings-register.md,
12-prioritized-remediation-roadmap.md, 14-final-verdict.md). Hedef: **39/39 bulgunun
kanıtlı kapanışı** (FIXED / ACCEPTED-DOC / USER-GATED), yol haritasının P0→P1→P2→P3
bağımlılık sırasına birebir uyum. P4 kapsam DIŞI. Faz başına dal
(`feat/p0-remediation`, …), faz sonu whole-branch inceleme → main'e merge.

Bulgu→görev eşlemesi (kanonik; REMEDIATION-LOG bu tabloyu izler):
PROD-001→T2 · SEC-001→T1 · BACK-001→T5 · BACK-002→T4 · DATA-001→T6 · BACK-003→T7 ·
SEC-002→T9 · UX-001→T11 · PROD-002→T3 · PROD-003→T12 · BACK-004→T7,T8 ·
ARCH-001→T14 · BACK-005→T6 · BACK-006→T7 · DATA-002→T19 · SEC-003→T15 ·
SEC-004→T15 · SEC-005→T16 · OPS-001→T17 · TEST-001→T2 · TEST-002→T2,T13 ·
OPS-002→T13 · PROD-004→T10 · PROD-005→T18 · PERF-001→T21 · UX-002→T3 ·
UX-003→T11 · BACK-007→T21 · BACK-008→T5 · SEC-006→T17 · UX-004→T11 ·
OPS-003→T25 · TEST-003→T24 · DATA-003→T25 · ARCH-002/BACK-009/DATA-004/SEC-007/
TEST-004→KORUNAN değişmezler (kapanışta ACCEPTED-DOC, ihlal edilmediği doğrulanarak).

## Global Constraints

1. KORUNACAK değişmezler (ihlal eden FIX reddedilir): spec-core'un legacy'den
   izolasyonu; JSON dosya kalıcılığı (DB YASAK); zod-otoriter + üretilmiş
   JSON-Schema ikilisi; CLI/MCP aynı saf komut-çekirdeklerini paylaşır;
   deterministik saat (çekirdek kodda Date YOK, nowIso enjekte; yalnız
   CLI/MCP sınırında); MCP stdout-saflığı; check DRY-varsayılan +
   yargılanamayan komut koşulmaz; mikro servis/K8s/GUI eklenmez.
2. Komutlar: `pnpm install --frozen-lockfile`; `pnpm --filter ./packages/spec-core
   build|lint|test` — PATH filtresi ZORUNLU (isim filtresi eşleşmeyince sessiz
   exit 0 TUZAĞI). Her implementer turu sonunda üçü tam yeşil.
3. Build önünde dist temizliği (tsc dist'i temizlemez; bayat dosya riski).
   MCP spawn testi dist ister → build testten önce.
4. TDD zorunlu: önce RED testi. "Sessiz başarı" kalıplarının tersini testle
   sabitle (unknown-key yutma, lint'siz compile, retry'da UNRESOLVED silme,
   advisory-block vb.).
5. Testlerde Response gövdesi tek-kullanımlık — factory kullan.
6. Kod keşfi yapan her sub-agent ÖNCE graphify kullanır:
   `graphify query "<soru>"` / `graphify explain "<kavram>"` (graphify-out/graph.json
   mevcut), sonra hedef dosyaları okur. Graph bayatsa `graphify update .`.
7. Commit mesajları kapatılan bulgu ID'lerini taşır (örn. `fix(spec-core): BACK-001 …`).
8. USER-GATED (asla tek başına yapılmaz): U1 anahtar rotasyonu · U2 history purge
   + force-push · U3 push (faz merge'lerinden sonra; uzak Node 22/24 CI
   doğrulaması) · U4 npm publish. Canlı LLM çağrısı yalnız kullanıcı
   LCO_LLM_* env sağlarsa; mock her zaman önce; ödenmiş çağrı testleri opt-in.
9. Root build/test TASARIM GEREĞİ kırık — root suite ASLA koşulmaz; tüm iş scoped.

## Task 1 (P0-1): Kimlik bilgisi kontrolü — depo tarafı [SEC-001]

- `.env.test`'i HEAD'den kaldır (git rm) ve `.gitignore`'a ekle.
- `plans-out/PRODUCTION_HARDENING_COMPLETE.md` içindeki anahtar değerini içeren
  satırları redakte et (değeri hiçbir çıktıya/commit'e YAZMA; değişken adı ve
  dosya konumu üzerinden doğrula).
- `apps/orchestrator/src/models/__tests__/ModelGateway.real-api.test.ts`'i
  default-skip karantinaya al: `LCO_REAL_API=1` explicit opt-in olmadan dosya
  hiç koşmaz (vitest koşullu skip). Root suite ÇALIŞTIRILMAZ.
- `.env.example` yalnız placeholder içerdiğini doğrula.
- `audit-output/codex-external-audit-remediation/U1-KEY-ROTATION.md`:
  rotasyon kontrol listesi (panel tarafı = kullanıcı).
- `…/U2-HISTORY-PURGE.md`: `git filter-repo --replace-text` komut şablonu
  (anahtar değeri KULLANICI tarafından çalıştırma anında sağlanır), force-push
  adımları, fork/cache/GitHub-cache uyarıları. ÇALIŞTIRMA — yalnız hazırla.
- Kanıt: `git ls-files` çıktısında .env.test yok; redakte dosya temiz;
  karantina testi skip olarak görünür; spec-core scoped üçlüsü yeşil kalır.
- Dokunma yasağı: packages/spec-core kaynak kodu (bu görev kod değildir).

## Task 2 (P0-2): Çalıştırılabilir bin girişleri + packed-install smoke [PROD-001, TEST-001, TEST-002/smoke]

- Bin hedeflerine shebang: `src/cli/index.ts` ve `src/mcp/server.ts` ilk satırı
  `#!/usr/bin/env node` (tsc korur — emitted dist'te doğrula); build adımı
  dist bin'lerini chmod 755 yapar (pack mode 644→755).
- TEST-001: `test` kendi temiz build'ini içerir (pretest: dist temizle + build);
  bayat-dist MCP tuzağı kapanır. `pnpm --filter ./packages/spec-core test`
  tek başına yeterli ve kendine yeten olur.
- `scripts/packed-install-smoke.sh` repoya: npm pack → tmp dizin → tarball'dan
  kurulum → `lco init` tmp spec'te gerçek POSIX çalışması + `lco-mcp`
  initialize handshake → exit 0. (--help Task 3'te gelene kadar smoke
  help KULLANMAZ.) Her fazda tekrar koşulacak kapı.
- Kanıt: smoke koşusu + exit kodu kaydı; scoped build/lint/test yeşil;
  pack dry-run'da bin mode 755.
- Not: package.json "files"/bin alanları korunur; tek üretim bağımlılığı zod
  kalır (smoke script'i dev tarafında kalır).

## Task 3 (P0-3): Kök ön kap + CLI yardım [PROD-002, UX-002]

- Root README: spec-core/lco-spec ana anlatı ve hızlı başlangıç (Node>=22,
  pnpm, PATH-filtre komutları); legacy bölümü açık ARŞİV etiketi; kırık Docker
  quick-start ve indexer başlatma talimatları kaldır; env dokümanı
  spec-core gerçeğiyle eşleşsin. Badge: işaret ettiği workflow uzakta GERÇEK
  mi doğrula; şüphede badge'i kaldır (U3 sonrası geri gelebilir).
- UX-002: `lco --help`/`-h` → exit 0; `lco --version` (package.json'tan);
  komut-bazlı yardım (`lco init --help`); bilinmeyen bayrak davranışı netleşir.
  Testler RED'den başlar.
- packed-install smoke genişlet: `lco --help` + `lco --version` da doğrulanır.
- `packages/spec-core/README.md` hızlı başlangıcı gerçek davranışla birebir.

## Task 4 (P0-4): Tek lifecycle doğrulayıcı [BACK-002]

- Yeni merkezî modül (örn. `src/compiler/lifecycle.ts`): yasal durum kümesi
  (draft, frozen, blocked, superseded) + yasal geçişler; tek gerçeklik kaynağı.
  generate → yalnız `draft` + istenen profil çıktısı kabul (state:frozen dönen
  mock RED); freeze: blocked/superseded/frozen durumdan reddeder; drift'li
  frozen'da yeniden-freeze reddi (önce verify; sürüm yalnız change ile artar).
- lint L08 + manifest şeması + changeset + freeze aynı doğrulayıcıyı çağırır
  (denormalize alanlar merkezi doğrulamadan geçmeden geçemez).
- Kabul testleri (önce RED): (a) mock `state:frozen` → generate başarısız;
  (b) sıfır sayaçlı `blocked` manifest lint/freeze reddi; (c) frozen v1
  düzenlenip yeniden freeze → RED + verify drift raporu; (d) freeze dışı
  sürüm değişimi imkânsız.
- Kısayasak: changeset zarf yapısı (strict unknown-key) korunur.

## Task 5 (P0-5): Blok kanıtı monotonikliği [BACK-001, BACK-008]

- `must_be_blocked` classifier çıktısı MONOTONİK: nihai sonuç blocked olur —
  gate seviyesinde (runner kodunda), prompt tavsiyesi DEĞİL. Blocked durumda
  temiz final fixture → RED.
- Retry'lar arası UNRESOLVED ID kümesi korunur + karşılaştırılır: retry,
  önceki unresolved maddeyi düşürürse sonuç INCOMPLETE/RESOLUTION_MISSING ile
  reddedilir (sessiz kabul YASAK).
- BACK-008: proposal A retry metni yeniden şema-doğrulamasından geçer;
  geçemezse council bacağı DEGRADED işaretlenir ve merger'a giremez;
  raporlama bunu ayrı gösterir.
- Dosyalar: `src/eval/runner.ts`, `src/eval/prompts.ts` (+ testleri).
- Kabul: denetimin iki runtime senaryosu (must_be_blocked:true+temiz final;
  L08 retry'da unresolved silme) + iki kez bozuk proposal-A → degraded.

## Task 6 (P0-6): Atomik revizyon yazımı + kök-başına kilit [DATA-001, BACK-005]

- Yeni depolama modülü (örn. `src/storage/revision.ts`): kök-başına kilit
  (lockfile exclusive-create + stale kırılım politika testi), tüm bölüm
  yazımları temp dosya + rename (fs uygunsa fsync), init no-clobber
  exclusive-create.
- BACK-005: `change` aday revizyonu TAM doğrular (compile+lint) → staged
  yazım → atomik rename. Lint-geçersiz change DİSKE YAZILMAZ; exit 1 =
  hiçbir şey değişmedi (README sözleşmeyi belgeler; davranış değişikliği).
- MCP mutasyonları (freeze/evidence yazımı) aynı modülden geçer.
- Kabul (önce RED): (a) iki eşzamanlı init → tek başarı, diğeri temiz hata,
  JSON geçerli; (b) tasks.json yazılamaz → eski durum bozulmaz, retry mümkün;
  (c) lint-geçersiz change → disk değişmez; (d) kilit stale senaryosu.
- Dosyalar: `cli/commands/{init,write-spec,change,freeze}.ts`, `mcp/server.ts`
  yazım çağrıları, yeni modül + testleri. `verify`/`hash` semantiği değişmez.

## Task 7 (P0-7): Anlamsal kapanış + doğrulanabilir verification sözleşmesi [BACK-003, BACK-004, BACK-006]

- Aduzayı-ID şemaları: EV-/DEC-/REQ-/TASK- (ve test referans alanı varsa TST-);
  tek genel regex kalkar; yanlış aduzayı şema hatası.
- Tek referans-kapanış doğrulama fazı: evidence/acceptance/decision/requirement
  refs + task dependencies varlık kontrolü; bilinmeyen bağımlılık machine
  planı BLOKLAR (`plan --json` uyarı düzine değil hata; human modda da açık red).
- BACK-006: görev ID benzersizliği compile düzeyinde; plan/trace/check adlandırılmış
  doğrulama seviyesi ister (frozen veya lint-clean draft); check DRY-varsayılan
  korunur.
- BACK-004: `expect` katı gramer — `/exit (\d+)/` şema/lint düzeyinde;
  dry-check UNPARSEABLE'ı FAILURE olarak yüzeyler (exit ≠ 0); --yes altında
  yargılanamayan yine koşulmaz.
- Kabul (önce RED): E-9999/TST-9999/DEC-9999/REQ-9999/TASK-9999 reddi;
  duplicate task ID reddi; dry'da unparseable expect hata; plan --json
  unknown dep hata; geçerli fixture'lar geçmeye devam eder.

## Task 8 (P0-8): Good-fixture uçtan uca kapı [BACK-004/fixtürler]

- Her good fixture: compile→lint→freeze→verify→plan→dry-check TAM geçiş
  testi (tek gate testi olarak); dry çıktısında unparseable yok.
- `fixtures/good/pet-clinic` "exit code 0, all cases pass" → geçerli gramer.
- `eval/prompts.ts` beklenti gramerini öğretir; mock üretim akışının çıktısı
  kapıdan geçer.
- Kabul: tüm fixture'lar kapıda yeşil; smoke + scoped üçlü yeşil.

## Task 9 (P1-1): MCP yürütme rızası yeniden tasarımı [SEC-002]

- Varsayılan MCP yüzeyinden shell yürütme KALKAR: `yes:true` aracı parametresi
  kaldırılır; yürütme yalnız server-start opt-in (örn. `LCO_MCP_ALLOW_EXEC=1`)
  + istemci önizleme-hash onayı ile; frozen+verified+lint-clean şartı;
  env scrub; workspace sınırlaması (tam izolasyon P2-2'de).
- Kabul (önce RED): default sunucuda `lco_check` yürütme reddi; opt-in'de
  dahi draft/unverified spec yürütme reddi; prompt-injection senaryosu testi;
  stdout saflığı korunur.

## Task 10 (P1-2): MCP init/generate/change araçları [PROD-004]

- 7→10 araç: `lco_init` (no-clobber), `lco_generate` (ücretli çağrı explicit
  client consent + mock önce), `lco_change` (aynı atomik depolama + lint gate).
- Tümü saf komut-çekirdeklerini çağırır (CLI/MCP paylaşımı korunur); stdout
  saflığı; mutasyonlar per-root serileştirilir (P0-6 modülü).
- Kabul: MCP-only akış intent→draft→frozen→change uçtan uca mock'la; ücretli
  generate onsuz koşamaz.

## Task 11 (P1-3): Dürüst maliyet zarfı + bütçeler [UX-001, UX-003, UX-004]

- Gerçek min/max zarf dokümanı (council ≤6 tamamlama × ≤4 HTTP; single ≤3 × ≤4;
  timeout/backoff); global istek/token/zaman bütçesi + bütçe aşımında iptal;
  attempt vs completion ayrımı kullanımda ve özetlerde.
- UX-003: usage eksikse `unknown` göster (0 DEĞİL); G4 cost koşulu unknown'ı
  geçemez.
- UX-004: inline intent normalize + nonblank + sınırlı uzunluk preflight.
- Ruling (orkestratör): varsayılan profil `single` olur (denetim önerisi;
  council `--profile council` explicit) — README + doküman eşleşir.

## Task 12 (P1-4): Niyet-doğruluk değerlendirmesi [PROD-003]

- Her eval görevi için deterministik niyet iddiaları (adlandırılmış kısıtlar
  zorunlu, yasak icatlar); yapısal-only puanlama kaldırılır/etiketlenir;
  tekrarlı koşum + belirsizlik raporu; tam usage şartı; adversarial
  monotonic-block testleri. G4 live raporu yeniden (yalnız kullanıcı env'iyle).

## Task 13 (P1-5): Sürüm/CI kapıları [TEST-002, OPS-002]

- Build dist'i temizler; üretilmiş JSON-Schema bayt-bayt karşılaştırma testi;
  CI'da generate + fail-on-git-diff; packed-install smoke CI adımı; Node
  22+24 matrisi (uzak CI zaten var — genişlet); scoped status adı netleşir;
  badge doğruluğu. NOT: repo halihazırda push edilmiş ve `ci` bir kez yeşil
  koşmuş (2026-08-26) — OPS-002'nin kalan yarısı budur.
- U3 kapısı: faz merge'leri sonrası kullanıcı push onayı → uzak Node 22/24
  kanıtı kayda geçer.

## Task 14 (P1-6): Legacy arşivleme [ARCH-001]

- Root package.json scripts'inden legacy hedefleri kaldır (root yalnız spec-core
  scoped komutları); apps/* + packages/shared-* ARCHIVED etiketi (README +
  dizin-başı not; dizinler yerinde kalır — geçmiş referans bozulmaz);
  indexer/discovery/shared için go/no-go salvaj listesi belgesi.
- Ruling: dizin taşıma YOK (blasto yarıçapı), çalıştırılabilirlik KESİLİR.

## Task 15 (P2-1): Yol/gizli güvenliği [SEC-003, SEC-004]

- MCP allowed-root politikası + realpath containment; yazım hedeflerinde
  symlink reddi (no-follow/exclusive); evidence dosyaları 0600 + run-addressed
  immutable (sonraki koşum öncekini EZMEZ); bilinen gizli desen redaksiyonu;
  retention/commit rehberi.

## Task 16 (P2-2): Yürütme izolasyonu [SEC-005]

- Check süreçleri izole process group'ta; kill-the-tree timeout; stdin kapat;
  resource ceilings; cleanup grace; descendant-yaşama testi (çapraz platform notu).

## Task 17 (P2-3): MCP dayanıklılık + protokol [OPS-001, SEC-006]

- Frame limit; in-flight sınır; mutasyon serileştirme; stdout backpressure
  (drain); EPIPE'de graceful shutdown (aktif iş takibi); tam JSON-RPC 2.0 zarf
  doğrulaması (jsonrpc:"2.0", ID tipi, notification ayrımı; batch reddi).

## Task 18 (P2-4): Şema sürümleme [PROD-005]

- `lco-spec/1.x` uyumluluk/migrasyon/geri-alma politikası (belge + derleyici
  sürüm alanı doğrulaması); legacy mod DENEYSEL etiketi (CLI generate/init
  p-legacy seçemez durumu belgelenir).

## Task 19 (P2-5): Kök kanıt kararı [DATA-002]

- Ruling varsayılanı: mevcut dürüst sınırlama KORUNUR (accidental-drift
  wording); kök-digest/imza yalnız ticari kanıt iddiası gerekirse. P2 kapanışında
- kullanıcıya sorulur; aksi yönde talep yoksa ACCEPTED-DOC.

## Task 20 (P2-6): Sürüm sahipliği [OPS/release]

- CI-only publish provenance; rollback; changelog; platform/sağlayıcı matrisi;
  local dirty-publish yasağı (prepublishOnly kontrolü).

## Task 21 (P3-1): Ölçek + L12 semantiği [PERF-001, BACK-007]

- 10/100/1000-task benchmark (threshold'lu test); L12 için tanımlı desen dili
  + test edilmiş örtüşme modeli + transitif sıralama semantics; test-file
  dedup iyileştirmesi; şemalara input ceilings.

## Task 22 (P3-2): `lco doctor`

- Runtime/provider/yazma/bin/şema kontrolleri; gizli değer YAZMAZ.

## Task 23 (P3-3): Yapı bakımı

- CLI parse/usage ayrımı; eval report/rendering ayrımı; lint rule tipi
  engine'den çıkar. Davranış değişikliği YOK (saf refactor, testler aynı).

## Task 24 (P3-4): Test derinliği [TEST-003]

- Coverage threshold; kalan property/fault senaryoları (mid-write fault,
  symlink, EPIPE, descendant cleanup, monotonic-block) — P0–P2'de eklenen
  sınır testlerinin üzerini doldurur.

## Task 25 (P3-5): Doküman doğrulama [OPS-003, DATA-003]

- maxBuffer: kodda açık sınıflandırma (ERR_CHILD_PROCESS_STDIO_MAXBUFFER ayrı
  sonuç) + README eşleşmesi; usage-unknown dokümanı; gerçek retry/call
  sayıları; trust boundary dokümanı; "tamper" dili yalnız accidental-drift
  kapsamında (DATA-003 dürüst sınırlaması korunur — muhtemel ACCEPTED-DOC).
