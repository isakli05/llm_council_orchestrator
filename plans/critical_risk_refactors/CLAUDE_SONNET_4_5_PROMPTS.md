# Claude Sonnet 4.5 Başlangıç Promptları

Bu dosyada, her refactor dökümanı için ayrı başlangıç promptu bulunur. Her prompt ilgili oturumda, ilgili dökümanla birlikte kullanılmalıdır.

Bu refactor özelinde tüm testler başarılı bir şekilde sonuçlandığında refactor başarılı sayılır!!


Tüm işlemler senior developer yaklaşımı ile Fortune 500 seviyesinde production-grade olacak şekilde yapılmalıdır!!!!
Test komutlarını pnpm ile çalıştır

## Prompt 01
İlgili döküman: `plans/critical_risk_refactors/01_model_gateway_adapter_registration.md`

Bu repoda yalnızca gerçek kodu okuyarak çalış. Önce `plans/critical_risk_refactors/01_model_gateway_adapter_registration.md` dökümanını oku, sonra sorunu gerçekten kod üzerinde doğrula. Dökümandaki kapsam dışına çıkma, çözümü geçici workaround ile yamalama, örnek/demo kod üretme veya mimariyi keyfi biçimde büyütme. Sorunun kök nedenini tespit et, gerekli refactor'u uygula, ilgili testleri ekle/güncelle ve en sonda tam olarak hangi dosyalarda neyi neden değiştirdiğini, hangi testleri çalıştırdığını, hangi risklerin kaldığını kod çıktısı vermeden açıkça raporla.

Bu refactor özelinde tüm testler başarılı bir şekilde sonuçlandığında refactor başarılı sayılır!!


Tüm işlemler senior developer yaklaşımı ile Fortune 500 seviyesinde production-grade olacak şekilde yapılmalıdır!!!!
Test komutlarını pnpm ile çalıştır

## Prompt 02
İlgili döküman: `plans/critical_risk_refactors/02_pipeline_run_id_unification.md`

Bu repoda yalnızca gerçek kodu okuyarak çalış. Önce `plans/critical_risk_refactors/02_pipeline_run_id_unification.md` dökümanını oku, sonra API ile pipeline engine arasındaki `run_id` akışını uçtan uca doğrula. Dökümandaki hedef davranıştan sapma, gereksiz yeni altyapı ekleme veya yüzeysel test düzeltmesi yapma. Tekil ve tutarlı bir çalışma kimliği modeli kur, ilgili controller/engine/state/test katmanlarını hizala ve iş bittikten sonra değişiklik gerekçelerini, doğrulama adımlarını ve kalan sınırlamaları kod çıktısı vermeden açıkça raporla.

Bu refactor özelinde tüm testler başarılı bir şekilde sonuçlandığında refactor başarılı sayılır!!


Tüm işlemler senior developer yaklaşımı ile Fortune 500 seviyesinde production-grade olacak şekilde yapılmalıdır!!!!
Test komutlarını pnpm ile çalıştır

## Prompt 03
İlgili döküman: `plans/critical_risk_refactors/03_pipeline_index_metadata_enrichment.md`

Bu repoda yalnızca gerçek kodu okuyarak çalış. Önce `plans/critical_risk_refactors/03_pipeline_index_metadata_enrichment.md` dökümanını oku, sonra discovery motoruna pipeline içinden gerçekten hangi metadata'nın aktarıldığını kod üzerinde doğrula. Placeholder veya boş metadata taşıyan akışı düzelt, indexer ile orchestrator arasındaki veri sözleşmesini kontrollü biçimde iyileştir ve discovery kalitesini yükseltecek refactor'u uygula. Çözüm sonunda hangi verilerin artık gerçekten taşındığını, hangi testleri eklediğini/güncellediğini ve varsa hangi sınırlamaların sürdüğünü kod çıktısı vermeden açıkça raporla.

Bu refactor özelinde tüm testler başarılı bir şekilde sonuçlandığında refactor başarılı sayılır!!


Tüm işlemler senior developer yaklaşımı ile Fortune 500 seviyesinde production-grade olacak şekilde yapılmalıdır!!!!
Test komutlarını pnpm ile çalıştır

## Prompt 04
İlgili döküman: `plans/critical_risk_refactors/04_pipeline_final_result_completion.md`

Bu repoda yalnızca gerçek kodu okuyarak çalış. Önce `plans/critical_risk_refactors/04_pipeline_final_result_completion.md` dökümanını oku, sonra pipeline içinde üretilen aggregate/final report ile istemciye dönen sonuç arasındaki farkı gerçek kodda doğrula. Placeholder kalan step ve result mantığını yüzeysel makyajla değil, gerçek çıktı zincirini tamamlayacak şekilde refactor et. Değişikliklerden sonra final result'ın neyi içerdiğini, hangi placeholder davranışların kaldırıldığını veya açık hale getirildiğini ve bunu nasıl doğruladığını kod çıktısı vermeden açıkça raporla.

Bu refactor özelinde tüm testler başarılı bir şekilde sonuçlandığında refactor başarılı sayılır!!


Tüm işlemler senior developer yaklaşımı ile Fortune 500 seviyesinde production-grade olacak şekilde yapılmalıdır!!!!
Test komutlarını pnpm ile çalıştır

## Prompt 05
İlgili döküman: `plans/critical_risk_refactors/05_mcp_bridge_api_alignment.md`

