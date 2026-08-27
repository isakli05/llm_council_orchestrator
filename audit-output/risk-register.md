# Risk Kaydı

> Denetim: 2026-08-17. Olasılık/etki: Düşük/Orta/Yüksek. "Erken sinyal" = izlenecek gözlemlenebilir gösterge. "Sahiplik" bu denetimin müşterisi (tek geliştirici varsayımı) içindir. Karar son tarihi, ilgili aşamanın çıkış kapısına bağlıdır.

## A. Acil (denetim sonrası hemen)

| ID | Risk | Olasılık | Etki | Erken sinyal | Azaltım | Sahip | Son karar |
|----|------|----------|------|--------------|---------|-------|-----------|
| R1 | ~~`.env.test` içindeki ZAI_API_KEY kamu deposunda ifşa~~ **GÜNCELLEME 2026-08-18: anahtar kullanıcı tarafından zaten iptal edildi (kullanıcı beyanı).** Kalan iş: dosyanın ve git geçmişinin temizliği (ödünç alan karışıklığı/alarmları önlemek için) + `.env.test`'in `.gitignore` kapsamına alınması. Risk seviyesi: Yüksek → Düşük (temizlik işi) | Kesin (kanıtlandı) → giderildi | ~~Yüksek~~ Düşük | — | Dosyayı kaldır, geçmişi temizle (opsiyonel), .gitignore güncelle | Kullanıcı | Aşama 0 |
| R2 | `pnpm build` kırık (85 TS hatası; indexer build script'i yok) | Kesin | Orta | zaten kırık | Aşama 0: test dosyalarını derlemden çıkar (tsconfig exclude) + indexer build script ekle | Kullanıcı | Aşama 0 kapısı |
| R3 | "Üretim hazır / %100 geçen" belgeleri kamuda yanlış izlenim yaratıyor | Kesin | Düşük-Orta (itibar) | issue/PR gelirse | README'yi kanıta dayalı yeniden yaz; .audit/plans-out iddialarını arşivle işaretle | Kullanıcı | Aşama 0 |

## B. Mimari kararla ilgili

| ID | Risk | Olasılık | Etki | Erken sinyal | Azaltım | Sahip | Son karar |
|----|------|----------|------|--------------|---------|-------|-----------|
| R4 | OMP SDK'sının Node-içi kullanımı belirsiz (sdk.md "Bun process" diyor; omp.sh "Node hosts" diye pazarlıyor) | Orta | Yüksek (B seçeneğinin ana teknik varsayımı) | Spike'ta `createAgentSession` Node 24 altında import edilemiyor/hata veriyor | RPC moduna düşünme (çağrı başına gecikme + süreç ömrü maliyeti) veya Pi'ye geçiş; baştan iki planlı ol | Kullanıcı | Aşama 4 spike'ı |
| R5 | OMP upstream hızı (günlük sürümler, tek ana bakımcı, API kararlılık garantisi yok) | Yüksek | Orta-Yüksek (uzun vadeli bakım) | Uzantı API'sini kullanan kod her major'da kırılıyor | Entegrasyonu tek ince adaptör katmanında izole et (pi.registerTool/MCP); upstream'i değiştirmeden tutma sözü; sürüm kilitleme + yükseltme testi | Kullanıcı | Aşama 4-7 |
| R6 | OMP native addon matrisi (6 platform N-API) kullanıcının hedef platformlarında kırılır | Orta | Orta | hedef makinede `pnpm i` sonrası postinstall/native yüklemesi hatası | Hedef platform listesini baştan test et; sorun varsa Pi (saf JS) yedek | Kullanıcı | Aşama 4 |
| R7 | "Kurtarma" öyküsü gizli yeniden yazım olur (indexer/discovery kodu aslında tekrar yazılacak) | Orta | Orta (zaman bütçesi yanılgısı) | Aşama 1'de indexer paketini yeni arayüzle sararken satırların çoğu değişiyor | Salvage kapsamını SOMUT sınırla: yalnız Scanner/Chunker/VectorIndex/storage + SignalExtractor + adaptör istisnaları; kalanı (PipelineEngine, Aggregator, spec alt sistemi) yeniden yazım kabul edilir | Kullanıcı | Aşama 1 kapısı |
| R8 | Konsey+Spec farklılaştırıcısı "hafta sonu prompt iskeleti"ne indirgenir (OMP skill'i taklit edebilir) | Orta | Yüksek (ürünün varlık sebebi) | Değerlendirme paketi (council-protocol.md §3) deterministik testleri geçemiyor veya varyans skoru düşmüyor | Farklılaştırıcıyı ölçülebilir kıstamlara bağla: spec lint geçişi, dondurma kapısı, ≥2 model varyans testi, conformance raporu; bunlar prompt-iskeletinde üretilemez | Kullanıcı | Aşama 2-3 kapıları |
| R9 | Tek geliştiricinin iki ürünü (motor + harness entegrasyonu) idaresi zorlaşır | Orta | Orta | Aşama 4 sonrası iş yükü patlaması | Dikey dilim disiplini: her aşama sonunda KULLANILABİLİR tek yol; yarı-yapı durumu yasak | Kullanıcı | sürekli |
| R10 | Claurst kaynaklı hukuki/provenans riski ürünümüze sıçrar | Düşük (plan hariç tutuyor) | Yüksek (dağıtımda) | Herhangi bir Claurst kodu/spec alıntısı geçmesi | Karar sınırı: yalnız study/black-box; kod kopyalama/linkleme/fork yasak; dağıtım öncesi nitelikli hukuk incelemesi şartı yazılı kalsın | Kullanıcı | dağıtım öncesi |

## C. Operasyonel (ürün geliştirilirken)

| ID | Risk | Olasılık | Etki | Erken sinyal | Azaltım | Sahip | Son karar |
|----|------|----------|------|--------------|---------|-------|-----------|
| R11 | Sağlayıcı API/kimlik bayatlaması yeniden yaşanır (4 yerde tekrarlı kimlikler; bugün gpt-5.2-pro kırık, gemini-3-pro kapalı) | Yüksek | Orta-Yüksek | adaptör çağrıları 4xx | Yetenek kayıt defteri + tek doğruluk kaynağı + aylık `providers health` denetim komutu | Kullanıcı | Aşama 1 |
| R12 | Fail-open kültürü geri döner (placeholder success, sessiz fallback) | Orta | Yüksek (doğruluk) | UNRESOLVED yerine uydurulmuş değer içeren artifact | Deterministik lint + dondurma kapısı bunu yapısal engeller; test: adversarial girdi UNRESOLVED üretmeli | Kullanıcı | Aşama 2 |
| R13 | Konsey maliyeti kontrolsüz büyür (mevcut 7+4D + 150-210k girdi token zarfı) | Orta | Orta (para) | çağrı-başı maliyet raporları | Bütçe kapları + evidence_id referanslı prompt paylaşımı + uyarlanabilir rol yönlendirme; bütçe aşımı → kalan kararlar UNRESOLVED | Kullanıcı | Aşama 3 |
| R14 | Embedding sunucusu bağımlılığı (localhost:8000) yerel kurulumu kırar | Orta | Düşük-Orta | kurulumda index çalışmıyor | Yerel gömme varsayılanı (ör. dönüştürücü tabanlı) veya BYO; embedding'siz çalışma modu (sözcüksel arama) | Kullanıcı | Aşama 4-5 |
| R15 | MCP köprüsünün stdout kirliliği mevcut MCP kullanıcılarını bozar | Kesin (kanıtlandı) | Düşük | köprüyü MCP istemcisine takınca protokol hatası | Logger'ı stderr'e taşı (tek satırlık yön) — Aşama 1'de | Kullanıcı | Aşama 1 |

## D. İzleme dışı bırakılanlar (bilinçli)
- Kurumsal SSO/çok-kiracılı denetim, SOC2 vb.: yerel-öncelikli ürün için kontrol-listesi tiyatrosu (§18) — kapsam dışı; yalnız R1/R15 tipi somut riskler ele alındı.
- Warp/Codex/Claude Code'e gömülme riskleri: bunlar eş-ajan (peer) olarak kalıyor; entegrasyon yüzeyleri belgelendi, ürün bağımlılığı yok.
