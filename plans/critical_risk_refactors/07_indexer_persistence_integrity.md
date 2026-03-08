# Refactor Spec 07
## Konu
Indexer persistence bütünlüğünün zayıf olması: silinen dosyaların temizlenmemesi ve yeniden yüklemede chunk içeriğinin kaybolması

## Amaç
Indexer'ın kalıcı durumunu güvenilir hale getirmek. Dosya tabanı değiştiğinde indeksin de doğru evrimleşmesi ve servis yeniden başlatıldığında arama/bağlam kalitesinin bozulmaması gerekir.

## Sorun Tanımı
Mevcut akışta silinen dosyaların chunk kayıtları vektör indeksinden temizlenmiyor. Buna ek olarak persistence katmanı yeniden yüklendiğinde bazı chunk'lar içeriksiz biçimde geri kuruluyor. Bu iki problem birlikte zaman içinde indeksin kirlenmesine, bağlam getirim kalitesinin düşmesine ve arama sonuçlarının güvenilirliğinin bozulmasına yol açıyor.

## Kod Üzerinde Doğrulanacak Noktalar
- `apps/indexer/src/api/IndexController.ts`
- `apps/indexer/src/vector_index/VectorIndex.ts`
- persistence/load/save mantığı
- hash state ve delete/update akışları

## Neden Kritik
- RAG ve discovery kalitesi doğrudan indeks bütünlüğüne bağlıdır.
- Zaman içinde yanlış, stale veya içeriksiz kayıtlar birikirse sonuçlar sessizce bozulur.
- Bu sorun tek seferlik hata değil; repo her güncellendiğinde biriken veri bozulması riskidir.

## Hedef Davranış
- Silinen dosyaların ilişkili chunk ve embedding kayıtları tutarlı biçimde kaldırılmalı.
- Güncellenen dosyalar eski kayıtları sızdırmamalı.
- Persistence reload sonrasında arama için gerekli veri eksiksiz geri yüklenmeli.
- İndeks durumu yeniden başlatma sonrasında anlamlı kalite kaybı yaşamamalı.

## Refactor Kapsamı
1. Dosya silme/güncelleme yaşam döngüsünü tam incele ve indeks üzerindeki etkisini netleştir.
2. Vector index içinde kayıtların dosya veya chunk kökenine göre izlenmesini güvenilir hale getir.
3. Delete senaryosunda stale kayıt bırakmayan bir temizleme akışı kur.
4. Persistence formatını ve load/save mantığını gözden geçir; arama için gerekli minimum veri setinin gerçekten saklandığından emin ol.
5. Restart sonrası içeriksiz chunk oluşumunu ortadan kaldır.
6. Hash, dosya durumu ve vector kayıtları arasındaki tutarlılığı doğrulayan testler ekle.

## Beklenen Mimari Sonuç
- Indexer kalıcı durumu yaşayan bir repo üzerinde güvenilir davranmalı.
- Restart veya yeniden index sonrası sonuç kalitesi dramatik biçimde değişmemeli.
- Arama, stale veri ya da boş chunk etkisiyle bozulmamalı.

## Kapsam Dışı
- Tamamen yeni veritabanı tasarlamak
- Büyük mimari göç yapmak
- Semantik ranker katmanı eklemek

## Dikkat Edilecek Noktalar
- Performans için doğruluğu feda etme; özellikle delete/update senaryolarında veri bütünlüğü öncelikli.
- Persistence formatı değişirse geriye dönük uyumluluk veya migration ihtiyacını değerlendir.
- Arama sonucunda content alanı boş dönüyorsa, bunun sistemin başka katmanlarında neyi kırdığını da göz önüne al.

## Kabul Kriterleri
- Silinen dosyalar indeks içinde stale kayıt bırakmamalı.
- Restart sonrası chunk content ve arama kalitesi korunmalı.
- Update, delete ve reload senaryoları testle kapsanmalı.
- İndeks durumunun dosya sistemi ile tutarsız kalması zorlaştırılmalı.

## Doğrulama Beklentisi
- Küçük fixture repo üzerinde ekle, güncelle, sil ve yeniden başlat senaryolarını çalıştır.
- Aynı sorgunun restart öncesi ve sonrası benzer kaliteyle sonuç verdiğini doğrula.
- Persistence değişikliğinin hangi format/alanları etkilediğini kısa notla açıkla.
