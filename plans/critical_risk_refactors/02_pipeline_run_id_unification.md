# Refactor Spec 02
## Konu
API seviyesinde dönen `run_id` ile PipelineEngine içinde üretilen iç `runId` değerinin ayrışması

## Amaç
Pipeline yaşam döngüsünde tekil, tutarlı ve uçtan uca izlenebilir bir çalışma kimliği oluşturmak. Kullanıcıya dönen çalışma kimliği ile engine, progress, status, result ve cancel akışlarında kullanılan kimliğin aynı mantıksal çalışmayı temsil etmesi gerekir.

## Sorun Tanımı
API katmanı bir `run_id` üretip istemciye döndürüyor; ancak engine içinde pipeline başlatılırken yeni bir çalışma kimliği daha üretiliyor. Bu ikili yapı status/progress/result eşlemesini kırabiliyor, tracing ve logging korelasyonunu bozabiliyor ve özellikle cancel/abort gibi yaşam döngüsü işlemlerinde yanlış çalışma bağlamına bakılmasına yol açabiliyor.

## Kod Üzerinde Doğrulanacak Noktalar
- `apps/orchestrator/src/api/PipelineController.ts`
- `apps/orchestrator/src/pipeline/PipelineEngine.ts`
- trace/state/progress store mantığı
- run status ve result retrieval akışları

## Neden Kritik
- Kullanıcıya dönen kimlik güvenilir değilse API sözleşmesi fiilen bozulmuş olur.
- İzleme, hata ayıklama ve operasyonel görünürlük ciddi biçimde zayıflar.
- Uzun süren işlerde yanlış run eşlemesi veri tutarsızlığı ve yanlış raporlama üretir.

## Hedef Davranış
- Pipeline için tek bir otoritatif `run_id` olmalı.
- Bu kimlik API cevabında, tracing bağlamında, progress kayıtlarında, result retrieval'da ve olası iptal akışında aynı değeri taşımalı.
- İç sistemde farklı bir internal correlation id gerekiyorsa bunun amacı açık olmalı ve istemciye dönen `run_id` ile ilişkisi net kurulmalı.

## Refactor Kapsamı
1. Run kimliğinin nerede üretileceğini tek bir otoriteye bağla.
2. Controller ile engine arasındaki sözleşmeyi açık hale getir:
   - kim üretiyor
   - kim taşıyor
   - kim saklıyor
3. State machine, tracing ve progress store tarafında bu kimliğin nasıl işlendiğini tutarlı hale getir.
4. Status, result ve cancel benzeri yaşam döngüsü uçlarının aynı anahtarı kullandığını garanti altına al.
5. Log ve metric etiketlerinde aynı çalışma kimliğinin kullanıldığını doğrula.
6. Geriye dönük kırılma yaratabilecek isimlendirme veya response shape değişikliği gerekiyorsa bunu minimum yüzey alanıyla yap.

## Beklenen Mimari Sonuç
- İstemci tarafından görülen `run_id`, sistemdeki gerçek pipeline çalışmasını temsil eder.
- Aynı run için farklı bileşenlerde farklı kimlikler dolaşmaz.
- Debug ve observability çıktıları bir pipeline çalışmasını baştan sona takip etmeyi mümkün kılar.

## Kapsam Dışı
- Pipeline adımlarını yeniden tasarlamak
- Yeni tracing altyapısı eklemek
- Queue sistemi veya job worker mimarisi kurmak

## Dikkat Edilecek Noktalar
- Run kimliğini normalize ederken mevcut testlerin hangi varsayıma göre yazıldığını dikkatle incele.
- Asenkron çalıştırma, background execution ve abort controller bağlamları arasında kimlik kaybı yaşanmadığından emin ol.
- Eğer trace sistemi ayrıca kendi internal id'sini üretiyorsa bunu kullanıcıya dönen id yerine geçirmemeye dikkat et.

## Kabul Kriterleri
- `runPipeline` cevabındaki `run_id`, progress/result/status akışlarında birebir kullanılabiliyor olmalı.
- Aynı mantıksal çalışma için ikinci bir farklı id üretilmemeli veya üretiliyorsa bunun rolü açıkça ayrılmalı.
- İlgili testler tek bir run kimliği çevresinde yeşil çalışmalı.
- Bir pipeline çalışmasının log ve trace kayıtları kullanıcıya dönen kimlikle eşlenebilir olmalı.

## Doğrulama Beklentisi
- Controller ve engine sınırında test ekle veya mevcut testleri düzelt.
- Status/progress/result retrieval senaryolarını aynı run kimliğiyle doğrula.
- İptal veya hata durumunda da kimlik tutarlılığının bozulmadığını göster.
