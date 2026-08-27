# Kanıt Dizini ve Dondurulmuş Ana Depo Gerçeklik Anlık Görüntüsü

> **DONDURMA TARİHİ: 2026-08-17 (UTC+3), saat ~02:30.**
> Bu belge, Worker A/B/C bulgularının ebeveyn doğrulamasından sonra DONDURULMUŞ ana depo (llm_council_orchestrator) gerçeklik değerlendirmesidir.
> Denetim sırası kuralı gereği (§4): Claurst incelemesi ve dış karşılaştırma çalışmaları bu dondurmadan SONRA başlar ve bu belgeyi YENİDEN YAZAMAZ.
> Denetlenen commit: `a5347e69ea5d726bd6c6bd6201385bfdb886ac5c` (main, temiz ağaç, 2026-03-09).

## Dondurulmuş bulgu seti (ebeveyn tarafında birebir doğrulanmış)

Her satır: Worker bulgusu + ebeveyn doğrulama yöntemi. "PV" = ebeveyn doğrulaması yapıldı.

| # | Bulgu | Kanıt (path:line) | PV |
|---|-------|-------------------|----|
| F1 | Depo 3 Fastify servisi + 4 paylaşılan paket monorepo'su; HİÇBİR pakette `bin` yok → CLI giriş noktası yok | tüm package.json'lar; orchestrator server.ts:113 (127.0.0.1:7001) | PV |
| F2 | MCP bridge yalnız 5 araç: `run_pipeline, get_index_state, get_spec_files, get_pipeline_progress, abort_pipeline` | apps/mcp_bridge/src/mcp/registerTools.ts:33-42; tools/types.ts:9-102 | PV (preflight) |
| F3 | Adım yürütücü `default:` dalı tanınmayan her adım için `success: true` + `"Step 'X' executed (placeholder)"` döner — çekirdek yolda sahte başarı | apps/orchestrator/src/pipeline/PipelineEngine.ts:1537-1551 | PV (kod okundu) |
| F4 | SPEC modu adımları: initialize, index, architect_analysis, spec_generation — **aggregate YOK**; spec_generation placeholder'a düşer | PipelineEngine.ts:1416-1422 + F3 | PV (kod okundu) |
| F5 | REFINEMENT modu: initialize, context_load, refinement_analysis — üçünün hiçbiri switch'te yok → **0 gerçek LLM çağrısı**, yine success:true | PipelineEngine.ts:1424-1429 + F3 | PV (kod okundu) |
| F6 | `aggregateSpec()` ölü kod (pipeline'dan erişilemez: `aggregator.aggregate` tek çağıran FULL modun aggregate adımı, PipelineEngine.ts:2499); erişilse bile sabit placeholder dizisi döndürür | Aggregator.ts:534-549, 613-623, 629-635 (`"# Placeholder module_1.yaml"...`) | PV (kod okundu) |
| F7 | DomainSpecWriter üretim hattına bağlı DEĞİL (yalnız test/örnek scriptler); yalnız keşif meta-verisi yazar (signals/evidence), uygulama sözleşmesi değil | DomainSpecWriter.ts:452-545; example-pipeline-integration.ts:12-13 ("could be added") | Worker C (tutarlı) |
| F8 | `development_specs/*.yaml` API/MCP üzerinden sunulan dosyalar EL YAZIMI, ilk commit'ten (8045565) beri değişmemiş; hiçbir kod bunları yazmıyor | SpecController.ts:14-23 (sabit dosya adı); git log --follow → yalnız 8045565 | PV (kod + git) |
| F9 | Konsey DEĞİL: aynı prompt M modele paralel `Promise.all` fan-out; modeller birbirinin çıktısını görmez; tek sentez çağrısı hard-coded `gpt-5.2-pro`; eleştiri/tartışma/oy/hakem/skor/bütçe mekanizması YOK | RoleManager.ts:266-306; ModelGateway.ts:857-876; Aggregator.ts:391-439, 417-427 | PV (formül türetimi) |
| F10 | Çağrı formülü: QUICK=2; SPEC=2; REFINEMENT=0; **FULL(D)=7+4D** (D=5 → 27). Deponun kendi maliyet denetimi (tasks/COST_EXPLOSION_AUDIT.md, 6N+1/"31 çağrı") YANLIŞ | PipelineEngine.ts:52-66, 91-94, 1521-1536; architect.config.json:3-62 | PV (kod okundu) |
| F11 | Model kimlikleri Mart-2026'ya donuk ve 4 ayrı yerde tekrarlı: gpt-5.2, glm-4.6, claude-opus-4-5, gpt-5.2-pro, claude-sonnet-4-5 vb. | PipelineEngine.ts:54-64; Aggregator.ts:417-427, 218-225; architect.config.json; OpenRouter adaptör eşleme tabloları | PV (örneklem) |
| F12 | `grok` sağlayıcısı parse ediliyor ama adaptörü yok → garanti başarısızlık yolu | ModelGateway.ts:439, 718, 1002 | PV (rg) |
| F13 | `callWithRetry` tanımlı ama üretim yolunda HİÇ çağrılmıyor; devre kesici model çağrılarını sarmalamıyor → 429'lar üretimde yeniden denenmez | ModelGateway.ts:893 (tek eşleşme: tanım) | PV (rg) |
| F14 | Yapılandırılmış çıktı YOK: response_format/json_schema/tool_choice yok; sentez regex ile ```json çıkarır; bozuk JSON'da sessiz placeholder doldurma ("[Section X was not generated...]") | Aggregator.ts:451-476, 519-525 | Worker B |
| F15 | Durum makinesi süsleme: yalnız start/fail/cancel çağrılır; INDEXING/DISCOVERING/... ara durumları hiç sürülmez; stateMachine.ts'nin üretim içe aktarıcısı yok | executionStateMachine.ts:43-107; PipelineEngine.ts:320,484,571; stateMachine.ts izole | PV (rg) |
| F16 | Adım hataları: yalnız initialize/index/full_index kritik (fail-fast); diğer adım hataları uyarıyla devam → SPEC'te 0 başarılı LLM çağrısıyla bile success:true mümkün (fail-open) | PipelineEngine.ts:2654-2657, 414-431, 465-470 | Worker B+C (tutarlı) |
| F17 | Çalışma durumu yalnız bellek (activeRuns Map) → restart'ta tüm run'lar kaybolur; sonuç dosyası yazılmaz | PipelineEngine.ts:114, 120 | Worker A+B |
| F18 | MCP stdio kirlenmesi: JSON-RPC yanıtları (transport/MCPServer.ts:207) ile logger info çıktısı (observability/Logger.ts:29) AYNI stdout kanalında | iki dosya | PV (kod okundu; A'nın yol bilgisi düzeltildi) |
| F19 | **GÜVENLİK: `.env.test` içinde 49 karakterlik `ZAI_API_KEY` değeri commit'lenmiş (bf63bfb), depo PUBLIC** → iptal gerektirir | git ls-files; .env.test; gh api private:false | PV (değer yazılmadan) |
| F20 | CI YOK: depoda .github yok; GitHub'da 0 workflow, 0 release, 0 issue, 0 yıldız/çatal, dal koruması yok; README.md:3 CI badge'i var olmayan workflow'a işaret eder | gh api (2026-08-17); README.md:3 | PV (gh) |
| F21 | ~20 `it.skip` (auth integration) + E2E `describe.skip`; ".audit 0 placeholder / 0 TODO / 100% pass / READY FOR PRODUCTION" iddiaları kodla ÇELİŞİYOR | tests/integration/orchestrator-auth.integration.test.ts; tests/e2e/...; .audit/09_FINAL_COMPLETE_REPORT.md:27,117-121,254-257,341 | PV (preflight) + A |
| F22 | Spec sistem alan kapsamı: 15 alanlık task-contract rubricinde 0-1/15; şema doğrulama/lint/hash/dondurma/delta/izlenebilirlik YOK; legacy/modernizasyon yeteneği sıfır (rg exit=1: strangler/parity/golden-master/cutover/inventory) | Worker C §5-§7 aramaları | Worker C (arama kanıtı) |
| F23 | Başarısızlık semantiği fail-open: belirsizlik kapısı yok; "ambiguity|unresolved" üretim kodunda 0 eşleşme | Worker C §7 | Worker C |
| F24 | Kod kalitesi karışık: PipelineEngine.ts 2917 satır (god-class); src/discovery içinde ~3.6k satır örnek/test scripti; coverage/ ve server.test.ts.backup git'te | wc -l; git ls-files | Worker A |

## Hipotez doğrulama tablosu (§7 gereği)

| ID | Hipotez | Sonuç | Kanıt |
|----|---------|-------|-------|
| H1 | Fastify orchestrator+indexer+MCP bridge monorepo, CLI bin yok | **CONFIRMED** | F1 |
| H2 | MCP bridge yalnız 5 araç | **CONFIRMED** | F2 |
| H3 | executeModels aynı promptu paralel gönderir, eleştiri yok | **CONFIRMED** | F9, RoleManager.ts:266-306 |
| H4 | aggregateFull tek post-hoc sentez | **CONFIRMED** | F9, Aggregator.ts:283-334 |
| H5 | SPEC pipeline'da aggregate adımı yok | **CONFIRMED** | F4 |
| H6 | spec_generation placeholder success'e düşer | **CONFIRMED** | F3+F4 |
| H7 | aggregateSpec çağrılsa bile placeholder YAML üretir | **CONFIRMED** | F6 |
| H8 | DomainSpecWriter hatta bağlı değil, keşif meta-verisi yazar | **CONFIRMED** | F7 |
| H9 | Gerçek E2E ve auth testleri skip | **CONFIRMED** | F21 |
| H10 | GitHub Actions yok | **CONFIRMED** | F20 |
| H11 | "0 placeholder/production ready" raporları kaynakla çelişiyor | **CONFIRMED** | F21, F3 |
| H12 | FULL ≈7 çağrı, ~6N+1 büyüme | **PARTIAL** — taban 7 doğru; eğim **4N** (6N değil); D=5 → 27 (31 değil). Depo içi denetim dokümanı da hatalı | F10 |
| H13 | PTY/SSH/LSP/DAP/worktree/session-branching/memory/sandbox yok | **CONFIRMED** | preflight rg (bağımlılık yok) + A topolojisi |
| H14 | Model kimlikleri Mart-2026'ya donuk | **CONFIRMED** (kod düzeyinde); Ağustos-2026 API geçerliliği Worker F'de | F11 |
| H15 | Betik/çalışma zamanı doğrulaması (testlerin gerçekten geçmesi) | **Wave 2 / Worker E'de** — dondurma sonrası ek kanıt olarak eklenir, bulguları yukarıdakileri DEĞİŞTİREMEZ, yalnızca ekler | — |

## Çapraz-çıkarımlar (ebeveyn sentezi — dondurulmuş)

1. **Ürün gerçeği**: Sistem "LLM konseyi" değil; "RAG destekli çok-model paralel analiz + tek model sentez" sunucusudur. Konsey kavramı yalnızca prompt üslubundadır.
2. **SPEC/REFINEMENT fiilen sahte modlardır**: gerçek index + architect çağrıları yapılır, ancak modun adını taşıyan adımlar no-op'tur ve başarı döner. Bu, çekirdek yolda doğruluk kusurudur (§18 kuralı).
3. **En değerli gerçek bileşenler**: indexer (gerçek tarama/chunk/embedding/kalıcılık zinciri), keşif motoru (SignalExtractor/DomainDiscoveryEngine — kod tabanını gerçekten tarar), model ağ geçidi çok-sağlayıcı adaptör seti, shared paketleri, gözlemlenebilirlik iskeleti.
4. **En yanlış soyutlama**: PipelineEngine god-class + adım-switch; Aggregator'ın "konsey"varsayımı; statik YAML sunan "spec" alt sistemi.
5. Depo kendi iç denetim belgeleri arasında bile tutarsızdır (COST_EXPLOSION formülü hatalı; .audit iddiaları kodla çelişiyor; PROJECT_ANALYSIS_REPORT en dürüst olanıdır).

## Kanıt dosyaları dizini

- `commands-and-results.md` — tüm komutlar + çıkış kodları (preflight tamam; Worker E/G bölümleri doldurulacak)
- `HARNESS_EVOLUTION_ASSESSMENT.md` — nihai rapor (Turkçe)
- Diğer destek dosyaları: capability-matrix.md, architecture-options.md, proposed-spec-ir.md, council-protocol.md, claurst-assessment.md, migration-roadmap.md, risk-register.md
