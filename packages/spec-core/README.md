# lco-spec — Spec IR Çekirdeği (Kanıt Kapısı Deneyi)

Bu paket, LLM konsey mimarisinin **kanıt kapısı (evidence gate) deneyinin** çekirdeğidir:
spekülasyonların (intent, sözlük, varsayım, kanıt, gereksinim, karar, sözleşme, görev)
şemayla doğrulandığı, derlendiği, dondurulduğu (freeze + artifact hash), izlenebilirlik
ve lint kurallarıyla susturulamaz hale getirildiği **Spec IR** katmanı — ve bu çekirdeğin
iddialarını ölçen deterministik değerlendirme (eval) altyapısı.

Deneyin sorusu: *"Konsey, tek ajandan ölçülebilir şekilde daha mı doğru — ve maliyeti
kabul edilebilir mi?"* Bu paket o soruya **kanıtla** cevap vermeyi hedefler; tahminle değil.

Çekirdek iki yüzeyden tüketilir: **`lco` CLI** (11 komut: compile, lint, freeze, verify,
change, trace, plan, init, check, generate, doctor) ve **`lco-mcp`** stdio sunucusu
(10 MCP aracı) — ikisi de aynı saf komut çekirdeklerini çağırır.

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
pnpm --filter ./packages/spec-core test    # vitest (1231 test: şema, derleyici, lint, eval, CLI, check, doctor, MCP, bütçe, yayın kapısı, ölçek-tavanı)
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

