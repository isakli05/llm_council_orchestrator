# lco-spec — Spec IR Çekirdeği (Kanıt Kapısı Deneyi)

Bu paket, LLM konsey mimarisinin **kanıt kapısı (evidence gate) deneyinin** çekirdeğidir:
spekülasyonların (intent, sözlük, varsayım, kanıt, gereksinim, karar, sözleşme, görev)
şemayla doğrulandığı, derlendiği, dondurulduğu (freeze + artifact hash), izlenebilirlik
ve lint kurallarıyla susturulamaz hale getirildiği **Spec IR** katmanı — ve bu çekirdeğin
iddialarını ölçen deterministik değerlendirme (eval) altyapısı.

Deneyin sorusu: *"Konsey, tek ajandan ölçülebilir şekilde daha mı doğru — ve maliyeti
kabul edilebilir mi?"* Bu paket o soruya **kanıtla** cevap vermeyi hedefler; tahminle değil.

Çekirdek iki yüzeyden tüketilir: **`lco` CLI** (10 komut: compile, lint, freeze, verify,
change, trace, plan, init, check, generate) ve **`lco-mcp`** stdio sunucusu (7 MCP
aracı) — ikisi de aynı saf komut çekirdeklerini çağırır.

## Kurulum

**npm'den (publish sonrası):**

```sh
npm install lco-spec     # yayınlanınca; bin'ler: lco, lco-mcp
npx lco --help
```

**Kaynaktan (bu monorepo içinde) — derleme/test:**

```sh
# PATH filtresi (CI'nın kullandığı form): isim filtresi paketin adı
# değişirse sessizce hiçbir şeyle eşleşmez; yol filtresi eşleşmeyi garanti eder.
pnpm --filter ./packages/spec-core build   # tsc + JSON Schema dışa aktarımı (generated/spec-schema.json)
pnpm --filter ./packages/spec-core test    # vitest (587 test: şema, derleyici, lint, eval, CLI, check, MCP)
pnpm --filter ./packages/spec-core lint    # tsc --noEmit
```

**Sıra notu (fail-closed):** testler ÖNCE `build` gerektirir — MCP spawn entegrasyon
testi `dist/mcp/server.js`'i gerçek bir süreç olarak ayağa kaldırır; dist yoksa bu test
sessizce atlanmaz, `run pnpm --filter ./packages/spec-core build before test` mesajıyla
**düşer**. CI/yerel akışta sıra: `lint → build → test`.

**Publishing (maintainer):** paket npm'de `lco-spec` adıyla yayımlanır:
`packages/spec-core` içinde `npm login` sonrası `npm publish`. `prepublishOnly`
`pnpm run build && pnpm run test` çağırır — PATH'te pnpm gerektirir. Yayınlama bir
**kullanıcı eylemidir** — bu depodan otomatik publish yapılmaz.

## CLI: `lco`

