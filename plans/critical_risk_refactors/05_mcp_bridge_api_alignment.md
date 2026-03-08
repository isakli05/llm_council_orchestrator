# Refactor Spec 05
## Konu
MCP bridge ile orchestrator HTTP API sözleşmesinin uyumsuz olması

## Amaç
MCP bridge'in orchestrator ile gerçekten konuşabilmesini sağlamak. Mevcut durumda endpoint path'leri, port varsayımları ve bazı yaşam döngüsü operasyonları orchestrator'ın gerçek API yüzeyiyle hizalı görünmüyor.

## Sorun Tanımı
Bridge tarafındaki adapter belirli path'lere ve varsayılan porta göre istek atıyor; ancak orchestrator servisinin gerçek route yapısı farklı. Buna ek olarak bridge bazı işlemleri destekleniyormuş gibi modelleyebilirken orchestrator tarafında ilgili route kayıtlı olmayabiliyor. Bu durum, MCP katmanını entegrasyon açısından kırık hale getiriyor.

## Kod Üzerinde Doğrulanacak Noktalar
- `apps/mcp_bridge/src/server.ts`
- `apps/mcp_bridge/src/adapter/OrchestratorAdapter.ts`
- `apps/orchestrator/src/server.ts`
- `apps/orchestrator/src/api/PipelineController.ts`
- index ve spec endpoint'leri

## Neden Kritik
- MCP bridge dış entegrasyon kapısıysa, bu uyumsuzluk üst istemciyi tamamen bloke eder.
- Görünürde mevcut olan bridge katmanı aslında çalışmayan bir adaptasyon katmanına dönüşür.
- Bu sorun kullanıcı deneyiminde "sistem var ama bağlanmıyor" türü güven kırıcı bir hataya yol açar.

## Hedef Davranış
- Bridge, orchestrator'ın gerçek base URL, port ve route yapısıyla tam uyumlu olmalı.
- Run, progress, result, index ve spec ilişkili çağrılar doğru endpoint'lere gitmeli.
- Orchestrator tarafında bulunmayan bir yetenek bridge üzerinden varmış gibi sunulmamalı.

## Refactor Kapsamı
1. Bridge adapter ile orchestrator route tanımlarını uçtan uca karşılaştır.
2. Base URL, varsayılan port, prefix ve endpoint path'lerini tek bir doğru sözleşmede hizala.
3. Bridge'in sunduğu her işlemin orchestrator'da gerçek bir karşılığı olup olmadığını doğrula.
4. Eksik route varsa iki seçenekten birini bilinçli seç:
   - orchestrator tarafında gerçek route'u ekle
   - bridge tarafında o capability'yi devre dışı bırak veya açık şekilde unsupported yap
5. Request/response shape'lerini ve hata davranışlarını hizala.
6. Health, timeout ve connection hata senaryolarını bridge açısından anlamlı hale getir.

## Beklenen Mimari Sonuç
- MCP bridge artık "teorik" değil, fiilen kullanılabilir bir integration adapter haline gelmeli.
- Endpoint sözleşmesi tek anlamlı kaynak üzerinden okunabilir olmalı.
- Yanlış port veya yanlış route varsayımları yüzünden sessiz başarısızlık yaşanmamalı.

## Kapsam Dışı
- Yeni MCP capability tasarlamak
- Tamamen yeni taşıma protokolü kurmak
- VS Code istemcisi eklemek

## Dikkat Edilecek Noktalar
- Bridge ile orchestrator arasındaki sözleşmeyi sabit string dağınıklığından çıkarıp daha bakımı kolay hale getirmeyi değerlendir.
- Cancel/abort gibi yaşam döngüsü uçları özellikle dikkat gerektirir; path var gibi görünüp gerçekte kayıtlı olmayabilir.
- Geriye dönük uyumluluk gerekecekse bunu açıkça not et.

## Kabul Kriterleri
- Bridge'in çağırdığı endpoint'ler orchestrator'da gerçekten var olmalı.
- Varsayılan bağlantı ayarları geliştirme ortamında çalışır olmalı.
- Run/progress/result/index/spec akışları anlamlı entegrasyon testleriyle doğrulanmalı.
- Desteklenmeyen capability varsa bu açık ve deterministik bir biçimde belirtilmeli.

## Doğrulama Beklentisi
- Gerçek HTTP sözleşmesini esas alan entegrasyon testi ekle veya güncelle.
- Hatalı URL, eksik route ve başarısız servis senaryolarını doğrula.
- Bridge'in orchestrator ile minimum mutlu yol senaryosunu başarıyla tamamladığını kanıtla.
