# lco-spec — Spec IR Çekirdeği (Kanıt Kapısı Deneyi)

Bu paket, LLM konsey mimarisinin **kanıt kapısı (evidence gate) deneyinin** çekirdeğidir:
spekülasyonların (intent, sözlük, varsayım, kanıt, gereksinim, karar, sözleşme, görev)
şemayla doğrulandığı, derlendiği, dondurulduğu (freeze + artifact hash), izlenebilirlik
ve lint kurallarıyla susturulamaz hale getirildiği **Spec IR** katmanı — ve bu çekirdeğin
iddialarını ölçen deterministik değerlendirme (eval) altyapısı.

Deneyin sorusu: *"Konsey, tek ajandan ölçülebilir şekilde daha mı doğru — ve maliyeti
kabul edilebilir mi?"* Bu paket o soruya **kanıtla** cevap vermeyi hedefler; tahminle değil.

Çekirdek iki yüzeyden tüketilir: **`lco` CLI** (10 komut: compile, lint, freeze, verify,
change, trace, plan, init, check, generate) ve **`lco-mcp`** stdio sunucusu (10 MCP
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
pnpm --filter ./packages/spec-core build   # dist'i temizler + tsc + JSON Schema dışa aktarımı (generated/spec-schema.json)
pnpm --filter ./packages/spec-core test    # vitest (936 test: şema, derleyici, lint, eval, CLI, check, MCP, bütçe)
pnpm --filter ./packages/spec-core lint    # tsc --noEmit
pnpm --filter ./packages/spec-core smoke:packed  # pack -> temiz kurulum -> lco init -> lco-mcp handshake
```

**Sıra notu (fail-closed):** testler ÖNCE `build` gerektirir — MCP spawn entegrasyon
testi `dist/mcp/server.js`'i gerçek bir süreç olarak ayağa kaldırır; dist yoksa bu test
sessizce atlanmaz, `run pnpm --filter ./packages/spec-core build before test` mesajıyla
**düşer**. CI/yerel akışta sıra: `lint → build → test`. `build` dist'i **önce siler**
(TEST-002): silinmiş bir modülün bayat `dist/` kopyası pack'lenip yayımlanamaz.

**Tazelik kapısı (TEST-002):** `generated/spec-schema.json` kaynak şemadan
**bayt-bayt** yeniden üretilip karşılaştırılır (test + CI fail-on-diff); bayat
artefakt testi ve CI'ı düşürür. Yeniden üretim: `pnpm --filter ./packages/spec-core build`
sonra `git add packages/spec-core/generated && git commit`.

**Publishing (maintainer):** paket npm'de `lco-spec` adıyla yayımlanır:
`packages/spec-core` içinde `npm login` sonrası `npm publish`. `prepublishOnly`
`pnpm run test` çağırır; `pretest` temizleyip derler (tek build, çift derleme yok) —
PATH'te pnpm gerektirir. Yayınlama bir
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
| `generate <dir> --intent "<metin>" \| --intent-file <yol> [--variant single\|council] [--profile p-mini\|p-standard] [--max-attempts N] [--max-tokens N] [--max-wall-ms N]` | doğal-dil niyetini canlı LLM ile derlenebilir `spec/` taslağına çevirir; kanıt kapısı bloklarsa HİÇBİR dosya yazmaz (ayrıntı: aşağıda) |

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
| `plan` | sıra üretildi | bağımlılık döngüsü | derleme/kullanım hatası VEYA lint reddi (BACK-006: plan lint-clean bundle ister) |
| `init` | iskelet yazıldı | — (kullanılmaz) | `<dir>/spec` zaten var (üzerine yazma reddi), IO hatası |
| `check` | tüm PASS veya DRY | en bir FAIL/TIMEOUT/UNPARSEABLE-EXPECT | derleme VEYA lint reddi (BACK-006: check lint-clean bundle ister), bilinmeyen `--task`, bozuk bayrak, kanıt yazım hatası |
| `generate` | `spec/` yazıldı (state draft) | kanıt kapısı bloğu VEYA savunma-lint reddi — HİÇBİR dosya yazılmaz | kullanım hatası (bozuk bayrak, eksik/çakışan/boş/aşırı-uzun `--intent`), eksik `LCO_LLM_*` env, `<dir>/spec` zaten var (üzerine yazma reddi), `BUDGET_EXCEEDED` (koşu bütçesi aşıldı — hiçbir şey yazılmaz) |

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
evidence: /tmp/lco-tour/spec/evidence/TASK-0001-check-20260825T170456Z-001.json, /tmp/lco-tour/spec/evidence/TASK-0002-check-20260825T170456Z-001.json
# exit 0
```

Kanıt dosyası (koşum başına YENİ bir dosya; `--yes` altında yazılır — SEC-004):

```sh
$ cat /tmp/lco-tour/spec/evidence/TASK-0001-check-20260825T170456Z-001.json
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
- **Kanıt dosyaları (SEC-004 ile sertleştirildi).** `--yes` altında görev başına,
  KOŞUM başına YENİ bir dosya yazılır: `spec/evidence/<TASK-ID>-check-<RUN>.json`
  (`{task_id, checkedAt, checks:[…]}` — her komut için
  command/expect/expectedExit/actualExit/status/durationMs/outputTail; birleşik
  stdout+stderr'nin son 500 karakteri). Atlanan (`UNPARSEABLE-EXPECT`) girdiler de
  kayda girer: dosya `--yes`'in ne yaptığının **ve** neyi atladığının denetim izidir.
  Sertleştirme:
  - **Run-addressed + immutable:** `<RUN>`, enjekte edilen `nowIso` + task id +
    çarpışma sayacından üretilen deterministik bir koşum kimliğidir. Her koşum
    YENİ bir dosya yazar — sonraki bir koşum öncekinin izini ASLA ezmez (geç bir
    PASS, erken bir FAIL'in kaydını silemez).
  - **Mod 0600:** kanıt dosyaları yalnız sahibince okunur (çıktı kuyrukları sır
    taşıyabilir — aşağıdaki redaksiyon notuna bakın).
  - **Redaksiyon (en iyi çaba, garanti DEĞİL):** yakalanan çıktı kalıcı hale
    gelmeden ÖNCE bilinen gizli desenlerden geçer — bearer token'lar, `sk-`/`zai-`
    önekli API anahtarları, `PASSWORD=`/`TOKEN=` tarzı atamalar ve JWT şekilleri
    `[REDACTED:<tür>]` ile değiştirilir. Eşleştirme kasıtlı olarak muhafazakârdır
    (olağan test çıktısını bozmaz); bu EN İYİ ÇABA'dır, garanti değildir — başka
    şekilde yazılmış bir sır değiştirilmeden kalır.
  - **Retention/commit önerisi (dürüst):** kanıt dosyaları redaksiyondan sonra
    bile hassas kuyruklar taşıyabilir. Repoya commitlemeden önce gözden geçirin
    ya da `spec/evidence/` için gitignore deseni kullanın:
    `printf 'spec/evidence/\n' >> .gitignore`. Denetim izini repoda tutmak
    istiyorsanız commit öncesi insan incelemesini süreçlerinize ekleyin.
- **Yol güvenliği (SEC-003).** Spec kökü realpath ile çözülür; sabit bölüm
  yolları (`spec/<bölüm>.json`) ve `spec/evidence` dizini çözülen kökün İÇİNDE
  kalmak zorundadır (realpath karşılaştırması; önek-dizgesi karşılaştırması
  değil). Okuma kapısı derleme (compile) sınırındadır: kökün dışına çözülen
  sembolik bağlantılı bir bölüm veya `spec/` dizini derleme hatası olarak
  reddedilir; kökün içinde kalan bağlantılar yasal kalır (meşru reorganizasyon).
  Yazma tarafı daha katıdır: `spec/`, `spec/evidence` veya bir bölüm dosyası
  sembolik bağlantıysa yazma, bağlantıyı ADLANDIRAN yapılandırılmış bir hatayla
  reddedilir — yazılar asla bağlantıyı takip etmez. (POSIX hedeflenir; Windows
  junction davranışı kapsam dışıdır.)

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
  [--variant single|council] [--profile p-mini|p-standard] \
  [--max-attempts N] [--max-tokens N] [--max-wall-ms N]
```

- **Varsayılanlar:** `--variant single`, `--profile p-standard` (varsayılan TEK bir
  yerde seçilir: `commands/generate.ts` içindeki `DEFAULT_GENERATE_VARIANT`; CLI,
  MCP sunucusu ve bu doküman aynı kaynaktan beslenir). Council pahalı yoldur ve
  faydası henüz kanıtlanmadığı için **açık tercihle** çalışır: `--variant council`.
- **Dürüst maliyet zarfı (UX-001):** "3 çağrı" değil, gerçek en-kötü-case zarf —
  **HTTP denemesi (attempt) ≠ tamamlama (completion)**. Doğrulama-informed
  retry'ler tamamlama sayısını, transport retry'ler deneme sayısını büyütür. Her
  tamamlama en fazla 4 HTTP denemesi yapabilir (her deneme 180 s zaman aşımı,
  tükenen denemeler arası toplam 17 s backoff: 2+5+10):

  | variant | tamamlama (iyi → en kötü) | HTTP denemesi (en kötü) | en-kötü duvar süresi |
  | --- | --- | --- | --- |
  | single | 1 → 3 | 3 × 4 = **12** istek | 3 × (4×180 s + 17 s) = 2211 saniye (~36,9 dk) |
  | council | 3 → 6 | 6 × 4 = **24** istek | 6 × (4×180 s + 17 s) = 4422 saniye (~73,7 dk) |

  (Sayılar kod sabitlerinden türetilir — `eval/budget.ts`; `budget.test.ts`
  README'yi bu sabitlere sabitler, doküman kayarsa test düşer.)
- **Koşu bütçesi (UX-001):** toplam HTTP denemesi, toplam token (in+out; sağlayıcı
  usage bildirdiğinde) ve duvar süresi bütçeleri aşılırsa koşu yapılandırılmış
  `BUDGET_EXCEEDED` hatasıyla İPTAL olur (exit 2, HİÇBİR şey yazılmaz — asla sessiz
  kısmi başarı). Varsayılanlar zarftan türetilir: deneme limiti = belgelenmiş en
  kötü case (+0), duvar limiti = en kötü case + 60 s pay; token limiti varsayılan
  yoktur (model/sağlayıcıya göre büyüklük değişir — varsayılan sayı tahmin olur).
  Geçersiz kılma: `--max-attempts` / `--max-tokens` / `--max-wall-ms` bayrakları
  veya `LCO_GENERATE_MAX_ATTEMPTS` / `LCO_GENERATE_MAX_TOKENS` /
  `LCO_GENERATE_MAX_WALL_MS` env değişkenleri (bayrak > env > varsayılan; bozuk
  değer exit 2). İptal temizdir: boru hattı sıkı sıkıya sıralıdır, ödenememiş
  promise bırakmaz; HTTP adaptörü bütçe defterini deneme BAŞINA şarj eder, cap
  dolunca bir sonraki istek hiç gönderilmez.
- **Kullanım muhasebesi (UX-001 + UX-003):** özetler tamamlama ve HTTP denemesini
  ayrı ayrı gösterir (`N LLM call(s) / M HTTP attempt(s)` — zaman aşımına uğrayan
  denemeler dahil). Sağlayıcı usage BİLDİRMEDİĞİNDE token sayıları `unknown`
  görünür — asla `0 in / 0 out` değil; G4 maliyet koşulu da unknown'ı geçmez
  (`0 <= 3×0` kanıt değildir).
- **Env sözleşmesi (fail-closed):** `LCO_LLM_BASE_URL`, `LCO_LLM_API_KEY` ve
  `LCO_LLM_MODEL` kullanıcı tarafından açıkça sağlanmalıdır; biri eksikse komut yarım
  yapılandırmayla devam etmez, exit 2 verir. İsteğe bağlı: `LCO_LLM_MAX_TOKENS`
  (pozitif tamsayı; üretimi sınırlar) ve `LCO_LLM_EXTRA_BODY` (JSON nesnesi; istek
  gövdesine en son birleştirilir — ör. `'{"thinking":{"type":"disabled"}}'` gizli
  reasoning'i atlar).
- **Para-yakma sırası:** tüm kullanım/çevre/doğrulama kontrolleri ilk LLM çağrısından
  ÖNCE koşar — bayrak çözümlemesi (`--intent`/`--intent-file` karşılıklı dışlar,
  bozuk bayrak), **intent preflight (UX-004)**, `--intent-file` okuma/boş-dosya
  denetimi, no-clobber (`<dir>/spec` varsa exit 2) ve env denetimi sırasıyla.
  Yanlış çağrı hiç ücret ödemez.
- **Intent preflight (UX-004):** `--intent` metni normalize edilir (trim) ve
  boşluk-yalnızca olduğunda reddedilir; ayrıca **satır-içi kanal olarak**
  10.000 karakterle sınırlıdır (üstünde: exit 2, mesaj `--intent-file`'a
  yönlendirir). Uzunluk tasarımı kanala göredir: `--intent-file` uzun metin için
  tasarlanmış **kaçış yoludur** — inline 10k sınırı YOK; yalnızca trim + boş-red +
  1.000.000 karakterlik bir **akıl tavanı** (o kadar büyük bir dosya neredeyse kesin
  yanlış-dosya hatasıdır; mesaj tavayı adlandırır). MCP `intent` argümanı da
  satır-içi kanaldır: aynı 10k sınırı argüman katmanında uygulanır (-32602).
  Her red adaptör KURULUMUNDAN önce koşar: boş/aşırı-uzun intent sıfır adaptör
  çağrısı anlamına gelir (testlerle sabitlenmiştir).
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
davranış CLI ile birebir aynıdır. 10 araç:

| araç | girdi | işlev |
| --- | --- | --- |
| `lco_compile` | `{dir}` | derle + şema doğrula |
| `lco_lint` | `{dir}` | derle + lint tablosu (hata varsa `isError`) |
| `lco_freeze` | `{dir}` | kapı kontrollü dondurma |
| `lco_verify` | `{dir}` | drift doğrulaması |
| `lco_trace` | `{dir}` | izlenebilirlik raporu |
| `lco_plan` | `{dir, json?}` | topolojik plan (`--json` eşleniği) |
| `lco_check` | `{dir, task?, consent?}` | verification önizleme (DRY) / rızaya bağlı koşma — bkz. Yürütme Rızası |
| `lco_init` | `{dir, profile?, name?}` | WORKING EXAMPLE spec/ iskeleti (draft/v1) — NO-CLOBBER: `dir/spec` varsa reddeder, diske dokunmaz; `lco init` çekirdeği |
| `lco_generate` | `{dir, intent, variant?, profile?, consent?}` | intent → spec/ taslağı (ÜCRETLİ LLM çağrısı) — bkz. Ücretli Çağrı Rızası; `lco generate` çekirdeği + T4 kapıları |
| `lco_change` | `{dir, changeset}` | changeset (CLI zarfı, satır içi nesne) uygula: önce-tam-aday-doğrula sonra-atomik-yaz; lint-invalid → reddetme, disk bayt-bayt aynı; `lco change` çekirdeği |

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
- **`dir` argümanı her çağrıda realpath ile normalize edilir** (bağlantılı üst
  dizinlerden ulaşlanan bir kök yasaldır ve gerçek yoluna çözülür) ve
  `LCO_MCP_EXEC_ROOT` ayarlıysa çözülen yolun pinin içinde kalması zorunludur
  (SEC-003, izinli-kök politikası — her araca, `lco_generate`'ın yazma hedefine
  kadar; dışarıdaki/red dışındaki `dir` `-32602` ile reddedilir, pinin kendisi
  çözülemiyorsa her çağrı fail-closed reddedilir). Pin AYARLI DEĞİLSE yol
  politikası yoktur: bu, BELGELİ yerel-güven sınırıdır — pinsiz sunucu,
  istemcisine yerel yollarla çalışmayı açıkça emanet eden operatördür. Güvenilir
  olmayan bir istemciye açarken `LCO_MCP_EXEC_ROOT` kullanın.
- **`lco_check` aracı varsayılan olarak SADECE önizleme yapar** (DRY) — `yes` parametresi
  MCP yüzeyinden kaldırıldı (SEC-002); yürütme rızası için aşağıdaki Yürütme Rızası
  bölümüne bakın.
- **`lco_generate` de request'in kendi başına ASLA ücretli çağrı harcamaz** (PROD-004):
  rıza zinciri için aşağıdaki Ücretli Çağrı Rızası bölümüne bakın.
- **Tüm araç şemaları `additionalProperties: false`** ve argüman katmanı fail-closed:
  bilinmeyen anahtar `-32602`; `yes` İSİMLE reddedilir; `allowExec`/`allowGenerate`/`llm`/
  `env` gibi yetenek-şekilli anahtarlar da isimle reddedilir (request kendi yetenisini
  kendi veremez — bunlar operatörün sunucu-sınırı durumudur).
- El smoke'u (gerçek stdio): `initialize` → `serverInfo {name: "lco-mcp", version:
  "0.1.0"}`, `protocolVersion 2025-06-18`; `tools/list` → yukarıdaki 10 araç;
  `tools/call lco_check {dir}` → `isError: false`, ilk satır `DRY RUN — no commands
  executed; pass --yes to execute`. Bildirimler (`notifications/*`) yanıt almaz;
  bozuk satır `-32700` (id `null`); bilinmeyen araç `-32602`; bilinmeyen metod `-32601`.

### Yürütme Rızası: `lco_check` ve `LCO_MCP_ALLOW_EXEC` (SEC-002)

Güven sınırı (trust boundary) modeli: spec metni modelin kontrolündedir ve bir
istem (prompt injection) MCP istemcisini `lco_check`'i yürütme için
kullanmaya bir adım uzaktır. Bu yüzden **MCP üzerinden komut yürütme, insan
rızasının vekili DEĞİLDİR** — dört katman, hepsi birlikte zorunlu:

1. **Server-start opt-in:** yürütme yeteneği yalnız sunucu
   `LCO_MCP_ALLOW_EXEC=1` ile başlatıldığında vardır (tam olarak `1`; başka
   her değer fail-closed). Düz başlatılmış sunucuda hiçbir parametre kombinasyonu
   yürütme sağlayamaz: `yes` argümanı (-32602) reddedilir, `consent` gönderen
   istek actionable bir reddetme (isError, exit 2) alır.
2. **İçerik kalitesi:** spec **frozen + hash-doğrulanmış + lint-clean** olmalıdır
   (`loadBundleAtLevel('lint-clean')` + `verifyFrozen` çekirdekleri). Draft spec,
   freeze sonrası kurcalanmış (drift) içerik veya lint-kirli bundle, neyin
   başarısız olduğunu adlandıran bir reddetmeyle geri çevrilir.
3. **Önizleme-hash'ine bağlı rıza:** yürütme isteği `consent.digest` taşır —
   tam olarak neyin koşacağına ilişkin özet (`sha256(JSON.stringify({spec_version,
   tasks:[{task_id, verification:[{command, expect}]}]}, null, 2))`; DRY yanıt bu
   özeti `consent digest:` satırında ilan eder). Sunucu yürütme anında beklenen
   özeti yeniden hesaplar ve uyuşmazlıkta reddeder: istemci bir içeriği onaylayıp
   başkasını koşturamaz; task filtresi seçimin parçasıdır.
4. **Scrub edilmiş ortam:** yürütülen komutlar sunucunun ortamını DEĞİL, açık bir
   izin listesini miras alır: `PATH`, `HOME`, `LANG`, `LC_ALL`, `TMPDIR` (+
   POSIX'te bulunmayan `SystemRoot`, `PATHEXT`, `ComSpec`). Özellikle
   `LCO_LLM_API_KEY` gibi sunucu sırları, `NODE_OPTIONS` ve `LCO_MCP_*`
   bayrakları çocuk süreçlere ASLA geçmez.

İsteğe bağlı 5. katman: `LCO_MCP_EXEC_ROOT=/abs/yol` çalışma alanını sabitler —
ayarlandığında rıza yalnız o yolun (realpath ile çözülmüş) altına RESOLVE EDEN
spec kökleri için geçerlidir (SEC-003: sözcüksel olarak pin altında görünen ama
sembolik bağlantıyla dışarı kaçan bir yol reddedilir). Aynı pin sunucu sınırında
HER aracın `dir` argümanına da uygulanır (aşağıdaki izinli-kök politikası) —
`lco_generate`'ın yazma hedefi dahil. Bu bir rıza-sınırı sabitlemesidir; süreç
izolasyonu P2-2 kapsamındadır.

**CLI asimetrisi (bilinçli):** `lco check --yes` miras alınan tam ortamla koşar —
orada rızayı veren insan, ortamın da sahibidir. MCP yolunda rızayı veren
operatördür (sunucuyu `LCO_MCP_ALLOW_EXEC=1` ile başlatan) ve modelin koşturduğu
komutlar operatörün sırlarını göremez.

Atipik akış: dry önizleme (draft) → `lco freeze` → aynı digest ile
`consent:{digest}` yürütme — freeze `spec_version`'ı ve task içeriğini
değiştirmediği için digest geçerliliğini korur; frozen+verified kapısı durumu ayrıca
denetler.

### Ücretli Çağrı Rızası: `lco_generate` ve `LCO_MCP_ALLOW_GENERATE` (PROD-004)

Yürütme rızasıyla aynı güven modeli, geri döndürülemez diğer kaynak için: **para**.
Bir MCP isteği (model; prompt injection'a bir adım uzak) kendi başına sunucuyu ücretli
LLM çağrısı harcatamaz. İki katman, ikisi birden zorunlu — biri bile eksikse
**yapılandırılmış reddetme, SIFIR LLM çağrısı** (testler çağrı sayısını 0 olarak sabitler):

1. **Server-start opt-in:** üretim yeteneği yalnız sunucu
   `LCO_MCP_ALLOW_GENERATE=1` ile başlatıldığında vardır (tam olarak `1`; `'true'`,
   `'0'`, boş, unset → fail-closed). Bayrak `LCO_MCP_ALLOW_EXEC`'ten BAĞIMSIZDIR:
   hiçbiri diğerini içermez.
2. **Etkin içeriğe bağlı rıza:** istek `consent.digest` taşır — tam olarak neyin
   LLM'e gideceğinin özeti:

   ```
   sha256(JSON.stringify({ intent, profile, variant }, null, 2))
   ```

   (manifest artifact-hash'leriyle aynı çerçeve). Sunucu digest'i ÇÖZÜLMÜŞ değerler
   üzerinden (varsayılanlar uygulanmış: variant=single, profile=p-standard) isteğin
   işlenme anında yeniden hesaplar; uyuşmazlıkta her iki digest'i adlandıran reddetme.
   `consent` içermeyen istek, reddetmenin kendisi önizlemedir: yanıtta bu isteğin
   digest'i `consent digest:` satırında ilan edilir — actionable retry bir istek
   ötededir. `dir` bilinçli olarak digest'e DAHİL DEĞİLDİR (operatörün rızası ücretli
   çağrının İÇERİĞİNE, yazma hedefine değildir; yazmanın kendi no-clobber + yaşam
   döngüsü kapıları vardır).

**Adapter kuralları (CLI ile aynı):** mock adapter yalnız test/kütüphane çağıranları
için sınırdan enjekte edilir (`HandleRpcOptions.llm`); üretim adapter'ı
`cmdGenerate` İÇİNDE `createHttpLlm()` ile çözülür ve kullanıcı tarafından sağlanan
`LCO_LLM_BASE_URL`/`LCO_LLM_API_KEY`/`LCO_LLM_MODEL` ortam değişkenleri eksikse
fail-closed throw eder — sunucu ASLA anahtar, uç nokta veya model uydurmaz (mock önce,
live yalnız gerçek env'den). Üretim çıktısı CLI ile aynı kapılardan geçer: no-clobber,
kanıt kapısı (blocked → nedenler, hiçbir şey yazılmaz), savunma lint'i, yaşam döngüsı
çıkış kapısı (draft/v1/profile), ve councilDegraded satırı araç yanıtında yüzeye çıkar.

**CLI asimetrisi (bilinçli, Yürütme Rızası ile aynı gerekçe):** `lco generate --intent`
yolunda harcama kararını veren insan, env'in (ve hesabın) da sahibidir. MCP yolunda
harcamayı talep eden modeldir; onayı operatör verir (sunucuyu
`LCO_MCP_ALLOW_GENERATE=1` ile başlatan) ve rıza içeriğe bağlı digest ile sabitlenir.

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
| **G4** | Konsey › tek ajan: **yalnızca niyet-doğruluk-geçen (intent-fidelity) koşular üzerinden** konsey toplam onaylaması tek ajandan **kesin büyük** VE konsey token maliyeti tek ajanın **≤ 3 katı** VE her iki tarafta en az bir doğrun koşu; maliyet yarısı **tüm tekrarların tamamında** usage bilinmesini ister (bilinmeyen ≠ sıfır) | yalnız live |

Karar verme: G1–G3 sağlanırsa mock koşu **`PASS_DETERMINISTIC_ONLY`** verir (mock kanıtı
G4'ü temellendiremez — bu bilinçli bir dürüstlük sınırdır). Live koşuda G1–G3 **ve** G4
sağlanırsa **`PASS`**, aksi halde **`FAIL`**.

**PROD-003 — niyet-doğruluk (intent-fidelity) iddiaları:** her greenfield eval görevi,
niyet metninde **adıyla** geçen somut kısıtları (komutlar, bayraklar, teknolojiler,
biçimler, limitler, durum kodları — `sqlite`, `jwt`, `--sep`, `429`, `09:00` …) taşıyan
bir `MENTIONS_TERMS` iddiası içerir. Üretilen bundle'ın gövde metni (requirements/tasks/
tests/glossary/decision metinleri) bu terimlerin **hepsini** carry etmelidir; bundle'ın
kendi `intent.statement` yankısı **aranmaz** (niyeti geri okumak, onu kodlamak değildir).
**Bilinen sınır (term-dump):** terim iddiaları adlı kısıtların bundle'a **taşındığını**
doğrular, tasarımda **kullanıldıklarını** değil — tek bir cümleyle tüm terimleri listeleyen
anlamsız bir "term-dump" bu iddiayı geçebilir; canlı sadakat için terim başına bir
requirement statement / task instruction'a çözünme gerektiren gelecek sıkılaştırma
gerekir (bu rubrik henüz uygulamaz). Mock'un greenfield intent geçişleri de
`badgeIntentConstraints` ile **üretilmiştir** — model sadakat kanıtı değildir.
Skor iki etikete ayrılır: **yapısal geçiş** (MENTIONS_TERMS dışındaki tüm iddialar) ve
**niyet-doğruluk geçişi** (MENTIONS_TERMS + BLOCKED + doğru bloklama). Yapısal olarak
temiz ama niyete sadık olmayan jenerik bir bundle artık tam puan alamaz — ham fixture'lar
hiçbir görevin terim kümesini karşılamaz (korpus testi bunu sabitler). İcatlar
(intent'in adını anmadığı glossary/kavramlar) **danışma listesidir, kapı değildir**:
başka dilde yazılmış dürüst bir spec kavramları yeniden adlandırabilir, sert kural dürüst
spekleri düşürürdü.

**Tekrarlı koşum + belirsizlik:** `--repeats N`, (görev, varyant) başına N koşum yapar;
rapor görev başına **tekrar-arası geçiş oranı + ortalama/min/max yayılım** tablosu verir.
Mock adapter'lar yapıları gereği deterministirdir (tekrarlar arasında değişemezler);
yayılım sütunları **live** koşum için anlamlıdır. Usage'u bilinmeyen TEK bir koşum,
maliyet karşılaştırmasını tümüyle geçersiz kılar (adı anılarak).

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

# tekrarlı koşum (yukarıdaki belirsizlik tablosu için) + rapor hedefi
node packages/spec-core/dist/eval/run-eval.js --variant mock --repeats 3 --report /abs/yol/rapor.md
```

Rapor varsayılan olarak depo kökündeki `audit-output/spec-core-gate-report.md`'ye yazılır
(denetim izi). Çıkış kodları: **0** = PASS / PASS_DETERMINISTIC_ONLY, **1** = FAIL,
**2** = kullanım veya yapılandırma hatası.

### mock vs live

- **mock** (`--variant mock`): LLM çağrıları deterministik scripted adapter'a gider.
  Ortam değişkeni ve API anahtarı **hiç okunmaz**; rapor bayt-bayt tekrar üretilebilir.
  Mock kanıtın sınırları raporda adıyla yazılıdır: G3 bloklamaları **scripted plumbing**
  'dir (sınıflandırma kalitesi değildir), mock tekrarlar yapıları gereği deterministirdir,
  ve mock kanıt G4'ü temellendiremez.
- **live** (`--variant live`): OpenAI-uyumlu gerçek uç nokta. Üç env değişkeni
  **kullanıcı tarafından** açıkça sağlanmalıdır; biri eksikse betik yarım yapılandırılmayla
  devam etmez, açık mesajla **exit 2** verir:

  ```sh
  LCO_LLM_BASE_URL=... LCO_LLM_API_KEY=... LCO_LLM_MODEL=... \
    node packages/spec-core/dist/eval/run-eval.js --variant live
  ```

### Live G4 yeniden koşum yordamı (kullanıcı çalıştırır; testler asla live çağrı yapmaz)

Eski `audit-output/g4-live-report.md` (2026-08-18) **tek koşumludur ve PROD-003
niyet-doğruluk rubrikinden ÖNCE ölçülmüştür** — "konsey daha doğru" başlığı için artık
kanıt olarak okunmamalıdır. Yeniden ölçüm için:

1. Ortamı hazırla (değerler yalnız senin kabuğunda kalır; betik adları dışında bir şey
   loglamaz):
   `LCO_LLM_BASE_URL=<openai-uyumlu uç> LCO_LLM_API_KEY=<anahtar> LCO_LLM_MODEL=<model>`
2. Paketi derle: `pnpm --filter ./packages/spec-core build`
3. Tekrarlı live koşumu çalıştır (≥ 3 tekrar önerilir — tek koşum belirsizliğini
   göstermek istemezsen bile rapor yayılım sütunlarını dürüstçe doldurur):
   ```sh
   LCO_LLM_BASE_URL=... LCO_LLM_API_KEY=... LCO_LLM_MODEL=... \
     node packages/spec-core/dist/eval/run-eval.js --variant live --repeats 3 \
       --report audit-output/g4-live-report.md
   ```
4. Rapor `audit-output/g4-live-report.md`'ye düşer (denetim izi olarak commit edilir).
   G4 satırı yalnızca niyet-doğruluk-geçen koşuları sayar; usage'u bilinmeyen tek bir
   koşum maliyet karşılaştırmasını adıyla düşürür. Rapor, G4'ün **kurmadığını** da
   yazar: körleme yok, insan doğrulaması yok, sağlayıcılar-arası genellenebilirlik yok.

## Dürüst Durum Bildirimi

- **Yüzey tamamlandı:** CLI 10 komut (compile, lint, freeze, verify, change, trace,
  plan, init, check, generate) + `lco-mcp` stdio sunucusu (10 araç). Her komut çekirdeği
  safdır: yazdırma yok, `process.exit` yok; saat yalnız CLI/MCP sınırında okunup
  çekirdeklere `nowIso` olarak enjekte edilir.
- **Deterministik kapı geçiyor**: G1 15/15, G2 doğru, G3 8/8 →
  karar `PASS_DETERMINISTIC_ONLY` (bkz. `audit-output/spec-core-gate-report.md`).
  Rapor artık **yapısal geçişi (28/40)** ile **niyet-doğruluk geçişini (40/40)** ayrı
  listeler ve mock kanıtın sınırlarını adıyla yazar.
- **Eski live G4 raporu (2026-08-18) historiktir** (`audit-output/g4-live-report.md`):
  o koşum tek tekrarlıydı ve niyet-doğruluk iddiaları İÇERMEZDİ — o sayılara
  (36 > 26, maliyet 2.13×, o zamanki rubrikle PASS) dayanarak "konsey daha doğru"
  iddia edilmez. Yeni rubrikte G4 yalnızca niyet-doğruluk-geçen koşular üzerinden
  hesaplanır, tekrarlı koşum ister ve usage'u bilinmeyen koşumu geçirmez; yeniden
  ölçüm için yukarıdaki **live G4 yeniden koşum yordamı**'nı izleyin (kullanıcı
  env'i ile). Mock koşudan G4 çıkarımı yapılmaz ilkesi değişmez.

## Bilinen Sınırlar (dürüstlük)

- **`acceptance_refs` artık gerçek çözünürlük ister (BACK-003 kapatıldı):**
  `requirements[].acceptance_refs` (TST-* test referansları) `tasks[].tests[].id`
  kümesine karşı kapanış denetlenir (**L13_BROKEN_REFERENCE**); referans verilmeyen
  test `id`'si isteğe bağlı kalır, ancak bir acceptance_ref ancak bir test `id`'sine
  çözünür. Test `id`'leri paket genelinde tekil olmalıdır.
- **Göç notu — `GLS-` öneki requirement id ailesinden çıkarıldı:** requirement
  id'leri artık yalnız `REQ-/OPS-/UX-/ARC-/DAT-/SEC-/LGC-` kabul eder (ad-uzayı
  başına şema). Eski `GLS-NNNN` id'li saklı spec'ler **artık derlenmez** (şema
  hatası); `lco change` ile yeniden üretin veya `GLS-` id'lerini elle `REQ-`'ye
  çevirin.
- **Changeset'ler TST referanslarını kendiliğinden yeniden demirlemez (bilinen
  sınır):** `ChangeSetSchema`'da `modified_requirements` op'u yoktur. Bir
  changeset bir görevin testlerini değiştiriyorsa/kaldırıyorsa,
  `acceptance_refs`'in hâlâ atıf yaptığı `TST-NNNN` id'leri KALAN görevin
  `tests[].id` yaması üzerinden açıkça yeniden demirlenmelidir (örnek:
  `change.test.ts`'te kaldırılan `TST-0003`'ün kapsayan teste taşınması).
  Kaldırma ergonomisi istenirse gelecekte bir changeset uzantısı eklenmelidir.
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

- **PROD-003 (bu aşama):** niyet-doğruluk iddiaları (`MENTIONS_TERMS`), yapısal/niyet
  skor ayrımı, tekrarlı koşum + yayılım tablosu, tam-usage şartı (tekrarlar arasında),
  adversarial eval vakaları, G4'ün dürüst yeniden etiketlenmesi + live yeniden koşum
  yordamı — 935 test.
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