Derleme sonrası `dist/cli/index.js` çalıştırılabilirdir (paket `bin`'i `lco`). On komut;
dokuzu bir spec dizini (`<dir>/spec/*.json` bölüm dosyaları) alır, `generate` ise o
dizini bir niyet metninden üretir.

Yardım ve sürüm (UX-002): `lco --help` (veya `-h`) genel kullanımı, `lco <komut> --help`
o komutun kendi yardımını stdout'a yazdırır ve **exit 0** verir — yardım, komutun kendi
bağımsız-değişken doğrulamasından ÖNCE gelir (`lco init --help` asla hata vermez).
`lco --version` paketin `package.json` sürümünü çalışma zamanında okur ve yazdırır
(exit 0). Bilinmeyen komut/bayrak davranışı değişmedi: exit 2 + stderr'de usage.

| komut | işlev |
| --- | --- |
| `compile <dir>` | spec/ ağacını derle + şemayla doğrula |
| `lint <dir>` | derle + 10 lint kuralı; kural/ciddiyet/yol/mesaj tablosu |
| `freeze <dir>` | kapı kontrollü dondurma (yalnız `draft` durumundan; lint temiz + sayaç sıfır); `spec/manifest.json`'a artifact hash yazar |
| `verify <dir>` | bölüm hash'lerini yeniden hesapla, manifest ile karşılaştır (drift) |
| `change <dir> <changeset.json>` | FROZEN spec'e changeset uygular: aday revizyonu ÖNCE tamamen doğrular (compile + lint), sonra sürüm+1, state→draft ve değişen bölümleri atomik yazar; lint-geçersiz change → exit 1 ve DİSKE HİÇBİR ŞEY YAZILMAZ |
| `trace <dir>` | izlenebilirlik raporu (bilgilendirici): kenar sayıları, REQ başına task bağları (✓test/✗test), yetim REQ'ler, kapsam |
| `plan <dir> [--json]` | topolojik yürütme planı (deterministik Kahn; aynı seviyede task_id lexicographic); döngü → hata; `--json` makine-okur |
| `init <dir> [--profile p-mini\|p-standard] [--name <ad>]` | ÇALIŞAN minimal EXAMPLE spec iskeleti yazar; `<dir>/spec` varsa reddeder |
| `check <dir> [--task TASK-0001] [--yes] [--timeout-ms 60000]` | TaskContract verification komutlarını önizler/koşar — **varsayılan DRY-RUN** |
| `generate <dir> --intent "<metin>" \| --intent-file <yol> [--variant council\|single] [--profile p-mini\|p-standard]` | doğal-dil niyetini canlı LLM ile derlenebilir `spec/` taslağına çevirir; kanıt kapısı bloklarsa HİÇBİR dosya yazmaz (ayrıntı: aşağıda) |

Çıkış kodları (tüm CLI için tutarlı sözleşme — **0** başarı, **1** içerik/kural
başarısızlığı, **2** kullanım/şema hatası):

| komut | 0 | 1 | 2 |
| --- | --- | --- | --- |
| `compile` | derlendi | — (kullanılmaz) | derleme/şema hatası |
| `lint` | temiz veya yalnız uyarı | lint hatası(lar)ı | derleme hatası |
| `freeze` | donduruldu | kapı başarısız | derleme hatası |
| `verify` | hash'ler eşleşti | drift VEYA state frozen değil | derleme hatası |
| `change` | uygulandı + değişiklik kapısı (lint) temiz | değişiklik kapısı (lint) hataları — **HİÇBİR dosya yazılmaz**, frozen spec aynen kalır, aynı changeset düzeltilip tekrar denenebilir | derleme, bozuk/bilinmeyen-anahtarlı changeset, frozen olmayan spec, yazım/kilit hatası |
| `trace` | rapor çıktı | — (kullanılmaz) | derleme hatası |
| `plan` | sıra üretildi | bağımlılık döngüsü | derleme/kullanım hatası |
| `init` | iskelet yazıldı | — (kullanılmaz) | `<dir>/spec` zaten var (üzerine yazma reddi), IO hatası |
| `check` | tüm PASS veya DRY | en bir FAIL/TIMEOUT/UNPARSEABLE-EXPECT | derleme, bilinmeyen `--task`, bozuk bayrak, kanıt yazım hatası |
| `generate` | `spec/` yazıldı (state draft) | kanıt kapısı bloğu VEYA savunma-lint reddi — HİÇBİR dosya yazılmaz | kullanım hatası (bozuk bayrak, eksik/çakışan `--intent`), eksik `LCO_LLM_*` env, `<dir>/spec` zaten var (üzerine yazma reddi) |

Lint kuralları: **L01–L08, L10, L12** (10 bağlayıcı kural; L09 ve L11 şema katmanında
zorlanır, lint değil). Her kuralın `fixtures/bad/LXX/` altında beklenen hatayı üreten
bir yakalama vektörü vardır.

## Uçtan Uca Tur — Gerçek Koşulmuş

Aşağıdaki tur **gerçekten koşuldu** (2026-08-25, Node v24.14.0; çıktılar kırpılmış,
çıkış kodları olduğu gibi). Repro için: `cd packages/spec-core` ve `pnpm --filter
lco-spec build` yapılmış olmalı; komutlar `node dist/cli/index.js …` ile.

**1) init — çalışan EXAMPLE iskelet** (`p-standard`: NFR OPS-0001 + TASK-0002 + kontrat):

```sh
$ node dist/cli/index.js init /tmp/lco-tour --profile p-standard --name tour-app
initialized /tmp/lco-tour/spec (profile p-standard, tour-app) with 9 section files:
  spec/manifest.json
  spec/intent.json
  spec/glossary.json
  spec/assumptions.json
  spec/evidence.json
  spec/requirements.json
  spec/decisions.json
  spec/contracts.json
  spec/tasks.json
the scaffold is a WORKING EXAMPLE spec: it compiles, lints clean, and freezes as-is — replace every EXAMPLE entry with your own content
# exit 0
```

İskelet boş-placeholder değil: strict şemaların `min(1)`'leri boş iskeleti **geçersiz**
kıldığı için init, derlenip-lintlenip-dondurulabilen gerçek bir minimal spec yazar —
her `EXAMPLE …` dizgesi kendi içeriğinizle değiştirilmek içindir. Tek verification
komutu `node --version` (her ortamda koşar).

**2) compile + lint — zincir kurulumdan temiz:**

