# Mimari Seçenekler ve Ağırlıklı Karar

> Denetim: 2026-08-17. Tüm A–D puanları 1–5 (5 iyi). Puanlar dondurulmuş kanıt setine (evidence-index.md F1–F24), Worker D/F/G/H bulgularına ve ebeveyn doğrulamalarına dayanır. Worker H'nin çapraz incelemesi sonrası nihai hali.

## 1. Seçenek tanımları

- **A — Yerinde büyütme (grow in place)**: CLI, PTY, araçlar, oturumlar, LSP/DAP, subagent, worktree, izinler, hafıza mevcut Fastify/MCP monorepo'suna eklenir.
- **B — Modüler yeniden platform (modular re-platform)**: Çerçevesiz TypeScript çekirdek (konsey protokolü + Spec IR derleyicisi + sağlayıcı ağ geçidi) tek doğruluk kaynağı; **MCP sunucusu + stdio CLI** olarak açılır; dış harness'ler (OMP öncelikli istemci, Claude Code/Codex eşit mesafede) sürülür/yönlendirilir. Salvage sınırlı ve dürüst (kazı ilkesi: her modül yeniden yazım maliyetiyle kıyaslanır).
- **C — Yeni harness + seçmeli kurtarma**: Sıfırdan harness kabuğu; yalnız testleri geçen bileşenler taşınır. (H'nin çelikitlemesi: "harness'siz" varyant — motor hiç harness sahiplenmez, yalnız MCP/CLI olarak diğer harness'leri işçi olarak sürer.)
- **D — Claurst temelli/yardımlı**: Rust harness temeli / süreç-dışı ACP-MCP arka ucu / yalnız karşılaştırma / hariç tutma.

## 2. Puan matrisi (ağırlıklar toplamı %100)

Ağırlıklar: Hedef-uyum %15, Kanıtlanmış kodun yeniden kullanımı %10, İlk tam dikey dilime süre %12, Uzun vadeli bakım %12, Çalışma anı kontrolü/genişletilebilirlik %8, Çok sağlayıcı bağımsızlığı %8, Taşınabilirlik %5, Test edilebilirlik/gözlemlenebilirlik %8, Lisans/provenans riski (ters) %8, Native/Rust/Bun/Node uyumu %5, Upstream takip maliyeti (ters) %4, Performans/kaynak %3, Farklılaştırıcının korunması %2.

| Kriter (ağırlık) | A | B | C | D (Claurst) |
|---|---|---|---|---|
| Hedef-uyum (15) | 2 | **5** | 4 | 2 |
| Kanıtlanmış kod yeniden kullanımı (10) | 4 | **4** | 3 | 1 |
| İlk dikey dilime süre (12) | 2 | **4** | 2 | 2 |
| Uzun vadeli bakım (12) | 2 | **4** | 3 | 2 |
| Çalışma anı kontrolü (8) | 4 | 3 | **5** | 2 |
| Çok sağlayıcı bağımsızlığı (8) | 3 | **5** | 4 | 3 |
| Taşınabilirlik (5) | 4 | **4** | 4 | 2 |
| Test/gözlemlenebilirlik (8) | 2 | **5** | 4 | 3 |
| Lisans/provenans (8, ters) | 5 | **5** | 5 | 1 |
| Native/Bun/Node uyumu (5) | **5** | 4 | 4 | 2 |
| Upstream takibi (4, ters) | **5** | 4 | 5 | 2 |
| Performans/kaynak (3) | 3 | 4 | 4 | **5** |
| Farklılaştırıcı korunması (2) | 2 | **5** | 5 | 2 |
| **Ağırlıklı toplam** | **2.83** | **4.45** | **3.76** | **1.95** |

Not: Karar sayısal toplamdan ALINMAZ (§10). En belirleyici iki gerekçe sayısal olmayan: (i) A, 16/20 harness yeteneğini sıfırdan inşa ettirir — sorun "uzun" değil, ürünün farklılaştırıcısı olmayan işi tek başına geliştiriciye yaptırır; (ii) D, GPL-3.0 + sızıntı soyağdı + TLS-taklidi ToS riskiyle dağıtılabilir bir ürünün temeli olamaz (nitelikli hukuk incelemesi olmadan).

## 3. Worker H değişiklikleri (kabul edildi)

1. **"OMP öncü harness / Pi yedek" → "MCP-öncelikli, çalışma-zamanından bağımsız"**: Motorun tek sözleşmesi MCP + stdio CLI'dir. OMP, Aşama 4'te seçilen *ilk değiştirilebilir istemcidir*; yedek plan **Pi değil, A-lite'tır** (kendi ~1–2k satırlık ince döngüsü: bash + dosya araçları + node-pty + MCP istemcisi + `git worktree`). Gerekçe: Pi PR'leri varsayılan olarak otomatik kapanır (2026-08-17 doğrulandı), MCP/subagent/worktree/izin içermez — yamalayamayacağın yedek, sahiplendiğin 1k LOC'tan katbekâl kötüdür.
2. **Aşama 2.5 Kanıt Kapısı** (yeni; göç yol haritasına işlendi): harness yatırımı öncesi eval seti (≥20 gerçek görev, otomatik puanlama), derleyici gerçekliği (ekilmiş hatalı spec'lerde lint reddi >0; dondurma sonrası sürüklenme tespiti; placeholder-success yolları grep-enforcelı sıfır), konsey gerçekliği (tek-model taban çizgisini önceden ilan edilmiş eşikte geçmek; görev başına maliyet ≤3× taban). Tek biri bile başarısızsa: farklılaştırıcı kanıtlanmamıştır → Aşama 4'e GEÇİLMEZ; Spec IR bağımsız linter/MCP aracı olarak yayımlanır ve durulur.
3. **Kazı dürüstlüğü**: Değerli kod `apps/orchestrator/src` içindedir (build'i kırık olan uygulama), paylaşılan paketlerde değil. Her kurtarma modülü için kural: "yeniden yazımı ≤X gün mü? Değilse: kopyala-then-rewrite ya da sil." Yeşil izole testi olmayan modül yeni çekirdeğe GİREMEZ.
4. **Her aşamaya saat bütçesi + geri dönüş koşulu**; Aşama 6'ya doğumunda silme tarihi; "ana dala 2 hafta merge yok = dur ve yeniden karar ver".
5. **Aşama 0'a CI** (bugün 0 workflow) — yoksa sonraki her "yeşil" iddiası doğrulanamaz.

## 4. Nihai karar

**MODULAR RE-PLATFORM (B, H-modifiyeli).**
- Önerilen: Çerçevesiz TS çekirdek (`council-engine` + `spec-compiler` + `provider-registry` + `discovery` kütüphaneleri; `lco` CLI + `lco-mcp` MCP sunucusu). Mevcut MCP köprüsü tersine çevrilir: motor harness'i DEĞİL, harness'ler motoru MCP üzerinden tüketir.
- Yedek: A-lite ince döngü (yukarıda) — planlı, tarihli yedek; Pi yedeklikten düşürüldü.
- Claurst: yalnız STUDY + black-box eş-ajan; kod/linkleme/fork dağıtım öncesi nitelikli hukuk incelemesi şart (claurst-assessment.md §6).
- Öneriyi GEÇERSİZ KILACAK kanıtlar (kill criteria): (1) Aşama 2.5 kanıt kapısı başarısızsa → üründen linter aracına küçültme; (2) Aşama 4 spike'ında OMP-MCP yolu işlevsel çalışma-zamanı gereksinimlerini (worktree, PTY, tipli subagent) karşılayamıyorsa VE A-lite maliyeti kabul edilemezse → A seçeneğine dönüş kararı; (3) OMP upstream churn'ü aylık entegrasyon maliyetini değerin üzerine çıkarırsa → istemci çeşitlendirmesi/çoğunlukla CLI.

## 5. Keep / Refactor / Rewrite / Delete / Externalize haritası (modül düzeyi)

| Modül/dosya | Karar | Gerekçe |
|---|---|---|
| indexer: Scanner, Chunker, VectorIndex, storage.ts | **KEEP (kazı)** | Gerçek, izole test edilebilir; embedding HTTP bağımlılığı env ile soyutlanır |
| indexer: server.ts (1213 satır) | REFACTOR→kütüphane + ince servis | Split; 0.0.0.0 varsayılanı loopback'e düşer; auth sabitlemesi |
| orchestrator: discovery/SignalExtractor.ts, DomainDiscoveryEngine | **KEEP (kazı)** | 1439+ satır gerçek kod analizi; yerel tiplere bağımlı (H doğrulaması), ayıklanabilir |
| orchestrator: discovery/DomainSpecWriter.ts | REWRITE | Keşif meta-verisi yazar; Spec IR yazıcısıyla değişir (F7) |
| orchestrator: pipeline/PipelineEngine.ts (2917) | **REWRITE** | God-class; step-switch placeholder'lı; konsey protokolünün karşısındaki soyutlama |
| orchestrator: roles/RoleManager.ts | REWRITE (kavramlar taşınır) | Fan-out modeli hedef protokolle çelişir (tek-görünüm varsayılanı) |
| orchestrator: models/ModelGateway + 8 adaptör | REFACTOR→provider-registry | Çoklu sağlayıcı deneyimi değerli; kimlik tabloları kayıt defterine gider; gpt-5.2-pro/Response-API ve slug bayatlığı düzeltilir |
| orchestrator: aggregation/Aggregator.ts | **REWRITE** | Tek sentez + placeholder doldurma (Aggregator.ts:518-525) hedef protokolün karşısı |
| orchestrator: spec/SpecController.ts + development_specs/*.yaml | DELETE (arşiv) | Statik el yazımı sunma; spec/ paketiyle değişir |
| orchestrator: api/, server.ts, observability/ShutdownManager | REFACTOR→ince HTTP uyumluluk katmanı (geçici) | Strangler: eski çağıranlar Aşama 5'e kadar yaşar, sonra sökülür |
| mcp_bridge | **INVERT→lco-mcp** | 5 araç tersine çevrilir; stdout kirliliği giderilir (Logger→stderr) |
| packages/shared-* | KEEP (küçük) | Küçük, gerçek, test edilebilir; tsconfig eksikleri Aşama 0'da giderilir |
| .audit/, plans/, plans-out/, tasks/ (88 md) | DELETE→arşiv dizini | Tarihsel iskele; en dürüst 2 belge (COST_EXPLOSION, PROJECT_ANALYSIS) README'de bağlanır |
| .kiro/specs | KEEP (referans) | Sorun envanteri doğru; "complete" işaretleri yok sayılır |
| coverage/, server.test.ts.backup, example-output/, verify-rag.ts, example.ts, PDF'ler | DELETE | Derleme artefaktları/ölü kod/kişisel dosyalar git'ten çıkarılır |
| .env.test | **DELETE + ANAHTAR İPTALİ + geçmiş temizliği** | R1 riski — bugün |