**Publishing (maintainer):** paket npm'de `lco-spec` adıyla yayımlanır. Tercih
edilen akış **CI'dır** (bkz. ["Yayın ve Sahiplik"](#yayın-ve-sahiplik-p2-6)):
etiketleyip `publish-spec-core` iş akımını çalıştır — `dry_run` girdisi
**varsayılan olarak true**'dur, yani iş akımı tek başına asla yayımlamaz.
Yerel yayın da aynı kapıya takılır: `prepublishOnly` =
`pnpm run test && node scripts/prepublish-check.js` — kirli çalışma ağacı,
etiketsiz HEAD veya etiket↔sürüm uyuşmazlığı REDDEDİLİR (`pretest` temizleyip
derler, tek build — PATH'te pnpm gerektirir). Yayınlama bir
**kullanıcı eylemidir** (U4) — bu depodan otomatik publish yapılmaz.

## CLI: `lco`

Derleme sonrası `dist/cli/index.js` çalıştırılabilirdir (paket `bin`'i `lco`). On bir
komut; dokuzu bir spec dizini (`<dir>/spec/*.json` bölüm dosyaları) alır, `generate`
o dizini bir niyet metninden üretir, `doctor` ise isteğe bağlı bir `<dir>`'i (varsayılan:
geçerli dizin) yalnız OKUR — tanı yazar, hiçbir şey değiştirmez.

Yardım ve sürüm (UX-002): `lco --help` (veya `-h`) genel kullanımı, `lco <komut> --help`
o komutun kendi yardımını stdout'a yazdırır ve **exit 0** verir — yardım, komutun kendi
bağımsız-değişken doğrulamasından ÖNCE gelir (`lco init --help` asla hata vermez).
`lco --version` paketin `package.json` sürümünü çalışma zamanında okur ve yazdırır
(exit 0). Bilinmeyen komut/bayrak davranışı değişmedi: exit 2 + stderr'de usage.

| komut | işlev |
| --- | --- |
| `compile <dir>` | spec/ ağacını derle + şemayla doğrula |
| `lint <dir>` | derle + 12 lint kuralı; kural/ciddiyet/yol/mesaj tablosu |
| `freeze <dir>` | kapı kontrollü dondurma (yalnız `draft` durumundan; lint temiz + sayaç sıfır); `spec/manifest.json`'a artifact hash yazar |
| `verify <dir>` | bölüm hash'lerini yeniden hesapla, manifest ile karşılaştır (drift) |
| `change <dir> <changeset.json>` | FROZEN spec'e changeset uygular: aday revizyonu ÖNCE tamamen doğrular (compile + lint), sonra sürüm+1, state→draft ve değişen bölümleri atomik yazar; lint-geçersiz change → exit 1 ve DİSKE HİÇBİR ŞEY YAZILMAZ |
| `trace <dir>` | izlenebilirlik raporu (bilgilendirici): kenar sayıları, REQ başına task bağları (✓test/✗test), yetim REQ'ler, kapsam |
| `plan <dir> [--json]` | topolojik yürütme planı (deterministik Kahn; aynı seviyede task_id lexicographic); döngü → hata; `--json` makine-okur |
| `init <dir> [--profile p-mini\|p-standard] [--name <ad>]` | ÇALIŞAN minimal EXAMPLE spec iskeleti yazar; `<dir>/spec` varsa reddeder |
| `check <dir> [--task TASK-0001] [--yes] [--timeout-ms 60000]` | TaskContract verification komutlarını önizler/koşar — **varsayılan DRY-RUN** |
| `generate <dir> --intent "<metin>" \| --intent-file <yol> [--variant single\|council] [--profile p-mini\|p-standard] [--max-attempts N] [--max-tokens N] [--max-wall-ms N]` | doğal-dil niyetini canlı LLM ile derlenebilir `spec/` taslağına çevirir; kanıt kapısı bloklarsa HİÇBİR dosya yazmaz (ayrıntı: aşağıda) |
| `doctor [dir] [--json]` | çalışma-ortamı tanısı (P3-2): node sürümü, `LCO_LLM_*`/`LCO_MCP_*`/`LCO_GENERATE_MAX_*` env (yalnız set/unset — değer ASLA yazılmaz), `<dir>`'de yazma/kilit/atomik-rename probu, `spec/` derleme özeti, dist bin (shebang + çalıştırma modu) ve şema artefaktı tazeliği; satır başına `[ad] ok/warn/fail/skip` |

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
| `check` | tüm PASS veya DRY | en bir FAIL/TIMEOUT/OUTPUT-CAP/UNPARSEABLE-EXPECT | derleme VEYA lint reddi (BACK-006: check lint-clean bundle ister), bilinmeyen `--task`, bozuk bayrak, kanıt yazım hatası |
| `generate` | `spec/` yazıldı (state draft) | kanıt kapısı bloğu VEYA savunma-lint reddi — HİÇBİR dosya yazılmaz | kullanım hatası (bozuk bayrak, eksik/çakışan/boş/aşırı-uzun `--intent`), eksik `LCO_LLM_*` env, `<dir>/spec` zaten var (üzerine yazma reddi), `BUDGET_EXCEEDED` (koşu bütçesi aşıldı — hiçbir şey yazılmaz) |
| `doctor` | hiçbir kontrol **fail** değil (warn/skip exit 0'da kalır) | en az bir FAIL: kırık yetenek — yazılamayan/olmayan dizin, başarısız atomik-rename probu, bozuk dist bin, derlenmeyen `spec/` | kullanım hatası (bozuk bayrak, fazladan konum argümanı) |

Lint kuralları: **L01–L08, L10, L12, L13, L14** (12 bağlayıcı kural; L09 ve L11 şema
katmanında zorlanır, lint değil). L01–L12'nin her birinin `fixtures/bad/LXX/` altında
beklenen hatayı üreten bir yakalama vektörü vardır; semantik-kapanış kuralları L13
(kırık referans) ve L14 (yargılanabilir expect) birim testleriyle ve `plan`/`check`'in
lint-clean yükleme kapısıyla (BACK-006) sabitlenir.

### `doctor` — saha tanı aracı (P3-2)

`lco doctor [dir] [--json]` çalışma ortamını denetler ve sorunları raporlar;
`<dir>` varsayılanı geçerli dizindir. Gizlilik sözleşmesi kesindir: doctor bir env
değişkeninin DEĞERİNİ (hatta uzunluğunu) ASLA yazmaz — yalnız set/unset ve geçerlilik.
Ciddiyet eşlemesi: **FAIL** = kırık yetenek (yazılamayan dizin, başarısız atomik
yazma/rename probu, bozuk dist bin, derlenmeyen `spec/`) → exit 1; **WARN** =
yapılandırılmamış opsiyonel (canlı `LCO_LLM_*` env'i yok, bayraklı ama tam '1'
olmayan `LCO_MCP_*`, çöp `LCO_GENERATE_MAX_*`, bayat şema artefaktı) → exit 0;
**SKIP** = bu bağlamda uygulanamaz (`spec/` yok, dist/ yok — kaynak koşusu asla
yanlış-başarısız olmaz, paketlenmiş kurulumda şema regeneratörü yok). Probe yan
etkisi yoktur: oluşturduğu gizli probe dosyasını siler ve mevcut bir kilidi —
canlı VEYA bayat — ASLA kırmaz (süresiz staleMs ile edinir; bayat kilidi pid'i ve
yaşıyla adlandırıp uyarır, kanıtı yerinde bırakır). Node sürümü eşiği
(`>=22`) package.json'ın `engines.node` alanından ÇALIŞMA ZAMANINDA okunur
(`--version`'ın okuduğu aynı dosya; okunamazsa derleme-sabiti yedek — test ikisini
birbirine sabitler). `--json` tam olarak `{"checks":[{name,status,detail,remedy?}…],
"healthy":bool}` yazar (plan `--json` ile aynı stil). Doctor CLI-yalnızdır: MCP
sunucusuna doctor aracı eklenmez (stdout JSON-RPC saflığı korunur).

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
lint OK: 0 errors, 0 warnings (12 rules)
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
(0 timeout, 0 output-cap, 0 unparseable-expect)
# exit 0

$ node dist/cli/index.js check /tmp/lco-tour --yes
check: tour-app — 2 verification command(s)
TASK	COMMAND	EXPECT	EXPECTED→ACTUAL	STATUS
TASK-0001	node --version	exit 0	0 → 0	PASS
TASK-0002	node --version	exit 0	0 → 0	PASS
summary: 2 pass, 0 fail, 0 dry
(0 timeout, 0 output-cap, 0 unparseable-expect)
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
  cwd spec köküdür, komut başına `--timeout-ms` (varsayılan 60000 ms) sonunda
  komutun İZOLE process group'unun TAMAMI öldürülür (SEC-005; aşağıdaki
  "Yürütme izolasyonu" notuna bakın).
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
  junction davranışı kapsam dışıdır.) Bilinen kalıntı (TOCTOU): takip-etmeyen
  yazma kapısı denetle-sonra-yaz biçiminde çalışır — kapı ile staging/rename
  arasında bir ara dizin bileşenini (ör. `spec/evidence`) sembolik bağla
  değiştiren YARIŞAN bir yerel yazıcı yazmayı başka bir yere yönlendirebilir;
  bu tehdit modelinin dışındadır (statik ağaçlar ve önceden yerleştirilmiş
  bağlar kapsanır; ağaca eşzamanlı yazma erişimi olan bir saldırgan kapsanmaz)
  ve Node'da dirfd/O_NOFOLLOW API'leri olmadan taşınabilir biçimde
  kapatılamaz.

