# Refactor Spec 01
## Konu
ModelGateway provider adapter kaydının eksik olması nedeniyle gerçek model çağrılarının kırılması

## Amaç
Orchestrator içindeki model çağrı katmanını gerçekten çalışır hale getirmek. Mevcut durumda provider adapter sınıfları kod tabanında mevcut olsa da gateway bunları güvenilir biçimde kaydetmediği için runtime'da gerçek LLM çağrıları başlatılamıyor. Bu refactor'un amacı, provider kaydını merkezi, doğrulanabilir ve test edilebilir hale getirmektir.

## Sorun Tanımı
Kod tabanında `ModelGateway` adapter map'leri oluşturuyor, provider kayıt fonksiyonu da tanımlı; ancak gerçek başlatma akışında adapter kayıtlarının yapıldığına dair güvenilir bir entegrasyon yok. Sonuç olarak bir provider üzerinden çağrı yapılmaya çalışıldığında gateway ilgili adapter'ı bulamıyor ve akış "adapter kayıtlı değil" hatasıyla sonlanabiliyor.

## Kod Üzerinde Doğrulanacak Noktalar
- `apps/orchestrator/src/models/ModelGateway.ts`
- `apps/orchestrator/src/models/adapters/`
- repo genelinde `registerProvider(` çağrıları
- orchestrator başlatma akışında model katmanının nasıl inşa edildiği

## Neden Kritik
- Bu sorun çözülmeden çoklu model konseyi mantığı fiilen çalışmaz.
- Pipeline, role manager ve aggregator katmanları teoride hazır görünse bile gerçek provider çağrısı başarısız olur.
- Bu, ürünün temel değer önermesini doğrudan bloke eden bir çekirdek entegrasyon hatasıdır.

## Hedef Davranış
- Orchestrator açıldığında desteklenen provider adapter'ları deterministik biçimde register edilmiş olmalı.
- Adapter kaydı config tabanlı ve gözlemlenebilir olmalı.
- İlgili provider kapalıysa, yanlış konfigüre edildiyse veya API anahtarı eksikse sistem bunu açık hata mesajı ve/veya health durumu ile göstermeli.
- `ModelGateway` içinden yapılan çağrılar, aktif provider için her zaman doğru adapter'a yönlenmeli.

## Refactor Kapsamı
1. `ModelGateway` yaşam döngüsünü incele ve adapter kayıt stratejisini tek bir merkezi akışta topla.
2. Provider etkinleştirme bilgisini mevcut config yapısıyla hizala; desteklenen sağlayıcıların hangilerinin runtime'da aktif olacağı koddan türetilsin.
3. Adapter oluşturma, kayıt ve doğrulama mantığını "kısmen register edildi / kısmen edilmedi" gibi belirsiz ara durumlar üretmeyecek şekilde netleştir.
4. Başlatma anında minimum doğrulama katmanı ekle:
   - tanımlı provider var mı
   - adapter instance üretilebiliyor mu
   - provider enum/değer eşleşmeleri tutarlı mı
5. Hata mesajlarını operasyonel olarak anlamlı hale getir:
   - config hatası
   - eksik secret
   - desteklenmeyen provider
   - adapter init hatası
6. Bu refactor'u role manager, pipeline veya controller seviyesinde geçici workaround ile değil, model katmanının kendi sınırları içinde çöz.

## Beklenen Mimari Sonuç
- Provider kayıt sorumluluğu tek yerde olmalı.
- Gateway kullanım öncesi hazır olmalı.
- Adapter kayıtları koddan ve testten izlenebilir olmalı.
- Yeni provider eklemek için yalnızca adapter + config + merkezi register akışına dokunmak yeterli olmalı.

## Kapsam Dışı
- Yeni provider eklemek
- Prompt mühendisliği değiştirmek
- Model seçim stratejisini yeniden tasarlamak
- Rate limit, retry veya token accounting mimarisini baştan yazmak

## Dikkat Edilecek Noktalar
- Çözüm, testlerde manuel mock kaydı gerektiriyorsa üretim kodu için ayrı, test için ayrı açık bir strateji tanımla.
- Adapter'ların varlığı ile kullanılabilirliği aynı şey değildir; eksik anahtar veya kapalı provider durumunu ayrı ele al.
- Config dosyasında tanımlı ama runtime'da devre dışı bırakılmış provider'lar için sessiz başarısızlık üretme.

## Kabul Kriterleri
- En az bir gerçek provider akışında gateway artık "adapter kayıtlı değil" hatasına düşmemeli.
- Desteklenen provider'lar başlatma sırasında güvenilir biçimde kaydedilmeli.
- Yanlış provider veya eksik kayıt senaryoları anlamlı hata ile sonuçlanmalı.
- Bu davranışı doğrulayan birim testleri ve gerekiyorsa entegrasyon testleri bulunmalı.
- Refactor sonrasında provider kayıt mantığını anlamak için dağınık dosya takibi gerekmemeli.

## Doğrulama Beklentisi
- İlgili testleri güncelle veya ekle.
- ModelGateway için başarı ve hata senaryolarını ayrı ayrı doğrula.
- Orchestrator'ın gerçek runtime init akışında gateway'nin hazır hale geldiğini kanıtla.
- Eğer mevcut test altyapısı yetersizse, bunu not et ama refactor'u test edilebilir hale getirecek minimum düzenlemeyi de yap.
