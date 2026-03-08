# Refactor Spec 03
## Konu
Discovery aşamasına gerçek index metadata yerine boş veya zayıf metadata aktarılması

## Amaç
Pipeline içindeki index adımının gerçekten faydalı keşif verisi üretmesini sağlamak. Discovery motoru, klasör yapısı, uzantı dağılımı, framework ipuçları, bağımlılıklar ve dosya karakteristikleri gibi sinyallere ihtiyaç duyuyor; fakat mevcut akış bu motoru çoğu zaman anlamsız veya boş metadata ile besliyor.

## Sorun Tanımı
Discovery motoru güçlü analiz kurallarına sahip görünse de pipeline içinden gelen metadata alanları boş koleksiyonlar veya sabit varsayılan değerlerle dolduruluyor. Bu durum, discovery katmanının tasarım kapasitesi ile fiili runtime davranışı arasında ciddi bir fark yaratıyor. Sonuçta domain discovery, classification ve downstream analysis kalitesi gerçek kod tabanı potansiyelinin altında kalıyor.

## Kod Üzerinde Doğrulanacak Noktalar
- `apps/orchestrator/src/pipeline/PipelineEngine.ts`
- `apps/orchestrator/src/discovery/DomainDiscoveryEngine.ts`
- indexer'dan dönen response şekli
- gerekiyorsa index metadata tip tanımları

## Neden Kritik
- Discovery kalitesi bozulursa sonraki analiz katmanları yanlış bağlam üstüne inşa edilir.
- Domain ve framework tespiti eksik olursa role prompt'ları ve aggregation çıktıları zayıflar.
- Bu sorun görünürde çalışan ama düşük doğrulukta sonuç üreten "sessiz kalite hatası"dır.

## Hedef Davranış
- Index adımının çıktısı discovery için anlamlı metadata taşımalı.
- Discovery engine, gerçek tarama bulgularını kullanarak sinyal puanlama ve sınıflandırma yapmalı.
- Metadata yoksa bunun sebebi açık olmalı; sahte dolu veri veya boş maskelenmiş yapı olmamalı.

## Refactor Kapsamı
1. Index adımında üretilen veya erişilebilen gerçek metadata kaynaklarını tespit et.
2. Pipeline ile discovery engine arasındaki veri sözleşmesini netleştir:
   - toplam dosya ve chunk sayıları
   - uzantı dağılımı
   - dizin yapısı
   - framework/dependency tespiti
   - gerekliyse dil veya proje tipi sinyalleri
3. Şu an boş bırakılan metadata alanlarını gerçek veriyle doldur ya da veri yoksa bunu açıkça işaretleyen güvenilir bir mekanizma kur.
4. Discovery motorunun "boş metadata" ile "metadata yok" durumlarını ayırt edebilmesini sağla.
5. Eğer indexer mevcut response ile gerekli bilgiyi dönmüyorsa sözleşmeyi kontrollü biçimde genişlet.
6. Bu iyileştirmenin performansı gereksiz yere bozmadığından emin ol; discovery için gerekli en küçük ama anlamlı veri setini hedefle.

## Beklenen Mimari Sonuç
- Discovery akışı artık gerçek repository sinyallerinden beslenir.
- Domain tespiti ve sınıflandırma, placeholder veri yerine indeksleme çıktısına dayanır.
- Pipeline içindeki sonraki analiz adımları daha tutarlı bağlamla çalışır.

## Kapsam Dışı
- Discovery algoritmasını baştan yazmak
- Yeni semantik arama motoru eklemek
- Tüm indexer mimarisini tek seferde değiştirmek

## Dikkat Edilecek Noktalar
- Metadata sözleşmesini büyütürken orchestrator ile indexer arasında sürüm uyumsuzluğu yaratma.
- Büyük repolarda gereksiz ağır hesap yapma; discovery için gerekli olan veri ile nice-to-have veriyi ayır.
- Mevcut testlerde sahte metadata ile kurulan varsayımları dikkatle gözden geçir.

## Kabul Kriterleri
- Pipeline index adımı sonrasında discovery motoru boş/sabit placeholder metadata almamalı.
- Discovery ile kullanılan metadata alanları gerçek index bulgularını yansıtmalı.
- Domain discovery kalitesini doğrulayan en azından birkaç anlamlı test veya fixture senaryosu olmalı.
- Metadata bulunamadığında sistem bunun nedenini görünür kılmalı.

## Doğrulama Beklentisi
- Index response ve discovery input eşleşmesini test et.
- Küçük ama farklı yapıda örnek repo/fixture'lar ile framework ve domain sinyallerinin taşındığını doğrula.
- Refactor sonrası discovery çıktısında placeholder kaynaklı kalite kaybının giderildiğini raporla.
