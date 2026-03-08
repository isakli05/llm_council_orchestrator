# Refactor Spec 06
## Konu
Indexer mimarisinde belgelenen/Qdrant varsayılanı ile gerçek çalışma yolunun farklı olması

## Amaç
Indexer ve observability/compose katmanında "hangi vektör depolama stratejisinin gerçekten üretim yolu olduğu" konusunu netleştirmek. Şu an operasyonel yapı Qdrant varmış ve kullanılıyormuş izlenimi veriyor; buna karşılık gerçek arama yolu dosya tabanlı lokal indeks ve in-memory benzerlik hesabı üzerinden ilerliyor.

## Sorun Tanımı
Docker ve readiness tarafında Qdrant'a dair açık izler bulunurken indexer uygulama kodu gerçek veri yolunda farklı bir vektör indeks uygulaması kullanıyor. Bu mimari ayrışma operasyonel beklentileri, kapasite planlamasını ve hata ayıklamayı yanıltıyor. Kullanılan sistem ile kullanıldığı sanılan sistem farklı.

## Kod Üzerinde Doğrulanacak Noktalar
- `docker-compose.yml`
- `apps/indexer/src/api/IndexController.ts`
- `apps/indexer/src/vector_index/VectorIndex.ts`
- `apps/orchestrator/src/server.ts`
- environment/config yapısı

## Neden Kritik
- Operasyon ekibi yanlış bileşeni kritik yol sanabilir.
- Sağlık kontrolleri gerçek veri yolunu değil, kenardaki servisleri işaret edebilir.
- Ölçekleme ve veri dayanıklılığı beklentileri yanlış kurulur.

## Hedef Davranış
- Sistem iki net yoldan birine kavuşmalı:
  - Qdrant gerçekten ana veri yolu olacak
  - ya da lokal vector index ana veri yolu olarak açıkça kabul edilip çevresel konfigürasyon ve health mantığı buna göre düzeltilmeli
- Belgelenen mimari ile gerçek runtime mimarisi uyumlu olmalı.
- Ready/healthy raporu, gerçekten kritik olan bağımlılıkları temsil etmeli.

## Refactor Kapsamı
1. Mevcut durumda Qdrant'ın gerçek sorumluluğunu tespit et: aktif veri yolu mu, opsiyonel gelecek entegrasyon mu, yoksa tarihsel kalıntı mı.
2. Bilinçli bir hedef seç:
   - Qdrant entegrasyonunu gerçekten tamamlamak
   - veya mevcut lokal index yaklaşımını resmi hale getirmek
3. Seçilen hedefe göre config, compose, health ve readiness mantığını hizala.
4. Orchestrator'ın bağımlılık kontrolünü gerçek kritik yol bağımlılıklarına göre yeniden düzenle.
5. Yanlış beklenti oluşturan environment değişkenleri, servis tanımları ve log mesajlarını temizle veya yeniden adlandır.

## Beklenen Mimari Sonuç
- "Sistemin vektör araması aslında neye dayanıyor?" sorusunun tek bir net cevabı olmalı.
- Runtime, deploy ve health davranışı birbirini doğrulamalı.
- Dokümantasyon ve kod arasında mimari çelişki azaltılmalı.

## Kapsam Dışı
- Tüm RAG katmanını baştan yazmak
- Yeni vendor değerlendirmesi yapmak
- Dağıtık cluster mimarisi kurmak

## Dikkat Edilecek Noktalar
- Eğer Qdrant'a geçilecekse veri modeli, collection yönetimi, arama sözleşmesi ve test yüzeyi dikkatle tanımlanmalı.
- Eğer lokal index korunacaksa, bunun üretim sınırlamaları dürüstçe kabul edilmeli ve health mantığı buna göre sadeleştirilmeli.
- Bu refactor yalnızca isim değiştirme olmamalı; gerçek çalışma yolu ile operasyonel yüzey aynı şeyi söylemeli.

## Kabul Kriterleri
- Vektör depolama ve arama mimarisi tek anlamlı hale gelmeli.
- Health/readiness kontrolleri gerçek kritik bağımlılıklarla hizalanmalı.
- Config ve compose davranışı seçilen mimariyi açık biçimde yansıtmalı.
- Entegrasyon veya sistem testleri seçilen yolun çalıştığını doğrulamalı.

## Doğrulama Beklentisi
- Seçilen mimariyi kısa bir teknik not olarak repo içinde görünür kıl.
- Arama/index mutlu yolunu seçilen storage stratejisiyle doğrula.
- Sağlık kontrollerinin artık yanlış pozitif veya yanlış negatif üretmediğini kanıtla.