Operasyonel notlar:

- **Yürütme izolasyonu (SEC-005, POSIX).** Her komut kendi process group'unda
  yürütülür ve süreç ağacının TAMAMI kapsanır: zaman aşımında, çıktı sınırı
  aşımında VE normal bitişte grup önce `SIGTERM` alır; grace penceresi
  (400 ms) sonunda hâlâ yaşayan üye varsa grup `SIGKILL` ile öldürülür.
  Executor'ın kararı döndürmesi, grubun ölmüş (veya SIGKILL edilmiş) olması
  anlamına gelir — bir `TIMEOUT` sonucu artık "işlem durdu"nun kanıtıdır ve
  normal bitişte bile komutun sahneye koyduğu arka süreçler karardan sonra
  çalışamaz. **stdin `/dev/null`'dur:** etkileşimli komutlar anında EOF görür,
  zaman aşımını bekleyerek asla bekletmez. **Kapsam dürüstçe:** process
  group'lar POSIX mekanizmasıdır — Windows (job object'ler gerektirir) kapsam
  dışıdır; kendini yeni oturuma taşıyan (`setsid`) bir torun gruptan kaçar ve
  yalnızca çekirdek düzeyinde izolasyon (cgroup/sandbox) kapsanabilir.
- **1 MiB çıktı sınırı taşması `OUTPUT-CAP` sayılır (OPS-003).** Üretim
  yürütücüsü akış başına 2^20 kod-birimi (1 MiB değerinde; exec'in maxBuffer'ı
  utf8 altında KARAKTER sayar — bayt değil, burada da öyle; ayrıntı:
  `runner.ts` `MAX_BUFFER_BYTES` başlığı) sınırıyla çalışır; sınırı aşan çıktı
  GRUBU öldürür ve sonuç ayrı etiketle yargılanır: `OUTPUT-CAP` (exit null,
  kanıta yazılır, çıkış 1'e katkı) — fail-closed: geveze bir komut asla PASS
  olamaz. `TIMEOUT` yalnızca gerçek zaman aşımı kill'i ve sinyalle ölüm
  içindir; operatör `TIMEOUT` görüyorsa teşhisi asılı komuttur, geveze
  komut değil — ikisi hiçbir yüzeyde (tablo, özet satırı, kanıt) aynı
  etiketi paylaşmaz. Çare: komutu sessizleştirin ya da çıktıyı dosyaya
  yönlendirin (ör. `> out.log 2>&1`) ve günlüğü dosyadan okuyun; özet satırı
  taşmayı ayrıca sayar (`N output-cap`).
- **Sinyalle öldürme → TIMEOUT.** Sinyalle biten bir sürece çıkış kodu atanmaz
  (`exit: null`, `TIMEOUT`): öldürülmüş süreç, yargılanmış bir çıkış koduyla
  karıştırılamaz. Zombi bırakılmaz: kabuk, karara varılmadan önce reaped edilir.
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
- **Kullanım muhasebesi (UX-001 + UX-003 + PERF-001):** özetler tamamlama ve HTTP
  denemesini ayrı ayrı gösterir (`N LLM call(s) / M HTTP attempt(s)` — zaman aşımına
  uğrayan denemeler dahil). Sağlayıcı usage BİLDİRMEDİĞİNDE token sayıları `unknown`
  görünür — asla `0 in / 0 out` değil; G4 maliyet koşulu da unknown'ı geçmez
  (`0 <= 3×0` kanıt değildir). Ayrıca koşunun gönderdiği **prompt baytları**
  (`K prompt bytes`) koşucu tarafından YEREL olarak ölçülür ve her durumda raporlanır —
  gömülü şema (~23 KiB) bundle üreten her çağrıda ve her doğrulama-retry'inde
  tekrarlanır; bu maliyet tahmin edilmez, sayılır. Prompt önbellekleme/BJM
  referanslama BİLİNÇLİ olarak ertelenmiştir: sağlayıcılar önbellek anahtarı ve
  isabet raporlaması açısından farklıdır, koşucu sağlayıcı-agnostiktir; ölçüm önce
  gelir, önbellekleme ölçülen bir maliyeti gerekçelendirdiğinde eklenir.
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

### Dayanıklılık ve Protokol Sınırları (OPS-001, SEC-006)

Sunucu tek bir stdio oturumunu sınırlarla yönetir (`src/mcp/stdio.ts`); hiçbir
girdi türü süreci sınırsız belleğe, sınırsız eşzamanlı işe veya sessiz bir
yarıda kesintiye (truncated exit) götüremez:

- **Frame sınırı — 1 MiB/satır.** stdin parça parça (chunk) okunur ve satırlar
  bir BAYT bütçesi altında birleştirilir; sınırı aşan satır ASLA tamamen
  tamponlanmaz: taşan baytlar sonraki newline'a kadar atılır, istemciye bir
  kez `-32600 Request too large` (id `null`) yanıtı verilir, stderr'e tanılama
  düşer ve bağlantı AÇIK kalır — bir sonraki düzgün satır normal hizmet görür.
  Meşru MCP frameleri küçüktür (en büyük argüman 10k karakterlik inline
  intent'tir); 1 MiB %100 pay demektir. (Node `readline` satırı tamponlamadan
  sınırlayamaz — bu yüzden assembler sunucunun kendisindedir.)
- **Eşzamanlı iş sınırı — 16 in-flight istek.** Bir istek kabul anından yanıtın
  yazılmasına kadar "in-flight" sayılır. 17.'si anında yapılandırılmış bir
  `-32000 Server busy` hatası alır (kendi id'si yankılanır) — sıraya girmez,
  bekletilmez. Bildirimler ve bozuk satırlar iş başlatmadığı için bu sınıra
  takılmaz. Sınır, bir istemcinin aynı anda ayakta tutabileceği araç koşusunu,
  mutasyonu ve çocuk süreci sınırlar.
- **Mutasyon serileştirme.** Aynı kökteki mutasyonlar depolama katmanının
  kök-başına kilidiyle zaten serileşir (T6; sunucu düzeyinde de sabitlenmiştir);
  farklı kökler in-flight sınırına kadar eşzamanlı ilerler. Ek kural
  (bilinçli karar): **aynı kök için ikinci bir `lco_generate` ilk uçarken**
  anında yapılandırılmış reddetme alır (`isError`, SIFIR LLM çağrısı). Önce
  her ikisi de rızadan geçip ücretli boru hattını İKİ KEZ koşturuyordu (yazma
  no-clobber ile güvenliydi ama harcama ikileydi); ücretli olan tek araç için
  in-flight tekrar-reddi ucuz ve dürüsttür. `lco_init`/`lco_change` yerel ve
  ücretsizdir — onlar kilit semantiğinde kalır (T10 exactly-one-winner).
  Dedup anahtarı istenen `dir`'in sözcüksel çözümüdür (`path.resolve`);
  sembolik bağlantı takma adlarını yakalamaz — doğruluk yededi her zaman
  kilitken bu yalnızca harcama dedup'idir.
- **stdout backpressure.** Yanıtlar `Writable.write`'tan geçer; `false`
  döndüğünde stdin okuma DURUR ve akış `drain` olana kadar durur. Duraklatılmış
  girdi yeni satır üretmediği için yazma kuyruğu yapısal olarak sınırlıdır
  (in-flight ≤ 16 yanıt + duraklatılmış boru) — sınırsız tampon büyümesi yoktur.
- **Kapanış semantiği ve çıkış kodları.** stdin EOF (düzenli kapanış): yeni
  satır alınmaz, in-flight işin bitmesi ve bekleyen yazımların boşalması
  beklenir, çıkış `0`. stdout EPIPE (istemci öldü): yeni satır alınmaz, artık
  yazılmaz (ölü bora yanıt yazılmaz — yarım satır oluşmaz), in-flight işin
  bitmesi **10 saniyelik drain penceresi** içinde beklenir (başlamış disk
  yazımları ve çocuk yaşam döngüleri bitsin diye), sonra çıkış `3` — iş
  ortada bırakıldı, sessiz `0` asla değil. Drain penceresi aşılırsa hâlâ
  koşan doğrulama süreç grupları SIGKILL edilir (ölü bir süreç onları
  reap edemez — OPS-001/SEC-005 kapsama) ve çıkış `4` olur. EOF yolunda
  yapay zamanlayıcı YOKTUR: araçların kendi iç bütçeleri vardır (UX-003 wall
  budget, check timeout'ları). Kapanış zamanlayıcısı süreç sınırında
  duvar-saatlidir — T16 gerekçesiyle aynı: gerçek bir stdio oturumunun gerçek
  kapanışını yönetir, deterministik çekirdeğin parçası değildir (testlerde
  enjekte edilebilir).
- **JSON-RPC 2.0 zarfı (SEC-006).** Dispatch'ten ÖNCE tam doğrulama:
  `jsonrpc` tam olarak `"2.0"` olmalı (`"1.0"`, `2.0` sayısı, eksik → `-32600`);
  `method` boş olmayan dize; `id` varsa dize/sayı/`null` — nesne/dizi/boolean
  id reddedilir ve ASLA yankılanmaz (yanıtın id'si `null`; JSON-RPC 2.0 §5.1
  id-saptama kuralı); `params` varsa nesne olmalı (MCP adlandırılmış
  parametre kullanır; konumsal dizi reddedilir); zarf dışı bilinmeyen alan
  reddedilir (`additionalProperties:false` sıkılaştırma politikasının zarf
  uzantısı); **batch** (dizi gövde) tek bir `-32600` hatasıyla reddedilir —
  sunucu tasarımı gereği satır-başına-tek-istektir (stdio-MCP batch'e ihtiyaç
  duymaz; belgelenmiş no-batch tavrı). Yalnızca GEÇERLİ bildirimler sessizdir:
  idsiz her geçerli istek ve `notifications/*` (id'li olsa bile, belgelenmiş
  uzantı) yanıt almaz; geçersiz zarf id'siz olsa bile `id:null` hatası alır.

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
   freeze sonrası yeniden hash'i eşleşmeyen (drift'e girmiş) içerik veya lint-kirli
   bundle, neyin başarısız olduğunu adlandıran bir reddetmeyle geri çevrilir
   (drift doğrulaması anlamsal bölüm kimliğidir — tampon-boşluğu düzeyinde
   düzenleme yakalamaz; bkz. "Bilinen Sınırlar").
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

## L12 Kapsam-Örtüşme Semantiği (BACK-007)

`L12_SCOPE_OVERLAP` bir ERROR'dur ve dondurma kapısıdır; bu yüzden örtüşme modeli
yaklaşıklık değil, TANIMLI bir desen dili üzerinde kesindir:

- **Desen dili** (`permitted_scope` glob'ları): `/`-ayrılmış segment dizisi;
  segment içinde edebi karakter kendini, `?` TAM OLARAK BİR karakteri (`/` hariç),
  `*` SIFIR VEYA DAHA FAZLA karakteri (`/` hariç; ardışık yıldızlar tektir:
  `a**b` = `a*b`), yanlızca `**` yazılan segment İSTENEN SAYIDA segmenti (sıfır
  dahil) eşler (`src/**` → `src` kendisi ve altındaki her şey). `\` `/`'ye
  normalize edilir; boş segmentler (`//`, sonaki `/`) atılır. Bu dilin dışındaki
  dizeler (karakter sınıfları, küme parantezleri) edebi kabul edilir.
- **Örtüşme tanımı:** iki glob, İKİSİNİ de sağlayan bir dosya yolu VARsa örtüşür.
  Bu alt küme için kesin hesaplanır (segment-birleşim + `**`-farkındalıklı yol DP;
  `src/lint/rules/l12.ts` — birim-test edilmiş saf fonksiyonlar, tablo + kaba-kuvvet
  çapraz denetim ile). Sonuç: `src/*.ts` ile `src/*.md` KANITLANARAK ayrıktır
  (uzantı farkı tanık gerektirir), `src/*.ts` ile `src/*.t?` kanıtlanarak örtüşür
  (`src/a.ts` tanığı), `*` asla `/` geçmez.
- **Sıralama semantiği:** çakışma, iki görev arasında bir `depends_on` YOLU
  (geçişli kapanış; A←B←C zinciri de dahil) VARSA bastırılır — doğrudan kenar
  yeterli ama gerekli değildir. Kayıtlı gerekçe: zincir de aynı şekilde serileştirir,
  tavlama denetimin adını verdiği yanlış-pozitif sınıfıydı; kapanış girdi
  tavanlarındaki boyutlarda ucuzdur (iteratif DFS; derin zincillerde yığın taşması
  yok); döngü içindeki her çift "sıralı" sayılır ama döngü zaten L04'ün hatasıdır.
  Elmas ortası (B ve C ikisi de A'ya bağlı, aralarında yol YOK) hâlâ işaretlenir —
  gerçekten paralel koşabilirler.
- Hata mesajı çareyi adlandırır: görevler arasına `depends_on` yolu ekle YA DA
  kapsamları ayır.

## Girdi Tavanları (PERF-001)

Şema, kareli lint/hash işlerinin KoşMASINDAN ÖNCE girdiyi sınırlar (düşmanca MCP
girdisi ve başıboş LLM çıktısı için bir duvar — seyyar tripwire değil). Tavanlar
fixture/eval bünyesindeki en büyük gözlemlenen kullanımın ~10x+ üstünde seçildi
(ölçüm önce yapıldı; tam tablo `src/schemas/limits.ts` başlığında):

| Alan | Ölçülen max | Tavan |
| --- | --- | --- |
| görev / bundle | 4 | 100 |
| requirement / karar / kanıt / sözlük / varsayım / sözleşme | 1–4 | 100 (her biri) |
| `refs.*`, `depends_on`, `permitted_scope`, `protected` (görev başına) | 0–2 | 50 |
| `tests`, `verification` (görev başına) | 1 | 20 |
| test case sayısı (test başına) | 2 | 50 |
| `title` | 25 krk | 500 |
| `purpose` / `rollback` | 63–73 krk | 4.000 |
| `instructions` | 111 krk | 20.000 |
| liste öğesi / komut / dosya-yolu | ≤83 krk | 1.000–2.000 |
| `intent.statement` | 111 krk | 100.000 (niyet yankısı uzun olabilir) |

**KIRICI SIKILAŞTIRMA:** tavanan aşan bundle şema hatasıyla reddedilir ve hata
limiti + çareyi adlandırır (`bundle exceeds 100 tasks — split the spec into
separately frozen bundles`). Ölçek regresyonu `src/scale-benchmark.test.ts` ile
korumalıdır: 10/100/1000 görevlik deterministik sentetik bundle'lar üzerinde
L12 + kapanış + lint + hash + derleme, cömert (~10x) tavanların altında
kalmalıdır (turuncu değil kırmızı bir sınır — aşıldığında mertibe regresyonu var
demektir).

## Şema Sürümü ve Uyumluluk Politikası (`lco-spec/1.x`)

**PROD-005.** `manifest.spec_schema` alanı, ağacın yazıldığı şema sürümünü bildirir.
Tek kaynak `src/schemas/version.ts` içindeki `SPEC_SCHEMA_VERSION` sabitidir (şu an
`lco-spec/1.0`); manifest şeması bu sabiti birebir zorunlu kılar ve `init` iskeleti
aynı sabiti yazar — literal kodda başka hiçbir yerde tekrarlanmaz.

Politika:

- **`1.0` bugüne dek çıkarılmış TEK şema sürümüdür**; şemaların minor-sürüm kavramı
  henüz yoktur. Aşağıdaki kurallar GELECEK minor'ları yönetir — bugün
  `lco-spec/1.0`'dan başka okunabilir sürüm yoktur ve bu politika kendisi için
  minor makineleri icat etmez.
- **Okuma uyumluluğu (read-compat):** major 1 içinde YENİ derleyiciler ESKİ 1.x
  donmuş ağaçlarını okumak ZORUNDADIR — bir frozen artifact'ın dayandığı garanti
  budur. Bir `1.1` çıkarsa, 1.1 derleyicisi `lco-spec/1.0` ağaçlarını da okur;
  kabul edilen sürüm kümesi `checkSpecSchemaVersion` içindeki işaretli büyüme
  noktasında BİLİNÇLİ olarak büyütülür.
- **Kendinden yeni minor bildiren spec:** derleyicinin bildiğinden YENİ bir 1.x
  minor'u bildiren ağaç (`lco-spec/1.2` gibi) okunmaz — bilinmeyen bir şemayı 1.0
  şekliyle okumak sessiz yanlış-ayrıştırma olur, tahmin yürütülmez. Hata "derleyiciyi
  yükselt" diye yönlendirir; 1.x okuma-uyumlu olduğundan ağacınız yeni derleyicide
  geçerli kalır. `spec_schema`'yı elle geri yazdırmayın.
- **Major = okuma kırılması:** başka bir major bildiren ağaç (`lco-spec/2.0` gibi)
  bu derleyicide ASLA okunmaz (ayrı, adı konmuş hata). Göç aracı major ile BİRLİKTE
  gelir (2.x'in kendisiyle); bugün böyle bir araç YOKTUR ve tarihe vaat edilmez.
- **Hata ayrımı:** `spec_schema` hatası üç ayrı mesajla yüzeye çıkar — bozuk/biçimsiz
  dize (`lco-spec/<major>.<minor>` biçimi öğretilir), bilinmeyen YENİ minor
  (yükseltme yönlendirmesi), başka major (major kırılması + göç aracının kapsamı).
  Derleme çıktısı bu mesajları `manifest.spec_schema` yolunda taşır; politika tek
  yerde durur (`src/schemas/version.ts`).
- **Geri alma dürüstlüğü:** donmuş ağaçlar salt JSON dosyalarıdır; geri alma hikâyesi
  **git geçmişidir** — `spec/` bölüm dosyalarını eski bir commit'e döndürmek tüm
  ağacı geri alır. Derleyicinin otomatik geri-alma/rollback komutu YOKTUR; donmuş
  bir spec'i ileriye taşımanın tek desteklenen yolu `lco change`'dir.

### Legacy modu: DENEYSEL, yalnızca-şema

`mode: "legacy"`, `complexity_profile: "p-legacy"` ve `spec/legacy.json` **DENEYSELDİR
ve yalnızca şema yüzeyidir**: hiçbir dönüşüm/analiz semantiği yoktur — derleyici
legacy paketini pass-through taşır, closure yalnızca `preserve_change_drop[].evidence`
referanslarını denetler. `generate` ve `init` bu profili SEÇEMEZ (yalnızca
`p-mini | p-standard`); legacy spec'in tek yolu elle yazılmış JSON'dur. Legacy bloğu
**varsa tam olmalıdır** (`as_is_summary` + en az bir `preserve_change_drop` girdisi):
`{}` veya yarım paket şema hatasıdır — "legacy paket yok" demenin tek yolu bloğu hiç
yazmamaktır. (Bilinçli erteleme: `p-legacy` profilini legacy bloğuna bağlayan bir lint kuralı eklenmedi — profil semantiği hiçbir profil için geliştirilmiş değil; şemadaki varsa-tam kuralı denetimin boş-`{}` başarısızlık senaryosunu zaten kapatıyor.) Dönüşüm semantiği, bir pilot gerekçe göstermedikçe kalıcı olarak kapsam
dışındır (denetim P4).

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

- **Yüzey tamamlandı:** CLI 11 komut (compile, lint, freeze, verify, change, trace,
  plan, init, check, generate, doctor) + `lco-mcp` stdio sunucusu (10 araç). Her komut çekirdeği
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
- **Göç notu — legacy bloğu artık varsa tam olmalı (PROD-005):** `legacy`
  bölümü eskiden `.partial()`'dı; `{}` veya yalnız-`as_is_summary` paketi şema-geçerli
  kabul ediliyordu (denetimin de bulduğu gibi: anlamsız bir boş paket). Artık blok
  VARSA tam olmalıdır; yarım/boş legacy bloğu taşıyan saklı spec'ler derlenmez —
  bloğu tamamlayın ya da tamamen kaldırın (kaldırmak "legacy paket yok" demenin tek
  yoludur). Legacy modunun kendisi DENEYSEL/yalnızca-şema kalır (bkz. sürüm
  politikası bölümü).
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
- **verify ham bayt değil, şema-normalize edilmiş bölüm içeriğini hash'ler (DATA-003,
  kabul edilmiş sınırlama):** hash, ayrıştırılmış bölümün kanonik JSON'udur — verify'nin
  kanıtladığı şey bölümlerin ANLAMSAL (semantic) kimliğidir, bayt-düzeyi değişiklik
  kanıtı değil. Ham dosya biçimlendirmesi (girinti), anahtar sırası ve trim-refine'lı
  metin alanlarının baş/son boşluk değişiklikleri normalize edildiği için drift üretmez
  (turdaki tamper denemesi #1'in exit 0 çıkması tam olarak budur); aynı dizgenin
  ortasına giren boşluk ya da herhangi bir anlam-değiştiren düzenleme yakalanır. Kasıtlı
  tasarım: bölüm-içeriği drift dedektörü, tamper kanıtı değildir (G2 kapsam notu) —
  bayt-düzeyi provenance isteniyorsa bu mekanizmaya eklenmelidir, yerine geçmez.
- **Manifest'in kendisi hash kapsamının DIŞINDADIR (DATA-002):** `verify`, bölüm
  içeriğini manifest'te saklanan `artifact_hashes`'e karşı doğrular; ama
  manifest'in KENDİSİ — proje kimliği, `spec_schema`/`spec_version` üstverisi,
  sayaçlar (`unresolved_count`, `blocking_count`), `state`, `evidence_snapshot`,
  `council_run`, zaman damgaları ve saklı `artifact_hashes`'in kendisi — hiçbir
  hash tarafından kapsanmaz. Yeşil bir `verify` **bölüm-içeriği bütünlüğünü**
  kanıtlar; **manifest'in özgünlüğünü kanıtlamaz** — bütünüyle elle uydurulmuş
  bir manifest hâlâ temsil edilebilir (dondurmanın köken denetimi — v1 taslağının
  hash taşımaması / v>1 taslağının önceki dondurmanın hash'lerini taşması
  zorunluluğu — bunu daraltır, ortadan kaldırmaz). Kriptografik provenance
  (imza / kök özet) BİLİNÇLİ olarak uygulanmamıştır ve yalnızca ticari bir
  provenance iddiası gerekçe gösterilirse eklenir (denetim DATA-002'nin
  önerilen yönü; mevcut kapsam notu: `verify.ts`).
- **L03'ün etkin kapsamı:** `test_files` defteri `compile` sırasında görevlerden
  *türetilir*, dolayısıyla derlemeden gelen bundle'lar L03'ü asla tetikleyemez. Kural,
  modelin kendi test defterini yankılamak zorunda olduğu **doğrudan ayrıştırma / LLM
  yolunu** korur (runner, LLM çıktısını `compile` olmadan `SpecBundleSchema` ile
  ayrıştırır): `tasks[].tests[].file` ile `test_files` tutarsızsa orada yakalanır.

## Yayın ve Sahiplik (P2-6)

Yayın **CI tercih edilen akıştır** ve sonsuza dek kullanıcı-kapılıdır (U4): bu
depo otomatik yayın yapmaz — makine yalnızca kapıyı ve provenance'ı sağlar.

**CI akışı (tercih edilen):**

1. Sürüm bump + Değişiklik Günlüğü girdisi + tam kapı yeşili → commit.
2. `git tag v0.1.0 && git push origin v0.1.0`. Etiket `v<sürüm>` ya da çıplak
   `<sürüm>` olabilir — `prepublish-check.js` iki biçimi de kabul eder.
3. Actions → **`publish-spec-core`** iş akımını ETİKETLİ ref'ten çalıştır;
   `version` girdisine sürümü yaz (package.json sürümüne eşit olmalı — eşit
   değilse iş akımı reddedilir). `dry_run` girdisi **varsayılan olarak true**:
   birleşen iş akımı tek başına ASLA yayımlamaz; tam kapıyı (build/tazelik/
   lint/test/smoke) ve `npm publish --dry-run`'ı koşar, kayıt defterine
   dokunmaz.
4. Gerçek yayın yalnızca sahip `dry_run=false` seçtiğinde olur — ve o adım
   `NODE_AUTH_TOKEN` sırrı eklenmedikçe açıklamalı bir hatayla reddedilir.
   **Sırrı eklemek sahip eylemidir** (npm automation/granular token'ını repo
   sırrı olarak tanımlamak; ilk gerçek yayından önce bir kez — U4'ün ta kendisi).
5. Gerçek yayın `npm publish --provenance` ile yapılır: GitHub Actions OIDC'si
   kayıt defterinde imzalı bir provenance deyimi üretir (package.json'daki
   `repository` alanı bunun için zorunludur ve mevcuttur).

**Kirli/etiketsiz yayın yasağı:** `prepublishOnly`, test takımının ardından
`scripts/prepublish-check.js`'i çalıştırır. Karar çekirdeği test edilen
`src/release/readiness.ts`'tir (karar tablosu orada sabitlenmiştir — saat,
dosya sistemi, ortam erişimi yoktur; git durumu yalnızca sınır betiğinde
okunur). Şu hallerde yayın REDDEDİLİR: kirli çalışma ağacı (`git status
--porcelain` boş değilse — izlenmeyen dosyalar da kirli sayılır), HEAD etiketli
değilse, etiket package.json sürümüyle eşleşmiyorsa. Yerel temiz-etiketli
yayın teknik olarak mümkündür (yasak KİRLİ ve ETİKETSİZ yayındır) — ama CI
akışı tercih edilir: provenance yalnızca CI'da üretilir ve `prepublishOnly`
aynı kapıyı her iki yolda da uygular.

**Geri alma (rollback):**

- Sabit sürüme kilitlenmiş kullanıcılar (`"lco-spec": "0.1.0"`) bozuk bir YENİ
  yayından etkilenmez — eski tarball kayıt defterinde kalır.
- Gerçekten bozuk bir sürüm için npm'in **72 saatlik `npm unpublish` penceresi**
  vardır; pencere mutlak bir hak değildir (başka paketler o sürüme bağımlıysa
  unpublish engellenebilir; 72 saatten sonra yalnızca npm desteği).
- **Aynı sürüm numarası asla yeniden yayımlanmaz:** bir sürüm yalnızca bir kez
  etiketlenebilir, `prepublish-check`'in etiket↔sürüm eşleşmesi bunu yapısal
  kılar (npm kayıt defteri de eski sürümün üzerine yazmayı zaten reddeder).
  Onarımın yolu `git revert` + **patch sürümüdür**.

**Platform / sağlayıcı matrisi (dürüst):**

| Boyut | Durum | Kanıt |
| --- | --- | --- |
| Node 22, 24 | desteklenir | `ci-spec-core` matrisi her push'ta (build, tazelik, lint, test, smoke) |
| Node 21 ve altı | desteklenmez | `engines: ">=22"`; CI'da denenmez |
| Linux (POSIX) | desteklenir | CI (`ubuntu-latest`) |
| macOS (POSIX) | hedeflenir, CI'da denenmez | POSIX hedefi; CI matrisinde yok (dürüstlük notu) |
| Windows | **desteklenmez** | süreç-grubu yürütmesi POSIX mekanizmasıdır (T15/T16 ifşaları) |
| LLM sağlayıcıları (`LCO_LLM_*`, OpenAI-uyumlu uçlar) | **yalnızca mock ile test edilir** | canlı sağlayıcı birlikteçalışabilirliği açıkça TEST EDİLMEMİŞTİR; canlı koşum kullanıcı yordamıdır (bkz. "live G4 yeniden koşum yordamı") |
| npm kayıt defteri (registry.npmjs.org) | hedef yayın platformu | yayın yalnızca `publish-spec-core` iş akımından, dry-run varsayımıyla |

## Değişiklik Günlüğü

**Disiplin:** birleşen her aşama/sürüm bu bölüme **tarihli** bir girdi ekler;
kırıcı değişiklikler girdide açıkça işaretlenir; **test sayıları aynı
commit'te** güncellenir (bu girişler + Kurulum bölümündeki sayı bu kuralı
izler). Sürüm girdileri `prepublish-check`'in beklediği `v<sürüm>` etiketiyle
birlikte yaşar (bkz. "Yayın ve Sahiplik").

- **2026-08-27 — P3-5 / P3 düzeltme programının kapanışı (bu aşama):** OPS-003 —
  1 MiB çıktı sınırı taşması artık ayrı `OUTPUT-CAP` etiketiyle yargılanır
  (`TIMEOUT` yalnızca gerçek zaman aşımı kill'i ve sinyalle ölüm; tablo satırı,
  özet satırındaki `N output-cap` sayacı, kanıt dosyası ve `--help` aynı
  sınıflamayı taşır). DATA-003 ACCEPTED-DOC — kanonik hash'lemenin
  tampon-alanı/biçim/anahtar-sırası normalizasyonu "Bilinen Sınırlar"da
  anlamsal-bölüm-kimliği çerçevesiyle belgelendi; tamper dili her yerde
  accidental-drift kapsamına sabitlendi. Doküman-gerçeği süpürgesi: 11 CLI
  komutu (doctor), 12 lint kuralı (L13/L14), check özet satırı, ~23 KiB gömülü
  şema. Bu girdi son girdiden (P3-1) bu yana birleşen aşamaları da kapsar:
  P3-2 doctor komutu, P3-3 CLI/eval çekirdek bölünmesi (davranış değişikliği
  yok), P3-4 coverage eşiği (91/89/96/91, `test:coverage`) + D-state watchdog
  — 1231 test.
- **2026-08-27 — P3-1 (bu aşama):** L12 kapsam-örtüşme semantiği (BACK-007) — tanımlı
  glob alt kümesi (edebi/`?`/`*`/segment-`**`), kesin örtüşme modeli (tablo +
  kaba-kuvvet çapraz denetimli saf fonksiyonlar; `src/*.ts` vs `src/*.md` artık
  kanıtlanarak ayrık), bağımlılık-yolu (geçişli) sıralama semantiği; PERF-001 —
  girdi tavanları (`src/schemas/limits.ts`; kırıcı sıkılaştırma), prompt-bayt
  ölçümü kullanım satırında, Set-tabanlı test-dosya dedupe, 10/100/1000-görev
  ölçek-tavanı testi — 1158 test.
- **2026-08-27 — P2-6 (bu aşama):** yayın sahipliği/provenance — kirli/etiketsiz yayın
  yasağı (test edilen karar çekirdeği `src/release/readiness.ts` + sınır betiği
  `scripts/prepublish-check.js`, `prepublishOnly`'ye bağlı), manuel
  `publish-spec-core` iş akımı (yalnızca `workflow_dispatch`; `dry_run`
  VARSAYILAN true; OIDC `--provenance`; gerçek yayın `NODE_AUTH_TOKEN` sahip
  sırrı olmadan reddedilir), rollback/platform-sağlayıcı matrisi/değişiklik
  günlüğü disiplini bölümleri, DATA-002 manifest-özgünlüğü sınırlama notu —
  1078 test.
- **2026-08-27 — PROD-005 (bu aşama):** şema sürüm politikası (`src/schemas/version.ts` tek
  kaynak; ayrık/eyleme-dönük sürüm hataları: bozuk dize / yeni minor / başka major),
  legacy bloğu varsa-tam (strict-when-present), p-legacy/mode=legacy her yerde
  DENEYSEL + yalnızca-şema etiketi (CLI help, şema açıklamaları, README), sürüm
  uyumluluk/geri-alma politikası bölümü — 1.x okuma uyumluluğu, major = okuma
  kırılması, rollback = git geçmişi.
- **PROD-003 (bu aşama):** niyet-doğruluk iddiaları (`MENTIONS_TERMS`), yapısal/niyet
  skor ayrımı, tekrarlı koşum + yayılım tablosu, tam-usage şartı (tekrarlar arasında),
  adversarial eval vakaları, G4'ün dürüst yeniden etiketlenmesi + live yeniden koşum
  yordamı — 1067 test (bu sayı sürüm politikası aşamasında güncellendi).
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
