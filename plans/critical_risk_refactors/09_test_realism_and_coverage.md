# Refactor Spec 09
## Konu
Test sayısı yüksek görünse de entegrasyon ve e2e testlerinin önemli bölümünün gerçek sistem davranışını yeterince temsil etmemesi

## Amaç
Test katmanının güven verme seviyesini artırmak. Mevcut test sayısı fena değil; ancak bazı entegrasyon ve e2e testleri gerçek servis davranışı yerine mock objeleri veya şekil doğrulamalarını test ediyor. Bu refactor'un amacı test piramidini daha dürüst ve daha faydalı hale getirmektir.

## Sorun Tanımı
Bazı test dosyaları isim olarak entegrasyon veya e2e izlenimi verse de pratikte gerçek HTTP sözleşmesini, servisler arası etkileşimi veya kalıcı durum davranışını doğrulamıyor. Buna ek olarak mevcut test kırıkları bazı yapısal sorunları açığa çıkarıyor: auth beklentileri, enum uyumsuzlukları, stale kaynak çözümlemesi ve eksik entegrasyon sınırları.

## Kod Üzerinde Doğrulanacak Noktalar
- `tests/e2e/full-workflow.e2e.test.ts`
- `tests/integration/orchestrator-indexer.integration.test.ts`
- `apps/indexer/src/server.test.ts`
- `apps/orchestrator/src/__tests__/PipelineEngine.test.ts`
- test config ve script yapısı

## Neden Kritik
- Yüksek test sayısı yanlış güven duygusu yaratabilir.
- Sistemler arası sözleşme bozuklukları gerçek ortama kadar fark edilmeyebilir.
- Refactor sonrası güvenle değişiklik yapabilmek için testlerin temsil gücü artmalıdır.

## Hedef Davranış
- "Integration" ve "e2e" adı taşıyan testler gerçekten daha yüksek gerçeklik seviyesinde doğrulama yapmalı.
- Mock kullanımı tamamen kaldırılmak zorunda değil; ancak test türü ile gerçeklik seviyesi dürüst biçimde eşleşmeli.
- Kırık testler ya doğru sisteme göre düzeltilmeli ya da yanlış kategori altında oldukları kabul edilerek yeniden yapılandırılmalı.

## Refactor Kapsamı
1. Mevcut testleri gerçeklik seviyesine göre yeniden sınıflandır:
   - unit
   - component/service
   - integration
   - e2e
2. İsmi entegrasyon/e2e olan ama gerçekte mock şekil testi yapan dosyaları düzelt, taşı veya yeniden adlandır.
3. En kritik sözleşmeler için gerçekten anlamlı testler ekle:
   - orchestrator HTTP API
   - orchestrator-indexer etkileşimi
   - bridge-orchestrator sözleşmesi varsa ilgili mutlu yol
   - pipeline status/result/progress akışı
4. Mevcut kırık testleri yalnızca "beklentiyi gevşeterek" değil, sistem davranışıyla hizalayarak düzelt.
5. Auth, enum ve runtime çözümleme gibi test kırıklarının kök nedenini ayrı ayrı ele al.
6. Test raporlamasında hangi testlerin gerçek entegrasyon sağladığı görünür hale gelsin.

## Beklenen Mimari Sonuç
- Test katmanı değişikliklerden sonra daha güvenilir sinyal vermeli.
- En kritik sözleşmeler için regresyon yakalama gücü artmalı.
- Test isimleri ile testlerin gerçekten yaptığı şey birbirine uymalı.

## Kapsam Dışı
- Yüzde yüz kapsam hedeflemek
- Büyük performans test altyapısı kurmak
- Tüm testleri tek seferde yeniden yazmak

## Dikkat Edilecek Noktalar
- Mock kullanımını ideolojik olarak sıfırlamaya çalışma; amaç gerçekliği doğru seviyede kurmak.
- Testleri yavaşlatan entegrasyonlar için minimum ama anlamlı fixture stratejisi belirle.
- Başarısız testleri yeşile çevirmek tek başına başarı değildir; isimlendirme ve gerçeklik seviyesi de düzelmeli.

## Kabul Kriterleri
- En kritik entegrasyon sözleşmeleri gerçekçi testlerle kapsanmalı.
- Yanlış kategorilenmiş testler daha dürüst bir yapıya taşınmalı.
- Mevcut kırık testlerin kök nedenleri çözülmüş olmalı veya açıkça sınırlandırılmış olmalı.
- Test raporu ekip için daha anlamlı hale gelmeli.

## Doğrulama Beklentisi
- Hangi testlerin yeniden sınıflandığını açıkça raporla.
- Yeni veya düzeltilmiş testlerin hangi kritik davranışı koruduğunu belirt.
- Refactor sonrası test koşusunun hangi bölümünün gerçek entegrasyon güvencesi verdiğini net şekilde özetle.
