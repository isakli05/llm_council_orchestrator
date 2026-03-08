# Kritik Risk Refactor Dökümanları

Bu klasör, proje inceleme raporunda "Kritik Riskler ve Blokajlar" altında tespit edilen maddeler için ayrı ayrı hazırlanmış geliştirme/refactor talimat dökümanlarını içerir.

Hazırlanma prensibi:
- Her döküman gerçek kod tabanı üzerinden tespit edilen bir soruna odaklanır.
- Her döküman tek oturumda tek bir modeli yönlendirecek şekilde yazılmıştır.
- Dökümanlarda kod çözümü verilmez; yalnızca yapılması gereken mühendislik işi, kapsam, kısıtlar ve kabul kriterleri tarif edilir.
- Her döküman için ayrıca başlangıç promptu vardır. Toplu prompt listesi `CLAUDE_SONNET_4_5_PROMPTS.md` dosyasındadır.

Doküman sırası, kritik etki ve blokaj seviyesine göre belirlenmiştir:

1. `01_model_gateway_adapter_registration.md`
2. `02_pipeline_run_id_unification.md`
3. `03_pipeline_index_metadata_enrichment.md`
4. `04_pipeline_final_result_completion.md`
5. `05_mcp_bridge_api_alignment.md`
6. `06_indexer_qdrant_alignment.md`
7. `07_indexer_persistence_integrity.md`
8. `08_ts_js_source_deduplication.md`
9. `09_test_realism_and_coverage.md`

Önerilen kullanım:
- İlgili dökümanı ayrı bir oturumda hedef modele ver.
- Aynı oturumda yalnızca o dökümanın promptunu ve döküman içeriğini paylaş.
- Modelden önce sorunu gerçek kod üzerinde doğrulamasını, sonra refactor yapmasını, en sonda test ve doğrulama raporu sunmasını iste.
