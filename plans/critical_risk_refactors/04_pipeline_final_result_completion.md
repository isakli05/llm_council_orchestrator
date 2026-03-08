# Refactor Spec 04
## Konu
Pipeline aggregate adımı çalışsa bile final sonuç nesnesinin hâlâ placeholder özet dönmesi

## Amaç
Pipeline sonunda istemciye dönen veriyi gerçek analiz çıktısına bağlamak. Mevcut yapı, çok adımlı analiz ve aggregate sürecini yürütse bile son kullanıcıya veya üst katmanlara verilen final result nesnesi hâlâ eksik, placeholder veya düşük değerli özet veriye sıkışıyor.

## Sorun Tanımı
Pipeline içinde aggregate/final report benzeri veri üretiliyor; ancak dışarıya dönen final sonuç bununla tutarlı değil. Bazı step türleri hâlâ placeholder başarı dönüyor ve sonuç toplama mantığı nihai ürün değerini temsil edecek kadar tamamlanmış görünmüyor. Bu, güçlü iç işlem hattısına rağmen zayıf handoff çıktısı oluşmasına neden oluyor.

## Kod Üzerinde Doğrulanacak Noktalar
- `apps/orchestrator/src/pipeline/PipelineEngine.ts`
- aggregate step uygulaması
- final result construction mantığı
- spec generation ve refinement adımlarının gerçek/placeholder durumu
- `apps/orchestrator/src/api/SpecController.ts`
- `apps/orchestrator/src/discovery/DomainSpecWriter.ts`

## Neden Kritik
- Kullanıcı açısından ürün değeri final çıktıda görünür.
- İçeride yapılan tüm analizler placeholder sonuç yüzünden kullanılamaz hale gelebilir.
- Spec üretimi hedeflenen ürün vaadinin merkezinde olduğundan bu eksiklik doğrudan iş değeri kaybıdır.

## Hedef Davranış
- Pipeline sonucu, aggregate edilen gerçek bulguları taşımalı.
- Final result içinde anlamlı analiz özeti, kararlar, riskler, domain bilgisi ve gerekiyorsa spec/handoff referansları bulunmalı.
- Placeholder step'ler ya gerçek uygulamaya kavuşmalı ya da açık biçimde "henüz desteklenmiyor" olarak dış yüzeye yansıtılmalı.

## Refactor Kapsamı
1. Aggregate aşamasında üretilen veri ile dışarı dönen final result nesnesi arasındaki kopukluğu gider.
2. Final result şemasını netleştir:
   - hangi alanlar zorunlu
   - hangi alanlar opsiyonel
   - hangi alanlar step output'lardan türetiliyor
3. `aggregateResults` veya eşdeğer sonuç sentezleme mantığını gerçek çıktıları taşıyacak şekilde tamamla.
4. Placeholder kalan adımları sınıflandır:
   - hemen tamamlanacak olanlar
   - bu refactor kapsamında devre dışı bırakılması daha doğru olanlar
5. Spec generation hattı ile pipeline çıktısı arasında anlamlı bir bağ kur; statik dosya servis eden ayrı controller davranışı ile pipeline sonuçları arasındaki ilişkiyi netleştir.
6. İstemciye dönen sonucun "işe yarar handoff" seviyesinde olduğundan emin ol.

## Beklenen Mimari Sonuç
- Pipeline sonucu yalnızca step durumlarının listesi olmaktan çıkmalı.
- Final result gerçek analiz sentezini, riskleri ve tavsiyeleri taşımalı.
- Spec üretimi bu aşamada tamamen bitmeyecekse bile final output bunun ne kadarının hazır olduğunu açık söylemeli.

## Kapsam Dışı
- Tüm ürün vizyonunu tek refactor ile tamamlama
- VS Code extension geliştirme
- Yeni output formatları ekleme

## Dikkat Edilecek Noktalar
- Result şemasını değiştirirken mevcut API tüketicilerini dikkate al.
- Placeholder davranışları sessizce koruma; ya tamamla ya görünür şekilde sınırlandır.
- Aggregate katmanında eksik veri varsa bunu downstream tarafında gizlemeye çalışma.

## Kabul Kriterleri
- Final result artık gerçek aggregate veriyi yansıtmalı.
- Sonuç nesnesi kullanıcıya anlamlı karar desteği sunmalı.
- Placeholder step kaynaklı sahte başarı algısı azaltılmalı.
- Pipeline sonucu ile spec/handoff katmanı arasındaki ilişki kodda anlaşılır hale gelmeli.

## Doğrulama Beklentisi
- Pipeline sonuç testlerini güncelle.
- Aggregate üretilen veri ile dönen result arasındaki eşleşmeyi doğrula.
- Başarılı ve kısmi/eksik senaryolarda sonucun nasıl davrandığını açıkça raporla.