```sh
$ node dist/cli/index.js compile /tmp/lco-tour
compiled /tmp/lco-tour/spec (lco-spec/1.0 v1, state: draft, project: tour-app)
  intent        1
  glossary      1
  assumptions   0
  evidence      1
  requirements  2
  decisions     1
  contracts     1
  tasks         2
  test_files    2
# exit 0
$ node dist/cli/index.js lint /tmp/lco-tour
lint OK: 0 errors, 0 warnings (10 rules)
# exit 0
```

**3) freeze + kasıtlı tamper → verify.** Önce yedek alıp donduralım:

```sh
$ cp /tmp/lco-tour/spec/tasks.json /tmp/lco-tour/tasks.json.bak
$ node dist/cli/index.js freeze /tmp/lco-tour
frozen at 2026-08-25T17:04:56.209Z: 8 artifact hashes written to spec/manifest.json
# exit 0
```

Tamper denemesi #1 — bir dizgenin İÇİNE sona boşluk (`"purpose": "Scaffold example"` →
`"Scaffold example "`):

```sh
$ node -e "const fs=require('fs');const p='/tmp/lco-tour/spec/tasks.json';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('\"purpose\": \"Scaffold example\"','\"purpose\": \"Scaffold example \"'))"
$ node dist/cli/index.js verify /tmp/lco-tour
verify OK: sections match manifest.artifact_hashes
# exit 0  ← yakalanMADI (bkz. not)
```

Bu dürüst bir sonuçtur: verify **ham baytları değil, şema-normalize edilmiş bölüm
içeriğini** hash'ler ve trim-refine'lı metin alanlarındaki baş/son boşluklar ayrıştırma
sırasında normalize edilir (Bilinen Sınırlar). Aynı boşluk dizgenin ORTASINA girerse
içerik gerçekten değişir:

```sh
$ command cp -f /tmp/lco-tour/tasks.json.bak /tmp/lco-tour/spec/tasks.json   # restore
$ node -e "const fs=require('fs');const p='/tmp/lco-tour/spec/tasks.json';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('\"title\": \"EXAMPLE task — replace with your own\"','\"title\": \"EXAMPLE  task — replace with your own\"'))"
$ node dist/cli/index.js verify /tmp/lco-tour
verify FAILED: drifted sections: tasks
# exit 1  ← drift yakalandı
```

Drift'li frozen spec'i olduğu gibi yeniden `freeze` etmeye çalışmak **reddedilir**
(tek lifecycle doğrulayıcı, BACK-002): freeze yalnız `draft → frozen` geçişine
izin verir; sürüm yalnızca bir changeset ile ilerler. Böylece elle düzenlenmiş
frozen içerik aynı sürüm altında yeniden sabitleyerek aklanamaz:

```sh
$ node dist/cli/index.js freeze /tmp/lco-tour
freeze FAILED with 1 reason(s):
  lifecycle gate failed: freeze is legal only from 'draft' (transition: freeze — draft -> frozen); current state is 'frozen' — a frozen spec cannot be re-frozen: either restore the drifted sections … or record the edit as a changeset (lco change) …
# exit 1  ← içerik aklanamaz; önce restore ya da lco change
$ command cp -f /tmp/lco-tour/tasks.json.bak /tmp/lco-tour/spec/tasks.json   # restore
$ node dist/cli/index.js verify /tmp/lco-tour
verify OK: sections match manifest.artifact_hashes
# exit 0
```

**4) trace — izlenebilirlik** (bilgilendirici, her state'te):

```sh
$ node dist/cli/index.js trace /tmp/lco-tour
traceability: tour-app — 2 requirement(s), 2 task(s)
edges: req-task 3, task-test 3, dec-task 2, evidence-req 2
REQ-0001: 2 task(s) [TASK-0001 ✓test, TASK-0002 ✓test]
OPS-0001: 1 task(s) [TASK-0002 ✓test]
coverage: 2/2 requirements task-linked; 2/2 test-linked
# exit 0
```

**5) change — changeset ile revizyon** (yalnız FROZEN spec'e; örnek dosya:
[`examples/changeset.example.json`](examples/changeset.example.json)):

```json
{
  "id": "CP-0001",
  "rationale": "Scaffold EXAMPLE başlığı gerçek görev tanımıyla değiştiriliyor: …",
  "modified_tasks": [
    { "task_id": "TASK-0001", "patch": { "title": "Kimlik doğrulama katmanı — revize başlık" } }
  ]
}
```

```sh
$ node dist/cli/index.js change /tmp/lco-tour examples/changeset.example.json
changeset CP-0001 applied: spec_version 2 (state draft), 2 task(s), 2 requirement(s); lint OK: 0 errors, 0 warnings
# exit 0
$ node -e "const m=require('/tmp/lco-tour/spec/manifest.json');console.log(JSON.stringify({spec_version:m.spec_version,state:m.state,project:m.project.name},null,2))"
{
  "spec_version": 2,
  "state": "draft",
  "project": "tour-app"
}
```

