# Refactor Spec 08
## Konu
Aynı modüllerin hem `.ts` hem `.js` sürümlerinin repoda birlikte bulunması nedeniyle kaynak sapması ve yanlış runtime/test davranışı

## Amaç
Kaynak tekilliğini sağlamak ve test/runtime'ın yanlış dosyayı yüklemesini engellemek. Şu an bazı klasörlerde TypeScript kaynak ile eski JavaScript çıktısı aynı kaynak ağacında yan yana duruyor; bu, özellikle test çözümlemesinde ve import davranışında tutarsızlığa yol açabiliyor.

## Sorun Tanımı
TypeScript sürümünde mevcut olan davranış veya method'lar, eski JavaScript eşlenik dosyada bulunmuyor. Sonuçta bazı testler veya çalıştırma akışları beklenen TS kaynağı yerine stale JS dosyasını gördüğünde hatalar oluşuyor. Bu durum yalnızca bir dosya özelinde değil, kaynak yönetim disiplinine dair sistemik bir risk.

## Kod Üzerinde Doğrulanacak Noktalar
- `apps/indexer/src/embedding/EmbeddingEngine.ts`
- `apps/indexer/src/embedding/EmbeddingEngine.js`
- repoda `src` altında birlikte duran `.ts` ve `.js` dosyaları
- tsconfig, test runner ve module resolution ayarları

## Neden Kritik
- Geliştirici bir dosyayı düzelttiğini sanırken runtime başka dosyayı çalıştırabilir.
- Test sonuçları gerçek kaynak kodu temsil etmeyebilir.
- Bu tür sapmalar zamanla görünmesi zor, üretimde pahalı hatalara dönüşür.

## Hedef Davranış
- Kaynak klasörlerinde tek otoritatif kaynak dili net olmalı.
- Test ve runtime, beklenen derleme/çözümleme yolunu izlemeli.
- Stale JS artıkları gerçek kaynak davranışını gölgelememeli.

## Refactor Kapsamı
1. Kaynak ağaçta birlikte duran `.ts` ve `.js` dosyalarını envanterle.
2. Hangilerinin build çıktısı, hangilerinin tarihsel kalıntı veya elle tutulmuş kopya olduğunu ayırt et.
3. Otoritatif kaynak stratejisini belirle:
   - kaynak klasörde yalnızca TS tutmak
   - derleme çıktısını ayrı klasöre almak
   - test çözümlemesini açık biçimde TS'ye sabitlemek
4. Sorunlu çift kaynakları temizle veya taşı.
5. Test ve runtime çözümleme ayarlarını bu stratejiyle uyumlu hale getir.
6. Özellikle mevcut hata üreten modülde davranışın tek kaynaktan geldiğini doğrula.

## Beklenen Mimari Sonuç
- Geliştirici, düzenlediği dosyanın gerçekten kullanılan dosya olduğundan emin olabilir.
- Testler kaynak sapması yüzünden kırılmaz.
- Derleme çıktıları kaynak ağacını kirletmez veya kirletiyorsa bu artık kontrollü olur.

## Kapsam Dışı
- Tüm monorepo build zincirini baştan kurmak
- Farklı module system göçü yapmak
- Yeni bundler seçmek

## Dikkat Edilecek Noktalar
- JS dosyalarını kaldırmadan önce bunların herhangi bir runtime veya publish süreci tarafından doğrudan kullanılıp kullanılmadığını doğrula.
- Build veya dev script'leri farkında olmadan kırma.
- Tek bir dosya düzeltmesiyle yetinme; aynı pattern'in repo genelinde tekrarlanıp tekrarlanmadığını kontrol et.

## Kabul Kriterleri
- Sorunlu modülde testler artık stale JS nedeniyle kırılmamalı.
- Kaynak çözümlemesi net ve tekrarlanabilir olmalı.
- Kaynak ağacındaki çift dosya stratejisi bilinçli ve belgelenmiş hale gelmeli.
- Bu sınıftaki hataları erken yakalayacak en azından temel bir koruma bulunmalı.

## Doğrulama Beklentisi
- Mevcut kırık testin artık doğru kaynağı gördüğünü doğrula.
- Repo genelinde benzer çift kaynak riskini kısa bir envanterle kontrol et.
- Seçilen stratejinin nedenini ve etkisini kısa notla açıkla.
