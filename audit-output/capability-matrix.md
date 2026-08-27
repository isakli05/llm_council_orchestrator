# Harness Yetenek Matrisi (20 satır)

> Değerlendirme: llm_council_orchestrator (LCO) @ a5347e6 (2026-08-17 dondurulmuş bulgular) vs hedef gereksinim vs aday kaynaklar.
> Aday kısaltmaları: BUILD=LCO içinde geliştir, SALVAGE=LCO'dan kurtarıp taşır, OMP=oh-my-pi (MIT, TS/Bun, fork-of-Pi, v17.3.5 @37eee71), PI=pi-mono (MIT, TS/Node≥22.19, v0.84.2 @d3ab2af), EXT=hariç tut.
> Öncelik: P0=dikey dilim için zorunlu, P1=farklılaştırıcı, P2=uzun vadeli.

| # | Yetenek | LCO mevcut durum | Kanıt | Hedef | Aday | Öncelik | Bağımlılık/Risk |
|---|---------|------------------|-------|-------|------|---------|-----------------|
| 1 | Kodlama-ajan araç döngüsü | YOK — pipeline step motoru var, ajan döngüsü yok | F1; executeStep switch yalnız 9 adım tipi | Tam araç döngüsü (tool_use→result→devam), iptal, bütçe | OMP (task/agent döngüsü) veya PI (createAgentSession) | P0 | Council motoru araç döngüsünün ÜSTÜNE oturur; OMP SDK'sının Node içinde mi yalnız Bun içinde mi çalıştığı spike'ta doğrulanmalı (D: belirsiz) |
| 2 | Çok sağlayıcı/çok model + çalışma anı geçişi | KISMEN — 8 adaptör + OpenRouter; geçiş yok; kimlikler 4 yerde sabit | F11; ModelGateway.ts:191-200 | Kayıt-defteri tabanlı, kimlik donuk değil | SALVAGE(kavram)+OMP(ModelRegistry/roller/fallback) veya PI(registerProvider) | P0 | LCO adaptör seti değerli ama tekil sağlık: gpt-5.2-pro Responses-API-only (F-doğrulama), OpenRouter slug bayatlığı — yenilenmeli |
| 3 | Model yetenek kayıt defteri / uyumluluk keşfi | YOK — VALID_MODELS_BY_PROVIDER sabit liste | configLoader.ts:174-184 | Dinamik katalog (models.dev benzeri) | BUILD (Claurst'ün models.dev yaklaşımı yalnız-inceleme) | P1 | Sağlayıcı API'lerinin Ağustos-2026 durumu periyodik yeniden doğrulama gerektirir |
| 4 | Kalıcı cwd/ortam/shell durumu | KISMEN — pipeline context'i run-boyu; shell yok | PipelineEngine context | Oturum boyu kalıcılık | OMP (kalıcı brush shell) / PI | P0 | — |
| 5 | Gerçek PTY (resize, stdin, sinyaller, arka plan, devralma) | YOK | preflight rg (node-pty yok) | Tam PTY yaşam döngüsü | OMP (portable-pty N-API) | P0 | OMP native addon matrisi (6 platform); PI'de PTY yok → PI seçilirse BUILD gerekir |
| 6 | SSH / uzaktan yürütme arka uçları | YOK | preflight | SSH arka ucu | OMP (ssh aracı) / Claurst YOK / BUILD | P2 | Uzaktan yürütme güvenlik profili §güvenlik |
| 7 | Dosya oku/ara/düzenle/yaz + atomik/ bayat-düzenleme koruması | KISMEN — indexer tarar/okur; düzenleme yok | Scanner/Chunker/VectorIndex | Ajan-güvenli düzenleme | OMP/PI yerleşik araçları | P0 | LCO indexer yalnız analiz amaçlı SALVAGE |
| 8 | LSP entegrasyonu | YOK | preflight | Tanılama/gezinme/yeniden adlandırma | OMP (14 işlem, 53 sunucu iddiası — sayılar CLAIMED) | P1 | — |
| 9 | DAP hata ayıklama | YOK | preflight | Yerel DAP | OMP (28 işlem iddiası — CLAIMED) | P2 | Hiçbir aday kaynak kod düzeyinde doğrulanmadı; spike'ta test |
| 10 | Subagent/teammate fan-out/fan-in, tipli sonuç, bütçe, iptal | YOK (rol fan-out ≠ subagent; tipli çıktı yok) | F9 | Şema-doğrulanmış sonuç + bütçe + iptal | OMP (outputSchema sdk.ts:511-513 doğrulandı; worktree izolasyonu) — PI'de yok (örnek uzantı düzeyinde) | P0 | Konsey protokolünün yürütme katmanı bu |
| 11 | İzole worktree/çalışma alanı + birleştirme semantiği | YOK | preflight | Task başına izolasyon | OMP (worktree.ts + 8 CoW arka uç) | P1 | — |
| 12 | Oturum kalıcılığı/resume/branch/checkpoint/rewind | YOK — bellek-içi Map, restart=tüm run'lar kaybolur | F17 | Kalıcı oturum ağacı | OMP (JSONL + ağaç + Redis/SQL) / PI (JSONL + sqlite) | P0 | LCO'nun kalıcılık yokluğu temel kusur |
| 13 | Proje-kapsamlı hafıza/tat, provenance, düzenleme, silme | YOK | preflight | Proje hafızası + provenance | BUILD (konsey kanıt paketiyle doğal bütünleşir); OMP skill/memory mevcut ama konsey-özel değil | P1 | — |
| 14 | MCP, skills, hooks, rules, eklenti API | KISMEN — MCP İSTEMCİSİ yerine köprü (5 araç, stdout hatası F18) | F2, F18 | MCP istemcisi+sunucusu, skills, hooks | OMP (tam) / PI (MCP YOK — BUILD) | P0 | MCP köprüsü tersine çevrilip uyumluluk adaptörüne döndürülebilir |
| 15 | İzin/sandbox/yetki profilleri | YOK | preflight | Orantılı izin profilleri | OMP (onay modları + izolasyon) / PI (yok — konteyner önerisi) | P0 | LCO'da orchestrator'da auth bile yok (F-doğrulama) |
| 16 | TUI / one-shot / headless / SDK / RPC / ACP yüzeyleri | YOK — yalnız HTTP+stdio(MCP); bin yok | F1, F2 | CLI+TUI+headless+SDK/RPC | OMP (RPC+ACP+SDK) / PI (SDK+RPC) | P0 | — |
| 17 | Yerel-öncelikli çalışma, opsiyonel uzak/bulut | KISMEN — yerel ama indexer 0.0.0.0'a bağlı (F-doğrulama!) | indexer server.ts:1173 | Loopback-varsayılan, açık bilinçli uzak mod | BUILD + SALVAGE(bağlama düzeltmesi) | P0 | Mevcut 0.0.0.0 varsayılanı güvenlik düzeltmesi gerektirir |
| 18 | Gözlemlenebilirlik + token/maliyet/ gecikme bütçeleri | KISMEN — OTel iskeleti gerçek ama LLM çağrıları izlenmiyor; token/maliyet SAYACI YOK (trackLlmCall'ın çağıranı yok) | Worker F §7-8 | Çağrı-başı token/maliyet + bütçe kapları | SALVAGE(OTel)+BUILD(bütçe) — OMP cost_usd akışı örnek | P0 | Konsey bütçe formülü council-protocol.md §2 |
| 19 | Konsey protokolü | YOK — paralel fan-out + tek sentez | F9, F10 | 12 aşamalı protokol (council-protocol.md) | BUILD (FARKLILAŞTIRICI — hiçbir adayta içkin değil; OMP orchestrate/Claurst teams yalnız ilham) | P0 (farklılaştırıcı) | — |
| 20 | Spec IR, lint, izlenebilirlik, dondurma/ değişiklik seti, uygunluk doğrulaması | YOK — statik el yazımı YAML; 0-1/15 rubrik; doğrulama/lint/hash/delta yok | F7, F8, F22 | Spec IR v1 (proposed-spec-ir.md) | BUILD (FARKLILAŞTIRICI; OpenSpec'in Zod deltası en yakın referans) | P0 (farklılaştırıcı) | — |

## Özet okuma

- LCO bugün 20 yetenekten ~4'ünde KISMEN (2, 4*, 14*, 17*, 18* — yıldızlılar kusurlu), 16'sında tamamen YOK. Bu bir kodlama-ajan harness'i DEĞİL; analiz sunucusu.
- OMP, 20 satırın 16'sında doğrulanmış/iddia edilen hazır çözüm sunar (satır 3, 13, 19, 20 hariç — ki bunlar zaten farklılaştırıcımız).
- PI, 5-6 satırda (PTY, worktree, MCP, subagent, izin, LSP/DAP) yeniden inşa gerektirir.
- Satır 19-20 (konsey + spec) hiçbir adayta yok — bunlar BUILD'dir ve ürünün varlık sebebidir.