Manifest artık `spec_version 2`, `state: draft` — yeni sürüm ancak bir sonraki
`freeze` ile yeniden dondurulur. Bu arada `verify` fail-closed'dur: `cmdVerify`
hash karşılaştırmasına gelmeden `notFrozen` üzerinde kısa-devre yapar; taslak hiçbir
durumda verify'den geçemez ve `artifact_hashes`, bir sonraki freeze yeniden
sabitleyene dek herhangi bir drift iddiası taşımaz.

**change sözleşmesi (DATA-001 / BACK-005):** `change` aday revizyonu TÜMÜYLE
hafızada doğrular (compile + lint) ve YALNIZCA temizse diske yazar. Lint-geçersiz
bir changeset exit 1 verir ve **hiçbir dosya yazılmaz** — "kapı başarısız"
her zaman "işlenmedi" anlamına gelir, eski davranış (önce yaz, sonra bildir)
artık yok. Yazım aşaması da atomiktir: her revizyon kök-başına kilit
(`<dir>/.lco-revision.lock`, exclusive-create; 10 sn'den eski kilitler ölü
sayılıp kırılır) altında, geçici dosyalar + rename ile işlenir — `manifest.json`
en son takas edilir (commit noktası) ve herhangi bir yazım hatası tüm süreci
bayt-bayt geri alır. Aynı atomiklik `init`, `generate`, `freeze` ve `check`
kanıt yazımları için de geçerlidir.

**6) plan — topolojik sıra:**

```sh
$ node dist/cli/index.js plan /tmp/lco-tour
plan: tour-app — 2 task(s) in dependency order
1. TASK-0001 [xs] deps: none | verify: node --version (exit 0) | scope: src/**
2. TASK-0002 [xs] deps: TASK-0001 | verify: node --version (exit 0) | scope: src/**
ready-now: TASK-0001
# exit 0
```

**7) check — önce DRY (varsayılan), sonra --yes:**

```sh
$ node dist/cli/index.js check /tmp/lco-tour
DRY RUN — no commands executed; pass --yes to execute
check: tour-app — 2 verification command(s)
TASK	COMMAND	EXPECT	EXPECTED→ACTUAL	STATUS
TASK-0001	node --version	exit 0	0 → -	DRY
TASK-0002	node --version	exit 0	0 → -	DRY
summary: 0 pass, 0 fail, 2 dry
(0 timeout, 0 unparseable-expect)
# exit 0

$ node dist/cli/index.js check /tmp/lco-tour --yes
check: tour-app — 2 verification command(s)
TASK	COMMAND	EXPECT	EXPECTED→ACTUAL	STATUS
TASK-0001	node --version	exit 0	0 → 0	PASS
TASK-0002	node --version	exit 0	0 → 0	PASS
summary: 2 pass, 0 fail, 0 dry
(0 timeout, 0 unparseable-expect)
evidence: /tmp/lco-tour/spec/evidence/TASK-0001-check.json, /tmp/lco-tour/spec/evidence/TASK-0002-check.json
# exit 0
```

Kanıt dosyası (görev başına biri; `--yes` altında yazılır):

```sh
$ cat /tmp/lco-tour/spec/evidence/TASK-0001-check.json
{
  "task_id": "TASK-0001",
  "checkedAt": "2026-08-25T17:04:56.607Z",
  "checks": [
    {
      "command": "node --version",
      "expect": "exit 0",
      "expectedExit": 0,
      "actualExit": 0,
      "status": "PASS",
      "durationMs": 7,
      "outputTail": "v24.14.0\n"
    }
  ]
}
```

## `lco check` Güvenlik Modeli

`check`, spec'in KENDİ komutlarını (TaskContract `verification`) yürüten tek komuttur;
modeli bağlayıcıdır:

- **Varsayılan DRY-RUN.** `--yes` yoksa HİÇBİR komut koşulmaz: her satırın durumu
  `DRY`, çıkış 0, diske hiçbir şey yazılmaz (`spec/evidence/` dizini bile oluşmaz).
  Tablo, `--yes` altında neyin koşacağının önizlemesidir.
- **`--yes` açık onaydır.** Komutlar yalnız operatörün açık bayrağıyla yürütülür:
  cwd spec köküdür, komut başına `--timeout-ms` (varsayılan 60000 ms) sonunda süreç
  öldürülür.
- **Fail-closed yargı.** Beklenen çıkış kodu, `expect` açıklamasındaki İLK `exit N`
  eşleşmesidir. `exit N` bulunamayan expect → `UNPARSEABLE-EXPECT`: komut **hiç
  koşulmaz** ve başarısız sayılır (çıkış 1). Yargılanamayan bir şeyi koşmak başarı
  tiyatrosu olurdu.