Bu repoda yalnızca gerçek kodu okuyarak çalış. Önce `plans/critical_risk_refactors/05_mcp_bridge_api_alignment.md` dökümanını oku, sonra MCP bridge ile orchestrator arasındaki HTTP sözleşmesini uçtan uca doğrula. Yanlış endpoint, yanlış port, eksik route veya uyumsuz response shape varsa bunları tek tek tespit et ve döküman kapsamına sadık kalarak refactor et. Çalışma sonunda bridge'in hangi capability'lerinin gerçekten desteklendiğini, hangilerinin hizalandığını, hangilerinin kapsam dışında bırakıldığını ve bunu hangi testlerle doğruladığını kod çıktısı vermeden açıkça raporla.

Bu refactor özelinde tüm testler başarılı bir şekilde sonuçlandığında refactor başarılı sayılır!!


Tüm işlemler senior developer yaklaşımı ile Fortune 500 seviyesinde production-grade olacak şekilde yapılmalıdır!!!!
Test komutlarını pnpm ile çalıştır

## Prompt 06
İlgili döküman: `plans/critical_risk_refactors/06_indexer_qdrant_alignment.md`

Bu repoda yalnızca gerçek kodu okuyarak çalış. Önce `plans/critical_risk_refactors/06_indexer_qdrant_alignment.md` dökümanını oku, sonra Qdrant'ın gerçek veri yolunda mı yoksa yalnızca çevresel/operasyonel seviyede mi yer aldığını kod ve config üzerinde doğrula. Dökümanda tarif edilen iki yoldan birini bilinçli seçerek mimariyi hizala; belirsiz, yarım veya ikili durum bırakma. Çalışma sonunda seçtiğin yönü, hangi dosyalarda nasıl hizalama yaptığını, health/readiness davranışının nasıl değiştiğini ve hangi test/doğrulama adımlarını tamamladığını kod çıktısı vermeden açıkça raporla.

Bu refactor özelinde tüm testler başarılı bir şekilde sonuçlandığında refactor başarılı sayılır!!


Tüm işlemler senior developer yaklaşımı ile Fortune 500 seviyesinde production-grade olacak şekilde yapılmalıdır!!!!
Test komutlarını pnpm ile çalıştır

## Prompt 07
İlgili döküman: `plans/critical_risk_refactors/07_indexer_persistence_integrity.md`

Bu repoda yalnızca gerçek kodu okuyarak çalış. Önce `plans/critical_risk_refactors/07_indexer_persistence_integrity.md` dökümanını oku, sonra indexer persistence akışında delete/update/reload senaryolarını kod üzerinde doğrula. Silinen dosyalardan kalan stale kayıtları ve yeniden yüklemede boşalan chunk içeriklerini kök neden düzeyinde çöz; geçici temizlik veya yüzeysel patch yapma. İş bitince veri bütünlüğünü nasıl sağladığını, hangi senaryoları test ettiğini ve geriye dönük uyumlulukla ilgili kalan notları kod çıktısı vermeden açıkça raporla.

Bu refactor özelinde tüm testler başarılı bir şekilde sonuçlandığında refactor başarılı sayılır!!


Tüm işlemler senior developer yaklaşımı ile Fortune 500 seviyesinde production-grade olacak şekilde yapılmalıdır!!!!
Test komutlarını pnpm ile çalıştır

## Prompt 08
İlgili döküman: `plans/critical_risk_refactors/08_ts_js_source_deduplication.md`

Bu repoda yalnızca gerçek kodu okuyarak çalış. Önce `plans/critical_risk_refactors/08_ts_js_source_deduplication.md` dökümanını oku, sonra kaynak ağaçta birlikte duran `.ts` ve `.js` dosyalarının gerçek etkisini doğrula. Tekil kaynak stratejisini netleştir, stale JS dosyalarının runtime/test davranışını gölgelemesini engelle ve çözümünü yalnızca tek dosya düzeyinde bırakma. Çalışma sonunda hangi çift kaynakların temizlendiğini veya yeniden organize edildiğini, çözümleme davranışının nasıl güvence altına alındığını ve hangi doğrulamaları yaptığını kod çıktısı vermeden açıkça raporla.

Bu refactor özelinde tüm testler başarılı bir şekilde sonuçlandığında refactor başarılı sayılır!!


Tüm işlemler senior developer yaklaşımı ile Fortune 500 seviyesinde production-grade olacak şekilde yapılmalıdır!!!!
Test komutlarını pnpm ile çalıştır

## Prompt 09
İlgili döküman: `plans/critical_risk_refactors/09_test_realism_and_coverage.md`

Bu repoda yalnızca gerçek kodu okuyarak çalış. Önce `plans/critical_risk_refactors/09_test_realism_and_coverage.md` dökümanını oku, sonra entegrasyon ve e2e olarak adlandırılan testlerin gerçekten neyi doğruladığını kod üzerinde incele. Sadece testleri yeşile çevirmekle yetinme; test kategorisi ile gerçeklik seviyesini hizala, kritik sözleşmeler için anlamlı doğrulamalar ekle ve yanıltıcı test isimlendirmesini temizle. Çalışma sonunda hangi testleri yeniden sınıflandırdığını, hangi kritik davranışları artık gerçekten koruduğunu ve kalan test boşluklarını kod çıktısı vermeden açıkça raporla.
