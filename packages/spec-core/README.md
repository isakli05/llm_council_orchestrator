# @lco/spec-core — Spec IR Çekirdeği (Kanıt Kapısı Deneyi)

Bu paket, LLM konsey mimarisinin **kanıt kapısı (evidence gate) deneyinin** çekirdeğidir:
spekülasyonların (intent, sözlük, varsayım, kanıt, gereksinim, karar, sözleşme, görev)
şemayla doğrulandığı, derlendiği, dondurulduğu (freeze + artifact hash), izlenebilirlik
ve lint kurallarıyla susturulamaz hale getirildiği **Spec IR** katmanı — ve bu çekirdeğin
iddialarını ölçen deterministik değerlendirme (eval) altyapısı.

Deneyin sorusu: *"Konsey, tek ajandan ölçülebilir şekilde daha mı doğru — ve maliyeti
kabul edilebilir mi?"* Bu paket o soruya **kanıtla** cevap vermeyi hedefler; tahminle değil.

## Kurulum / Derleme / Test

```sh
pnpm --filter @lco/spec-core build   # tsc + JSON Schema dışa aktarımı (generated/spec-schema.json)
pnpm --filter @lco/spec-core test    # vitest (421 test: şema, derleyici, lint, eval, CLI)
pnpm --filter @lco/spec-core lint    # tsc --noEmit
```

## CLI: `lco`

Derleme sonrası `dist/cli/index.js` çalıştırılabilirdir (paket `bin`'i `lco`).
Dört komut, bir spec dizini (`<dir>/spec/*.json` bölüm dosyaları) alır:

| komut | işlev | çıkış kodu (başarı / içerik hatası / kullanım-şema hatası) |
| --- | --- | --- |
| `compile <dir>` | spec/ ağacını derle + şemayla doğrula | 0 / – / 2 |
| `lint <dir>` | derle + 10 lint kuralı; kural/ciddiyet/yol/mesaj tablosu | 0 / 1 / 2 |
| `freeze <dir>` | kapı kontrollü dondurma; `spec/manifest.json`'a artifact hash yazar | 0 / 1 / 2 |
| `verify <dir>` | bölüm hash'lerini yeniden hesapla, manifest ile karşılaştır (drift) | 0 / 1 / 2 |

Gerçek örnek — bir fixture'ı spec dizinine açıp lint'lemek:

```sh
cd packages/spec-core
node -e "const b=require('./fixtures/good/pet-clinic/bundle.json');const fs=require('fs');fs.mkdirSync('/tmp/petclinic/spec',{recursive:true});for(const k of ['manifest','intent','glossary','assumptions','evidence','requirements','decisions','contracts','tasks','legacy'])if(b[k]!==undefined)fs.writeFileSync('/tmp/petclinic/spec/'+k+'.json',JSON.stringify(b[k],null,2))"
node dist/cli/index.js lint /tmp/petclinic
# -> lint OK: 0 errors, 0 warnings (10 rules)
```

Lint kuralları: **L01–L08, L10, L12** (10 bağlayıcı kural; L09 ve L11 şema katmanında
zorlanır, lint değil). Her kuralın `fixtures/bad/LXX/` altında beklenen hatayı üreten
bir yakalama vektörü vardır.

## Kanıt Kapısı: G1–G4

Kapı, `packages/spec-core` iddialarını dört ölçütle sınar. **G1–G3 deterministiktir**
(saat yok, rastgelelik yok, ortam okuma yok); **G4 yalnızca live koşuda anlamlıdır**:

| ölçüt | tanım | eşik |
| --- | --- | --- |
| **G1** | Kötü-fixture yakalama oranı: 12 L-vektör dizisi + `schema-invalid` + `drift` + `unresolved`, her biri beklenen katmanda (lint / şema / freeze / verify) reddedilmeli | **15/15** |
| **G2** | Drift saptama: dondurulmuş bundle'da değişiklik `verifyFrozen` tarafından yakalanmalı | **doğru** |
| **G3** | Belirsiz/çelişkili görevler: 8 `must_be_blocked` eval görevi her koşuda bloklanmış çıkmalı | **8/8** |
| **G4** | Konsey › tek ajan: konsey toplam onaylaması tek ajandan **kesin büyük** VE konsey token maliyeti tek ajanın **≤ 3 katı** | yalnız live |

Karar verme: G1–G3 sağlanırsa mock koşu **`PASS_DETERMINISTIC_ONLY`** verir (mock kanıtı
G4'ü temellendiremez — bu bilinçli bir dürüstlük sınırdır). Live koşuda G1–G3 **ve** G4
sağlanırsa **`PASS`**, aksi halde **`FAIL`**.

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

- **Deterministik kapı geçiyor**: G1 15/15, G2 doğru, G3 8/8 →
  karar `PASS_DETERMINISTIC_ONLY` (bkz. `audit-output/spec-core-gate-report.md`).
- **Live kanıt bekliyor**: G4 (konsey › tek ajan, ≤ 3× maliyet) yalnızca kullanıcı
  anahtarlarıyla yapılacak live koşuyla ölçülebilir; bu depo anahtar içermez ve
  mock koşudan G4 çıkarımı yapılmaz.

## Ayrıca Bakınız

- Deney planı: [`plans/2026-08-18-spec-core-evidence-gate.md`](../../plans/2026-08-18-spec-core-evidence-gate.md)
- Kanıt raporu (denetim izi): [`audit-output/spec-core-gate-report.md`](../../audit-output/spec-core-gate-report.md)
- Dışa aktarılan JSON Şema: `generated/spec-schema.json`