- **Kanıt dosyaları.** `--yes` altında görev başına `spec/evidence/<TASK-ID>-check.json`
  yazılır: `{task_id, checkedAt, checks:[…]}` — her komut için
  command/expect/expectedExit/actualExit/status/durationMs/outputTail (birleşik
  stdout+stderr'nin son 500 karakteri). Atlanan (`UNPARSEABLE-EXPECT`) girdiler de
  kayda girer: dosya `--yes`'in ne yaptığının **ve** neyi atladığının denetim izidir.

Operasyonel notlar:

- **1 MB maxBuffer taşması TIMEOUT sayılır.** Üretim yürütücüsü `child_process.exec`
  kullanır (Node varsayılanı maxBuffer 1 MB); sınırı aşan çıktı süreci öldürür ve
  sonuç `TIMEOUT` ile yargılanır — fail-closed: geveze bir komut asla PASS olamaz.
- **Sinyalle öldürme → TIMEOUT.** `killed`/`signal` ile biten bir sürece çıkış kodu
  atanmaz (`exit: null`, `TIMEOUT`): öldürülmüş süreç, yargılanmış bir çıkış koduyla
  karıştırılamaz.
- **Torun süreçler zaman aşımından sonra hayatta kalabilir.** Node yalnız doğrudan
  çocuğu (kabuğu) öldürür; komutunuzun sahnelediği arka süreçler yetim kalabilir —
  doğrulama komutlarını kendi temizliğini yapacak şekilde yazın.
- Komutlar kasıtlı olarak kabukta koşar (TaskContract verification komutları kabuk
  dizgeleridir: `pnpm vitest run tests/x.test.ts`). Enjeksiyon yüzeyi tam olarak bu
  güvenlik modelinin yönettiği yüzeydir: varsayılan hiç-koşma + açık `--yes` onayı.

## `generate` — Niyetten Spec'e

`generate`, eval boru hattını ürünleştirir: tek bir doğal-dil niyet metnini canlı bir
LLM ile derlenip-lintlenebilir bir `spec/` taslağına çevirir. İçerik kapısı baskısı
yoktur — **kanıt kapısı** (evidence gate) spec üretir ya da gerekçeleriyle reddeder;
komut bir reddin etrafına asla içerik uydurmaz.

```sh
lco generate <dir> --intent "<metin>" | --intent-file <path> \
  [--variant council|single] [--profile p-mini|p-standard]
```

- **Varsayılanlar:** `--variant council`, `--profile p-standard`. **Maliyet notu:**
  council = **3 LLM çağrısı** (sınıflandırıcı + önerici + yargıç), single = 1 çağrı —
  council yaklaşık 3× token maliyeti.
- **Env sözleşmesi (fail-closed):** `LCO_LLM_BASE_URL`, `LCO_LLM_API_KEY` ve
  `LCO_LLM_MODEL` kullanıcı tarafından açıkça sağlanmalıdır; biri eksikse komut yarım
  yapılandırmayla devam etmez, exit 2 verir. İsteğe bağlı: `LCO_LLM_MAX_TOKENS`
  (pozitif tamsayı; üretimi sınırlar) ve `LCO_LLM_EXTRA_BODY` (JSON nesnesi; istek
  gövdesine en son birleştirilir — ör. `'{"thinking":{"type":"disabled"}}'` gizli
  reasoning'i atlar).
- **Para-yakma sırası:** tüm kullanım/çevre/doğrulama kontrolleri ilk LLM çağrısından
  ÖNCE koşar — bayrak çözümlemesi (`--intent`/`--intent-file` karşılıklı dışlar,
  bozuk bayrak), `--intent-file` okuma/boş-dosya denetimi, no-clobber (`<dir>/spec`
  varsa exit 2) ve env denetimi sırasıyla. Yanlış çağrı hiç ücret ödemez.
- **Fail-closed yargı:** kanıt kapısı niyeti bloklarsa (belirsiz/çelişkili) exit 1 +
  gerekçe listesi, **HİÇBİR dosya yazılmaz**. Üretilen bundle ayrıca savunma-lint
  yeniden denetiminden geçer; kirli bundle da yazılmaz (yine exit 1, hiçbir şey
  yazılmaz).
- **Monotonik blok kanıtı (BACK-001):** council sınıflandırıcısı
  `must_be_blocked=true` döndürürse sonuç KESİN olarak blocked'dır — sonraki
  (temiz) bir bundle bu kanıtı iptal edemez; kanıt kapıdaki kodda taşınır,
  prompt tavsiyesi değil. Doğrulama-informed retry'ler de UNRESOLVED madde
  düşüremez: retry çıktısı önceki unresolved kimliklerden (claim_id) veya
  sayaçlarından herhangi birini sessizce bırakırsa sonuç
  `RESOLUTION_MISSING` ile reddedilir (kimlikler gerekçede isimlendirilir);
  madde eklemek veya korumak serbesttir.
- **Council bacağının degradasyonu (BACK-008):** bağımsız öneri A iki denemede
  de şema doğrulamasını geçemezse bacak DEGRADED işaretlenir, doğrulanmamış
  metin yargıca verilmez (yargıç kendi önerisiyle tek başına üretir) ve özet
  satırı bunu açıkça yazar — nihai bundle yine tam kapıdan geçer, yazılır.
- **Başarı:** `spec/` bölüm dosyaları yazılır (`state: draft`) ve çıktı sıradaki
  adımı önerir: `run lco lint/lco freeze next`.

## `lco-mcp`: MCP Sunucusu

`lco-mcp` (bin: `dist/mcp/server.js`), motoru Model Context Protocol istemcilerine
açan minimal bir stdio sunucusudur: satır-ayrılmış JSON-RPC 2.0. CLI komutlarının saf
çekirdeklerini (yazdırma yapmayan, yapılandırılmış sonuç döndüren) yeniden kullanır —
davranış CLI ile birebir aynıdır. 7 araç:

| araç | girdi | işlev |
| --- | --- | --- |
| `lco_compile` | `{dir}` | derle + şema doğrula |
| `lco_lint` | `{dir}` | derle + lint tablosu (hata varsa `isError`) |
| `lco_freeze` | `{dir}` | kapı kontrollü dondurma |
| `lco_verify` | `{dir}` | drift doğrulaması |
| `lco_trace` | `{dir}` | izlenebilirlik raporu |
| `lco_plan` | `{dir, json?}` | topolojik plan (`--json` eşleniği) |
| `lco_check` | `{dir, task?, yes?}` | verification önizleme/koşma — `yes` verilmedikçe DRY |

Claude Code'a kaydetmek için (mutlak yol ile):

```sh
claude mcp add lco -- node /abs/yol/packages/spec-core/dist/mcp/server.js
```

JSON yapılandırma alternatifi (ör. `.mcp.json` veya kendi istemciniz):

```json
{
  "mcpServers": {
    "lco": { "command": "node", "args": ["/abs/yol/packages/spec-core/dist/mcp/server.js"] }
  }
}
```

Notlar:

- **Önce derleyin:** sunucu `dist/`den koşar — `pnpm --filter lco-spec build`
  (yukarıdaki test-sırası notuyla aynı gerekçe).
- **stdout yalnız JSON-RPC** (bağlayıcı): stdout'a yalnız yanıt satırları yazılır; her
  tanılama stderr'e gider. Eski `mcp_bridge` hatasının (protokol akışına log karışması)
  tekrarı yasaktır ve test-enforcelıdır: entegrasyon testi spawn edilen sürecin
  stdout'undaki **her satırı** `JSON.parse` ile doğrular.
- **`lco_check` aracı `yes` verilmedikçe komut koşmaz** (DRY) — MCP üzerinden yanlışlıkla
  yürütme yok.
- El smoke'u (gerçek stdio): `initialize` → `serverInfo {name: "lco-mcp", version:
  "0.1.0"}`, `protocolVersion 2025-06-18`; `tools/list` → yukarıdaki 7 araç;
  `tools/call lco_check {dir}` → `isError: false`, ilk satır `DRY RUN — no commands
  executed; pass --yes to execute`. Bildirimler (`notifications/*`) yanıt almaz;
  bozuk satır `-32700` (id `null`); bilinmeyen araç `-32602`; bilinmeyen metod `-32601`.

## Strictness Politikası

Bilinmeyen anahtar **her yerde reddedilir**, sessizce silinmez:

- SpecBundle'ın tüm zod object yüzeyleri `.strict()` (bundle kökü, manifest, task,
  refs, verification öğesi, karar alternatifleri…); metin alanları `trim().min(1)` —
  boşluk-dize geçmez.
- Changeset zarfı `ChangeSetSchema.strict()`: typo bir üst-düzey anahtar
  (`modified_taskz`) fail-closed hatadır — sessiz no-op sürüm sıçraması değil.
- Task patch `TaskContractSchema.partial().strict()`: typo yama anahtarı (`titel`)
  reddedilir; MERGE sonrası tam şema yeniden doğrulanır.
- MCP araç argümanlarında bilinmeyen anahtar → `-32602`.
- TS zod zinciri ile dışa aktarılan `generated/spec-schema.json`
  (`additionalProperties: false`) hizalıdır. (Bu paketin eski sürümündeki "zod siler /
  JSON Şema reddeder" yüzey farkı, tamamlama planının şema-sıkılaştırma göreviyle
  kapatıldı.)

## Kanıt Kapısı: G1–G4

Kapı, `packages/spec-core` iddialarını dört ölçütle sınar. **G1–G3 deterministiktir**
(saat yok, rastgelelik yok, ortam okuma yok); **G4 yalnızca live koşuda anlamlıdır**:

| ölçüt | tanım | eşik |
| --- | --- | --- |
| **G1** | Kötü-fixture yakalama oranı: 12 L-vektör dizisi + `schema-invalid` + `drift` + `unresolved`, her biri beklenen katmanda (lint / şema / freeze / verify) reddedilmeli | **15/15** |
| **G2** | Bölüm-içeriği drift saptama: 8 içerik bölümünün (intent…tasks) ve varsa `legacy`'nin özeti `verifyFrozen` ile yeniden hesaplanıp `manifest.artifact_hashes` ile karşılaştırılır | **doğru** |
| **G3** | Belirsiz/çelişkili görevler: 8 `must_be_blocked` eval görevi her koşuda bloklanmış çıkmalı | **8/8** |
| **G4** | Konsey › tek ajan: konsey toplam onaylaması tek ajandan **kesin büyük** VE konsey token maliyeti tek ajanın **≤ 3 katı** | yalnız live |

Karar verme: G1–G3 sağlanırsa mock koşu **`PASS_DETERMINISTIC_ONLY`** verir (mock kanıtı
G4'ü temellendiremez — bu bilinçli bir dürüstlük sınırdır). Live koşuda G1–G3 **ve** G4
sağlanırsa **`PASS`**, aksi halde **`FAIL`**.

**G2 kapsam notu (abartısız garanti):** G2'nin kapsamı *bölüm içeriği* drift tespitidir —
"dondurulmuş bundle'daki herhangi bir değişiklik yakalanır" **değildir**. Yalnızca 8 içerik
bölümü (intent, glossary, assumptions, evidence, requirements, decisions, contracts, tasks)
ve varsa `legacy` hash'lenir; manifest alanları (hash'ler manifest'e yazıldığı için) ve
türetilmiş `test_files` defteri **tasarımsal olarak kapsam dışıdır**. `verifyFrozen` yalnızca
`manifest.state === 'frozen'` hedefler; dondurulmamış bundle `notFrozen: true` ile reddedilir.
Bu bir **kazara-drift dedektörüdür, kurcalama (tamper) kanıtı değildir** — hash'lerin kendisi
dahil tüm dosyayı yeniden yazabilen bir saldırgan bu mekanizmayla yakalanamaz.

## Kapıyı Çalıştırmak: `run-eval`

```sh
# mock: 20 görev × {tek ajan, konsey} = 40 koşu + fixture yakalama; hiç env/anahtar okunmaz
node packages/spec-core/dist/eval/run-eval.js --variant mock

# rapor hedefini değiştirmek için
node packages/spec-core/dist/eval/run-eval.js --variant mock --report /abs/yol/rapor.md
```

Rapor varsayılan olarak depo kökündeki `audit-output/spec-core-gate-report.md`'ye yazılır
(denetim izi). Çıkış kodları: **0** = PASS / PASS_DETERMINISTIC_ONLY, **1** = FAIL,
**2** = kullanım veya yapılandırma hatası.

### mock vs live

- **mock** (`--variant mock`): LLM çağrıları deterministik scripted adapter'a gider.
  Ortam değişkeni ve API anahtarı **hiç okunmaz**; rapor bayt-bayt tekrar üretilebilir.
- **live** (`--variant live`): OpenAI-uyumlu gerçek uç nokta. Üç env değişkeni
  **kullanıcı tarafından** açıkça sağlanmalıdır; biri eksikse betik yarım yapılandırılmayla
  devam etmez, açık mesajla **exit 2** verir:

  ```sh
  LCO_LLM_BASE_URL=... LCO_LLM_API_KEY=... LCO_LLM_MODEL=... \
    node packages/spec-core/dist/eval/run-eval.js --variant live
  ```

## Dürüst Durum Bildirimi

- **Yüzey tamamlandı:** CLI 10 komut (compile, lint, freeze, verify, change, trace,
  plan, init, check, generate) + `lco-mcp` stdio sunucusu (7 araç). Her komut çekirdeği
  safdır: yazdırma yok, `process.exit` yok; saat yalnız CLI/MCP sınırında okunup
  çekirdeklere `nowIso` olarak enjekte edilir.
- **Deterministik kapı geçiyor**: G1 15/15, G2 doğru, G3 8/8 →
  karar `PASS_DETERMINISTIC_ONLY` (bkz. `audit-output/spec-core-gate-report.md`).
- **Live G4 kanıtı ölçüldü** (`audit-output/g4-live-report.md`): konsey onaylaması
  **36 > 26** tek ajan; konsey token maliyeti tek ajanın **2.13 katı** (≤ 3× eşiği)
  → kapı **PASS**. Şu dürüst uyarılar geçerliliğini korur (kanıt zinciriyle birlikte
  e4f4a00 commit mesajında kayıtlı — raporun kendisi yalnız ham tablo + VERDICT
  içerir): tek koşu (sign-test p≈0.23, etki ~2×), p-standard ET-07..10'nun her iki
  varyantça da çözülmemiş olması. Mock koşudan G4 çıkarımı yapılmaz ilkesi değişmez.

## Bilinen Sınırlar (dürüstlük)

- **`acceptance_refs` artık gerçek çözünürlük ister (BACK-003 kapatıldı):**
  `requirements[].acceptance_refs` (TST-* test referansları) `tasks[].tests[].id`
  kümesine karşı kapanış denetlenir (**L13_BROKEN_REFERENCE**); referans verilmeyen
  test `id`'si isteğe bağlı kalır, ancak bir acceptance_ref ancak bir test `id`'sine
  çözünür. Test `id`'leri paket genelinde tekil olmalıdır.
- **task_id tekilliği compile'a taşındı (BACK-006 kapatıldı):** mükerrer `task_id`
  artık derleme hatasıdır (yapılandırılmış hata, exit 2) — `plan --json`'un id
  anahtarlı haritası ve `check --task` seçimi asla görev kaybedemez. `plan` ve
  `check` ayrıca adlandırılmış doğrulama seviyesi olarak **lint-clean** ister
  (kapanış + yargılanabilir `expect` dahil; `trace` bilinçli olarak compile
  seviyesinde kalır — onarım görünümüdür).
- **Eval zincirinde şema-seviyesi doğrulama:** önerilen bundle her aşamada
  `SpecBundleSchema` (strict) ile doğrulanır — öneri A'nın retry çıktısı dahil
  (BACK-008; iki kez geçersizse bacak DEGRADED). Yalnızca sınıflandırıcı çıktısı
  (`ClassifierOutputSchema` — strict DEĞİLDİR; ürün şeması değildir, bilinçli
  kapsam dışı) gevşek kalır; sınıflandırıcının `must_be_blocked=true` hükmü
  kodda monotonik olarak uygulanır (BACK-001), prompt'a emanet edilmez.
- **verify ham bayt değil, şema-normalize edilmiş bölüm içeriğini hash'ler:** hash,
  ayrıştırılmış bölümün kanonik JSON'udur — ham dosya biçimlendirmesi (girinti, anahtar
  sırası) ve trim-refine'lı metin alanlarının baş/son boşluk değişiklikleri drift
  üretmez (turdaki tamper denemesi #1'in exit 0 çıkması tam olarak budur). Kasıtlı
  tasarım: bölüm-içeriği drift dedektörü, tamper kanıtı değildir (G2 kapsam notu).
- **L03'ün etkin kapsamı:** `test_files` defteri `compile` sırasında görevlerden
  *türetilir*, dolayısıyla derlemeden gelen bundle'lar L03'ü asla tetikleyemez. Kural,
  modelin kendi test defterini yankılamak zorunda olduğu **doğrudan ayrıştırma / LLM
  yolunu** korur (runner, LLM çıktısını `compile` olmadan `SpecBundleSchema` ile
  ayrıştırır): `tasks[].tests[].file` ile `test_files` tutarsızsa orada yakalanır.

## Değişiklik Günlüğü

- **2026-08-19 — bu dal:** strictness, change/trace/init/plan/check, `lco-mcp`,
  dokümantasyon — 552 test.
- **2026-08-18 — evidence-gate dalı:** şemalar → eval → kapı; mock
  `PASS_DETERMINISTIC_ONLY` + canlı G4 PASS.

## Ayrıca Bakınız

- Tamamlama planı: [`plans/2026-08-19-spec-core-completion.md`](../../plans/2026-08-19-spec-core-completion.md)
- Deney planı: [`plans/2026-08-18-spec-core-evidence-gate.md`](../../plans/2026-08-18-spec-core-evidence-gate.md)
- Kanıt raporu (denetim izi): [`audit-output/spec-core-gate-report.md`](../../audit-output/spec-core-gate-report.md)
- Live G4 raporu: [`audit-output/g4-live-report.md`](../../audit-output/g4-live-report.md)
- Örnek changeset: [`examples/changeset.example.json`](examples/changeset.example.json)
- Dışa aktarılan JSON Şema: `generated/spec-schema.json`
