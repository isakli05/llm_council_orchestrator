# DEVELOPMENT_GUIDE.md

**LLM Council Orchestrator – Development Guide**

Bu belge, monorepo içindeki üç çekirdek uygulamanın (**orchestrator**, **mcp_bridge**, **vscode_extension**) ve üç shared package’ın geliştirilmesi için gerekli tüm pratik adımları, kuralları ve kodlama standartlarını açıklar.
Bu doküman, projede çalışan insan geliştiriciler ve tüm AI coding agent’ları (Cursor, Claude Code, Cline, Kiro, Roo Code vb.) için tek doğruluk kaynağıdır.

---

# 1. Geliştirme Ortamı

## 1.1 Minimum Gereksinimler

* Node.js: **>= 20.19.5**
* pnpm: **>= 10.17.0**
* VSCode veya Cursor
* TypeScript: **strict mode**
* ESM / CommonJS uyumlu çalışma (orchestrator CJS, extension JS, shared packages TS)

## 1.2 Kurulum

```bash
pnpm install
```

Kurulumdan sonra:

```bash
node apps/orchestrator/src/main.ts
node apps/mcp_bridge/src/server.ts
```

Bu komutlar sadece skeleton çalışmasını doğrular.

---

# 2. Monorepo Yapısı (Özet)

```
apps/
  orchestrator/       → Pipeline engine + state machine
  mcp_bridge/         → MCP server, IDE agent bağlantıları
  vscode_extension/   → VSCode UI

packages/
  shared-types/
  shared-utils/
  shared-config/

architect.config.json → Model presetleri, embedding config
```

Bu yapı **değişmez**, tüm kod bu hiyerarşiye uygun yazılır.

---

# 3. Geliştirme İlkeleri

## 3.1 Kod tarzı

* TypeScript: mümkün olan her yerde explicit types
* Null/undefined kontrolü zorunlu
* Async/await, try/catch blokları açık ve kontrollü
* Yan etkisi olan fonksiyonlar açıkça işaretlenmeli

## 3.2 Modülerlik

Her modül yalnızca bir sorumluluk taşır:

* indexer → projeyi tarar
* embedding → kodu embed eder
* sampling → semantic search + context selection
* pipeline engine → state machine
* roles → LLM ajan çağrıları
* aggregator → dual-model fusion
* model gateway → OpenRouter/API çağrıları
* observability → loglar, run_id, trace

Bu modüller **plug-and-play** çalışır.

---

# 4. Shared Packages Kullanımı

### `@llm/shared-types`

* FinalArchitecturalReport
* Report sections
* Council role outputs
* Pipeline input/output tipleri

### `@llm/shared-utils`

* `safeJson()`
* ileride: normalizeString, hash, small helpers

### `@llm/shared-config`

* `PIPELINE_MODES`
* PipelineMode type
* Config sabitleri

Shared paketlerin amacı **orchestrator → MCP → VSCode** arasında homojen tür ve davranış sağlamaktır.

---

# 5. Pipeline Akışı

Pipeline’ın çekirdeği orchestrator’dadır. Dört ana mod vardır:

1. **quick_diagnostic** – hafif örneklem
2. **full_analysis** – tüm council rollerini çalıştırır
3. **spec_generation** – project_context & module.yaml üretir
4. **refinement** – mevcut spec'e göre hedefli iyileştirme

---

# 6. LLM Council Yapısı

Roller:

* Legacy Analysis Agent (dual model)
* Architect Agent (dual model)
* Migration Agent (dual model)
* Security Agent (single/dual)
* Aggregator Agent (dual model fusion)

Her rol çağrısı:

* Prepared prompt → model A
* Same prompt → model B
* Cross-critique → fusion → final output

---

# 7. Indexer + Embedding

Indexer dış servistir (monorepo içindeki başka app).
Orchestrator sadece:

* "Index hazır mı?"
* "Şu metne embedding sorgusu gönder."
* "Semantic search’ten 12 chunk getir."

gibi isteklerde bulunur.

Embedding modeli her zaman **lokal**:

* BGE-large
* E5-large
* BGE-m3 (donanım izin verirse)

---

# 8. Observability

Her pipeline run’ı:

* `run_id`
* timestamp
* duration
* role_call_logs
* model outputs
* error details
* sampling_metadata

şeklinde kaydedilir.

---

# 9. Test Stratejisi

* Birim testler (unit)
* Pipeline integration testleri
* Role fusion correctness testleri
* VSCode extension komut testleri
* MCP Bridge → Orchestrator e2e testleri

---

# 10. Geliştirme Süreci

## 10.1 Normal akış

1. Yeni modül için `module.yaml` üret
2. AI/Fast modeller ile modülü üret
3. Manuel kontrol
4. Test ekle
5. VSCode tarafı ile entegrasyon doğrula
6. MCP üzerinden agent testi yap
7. Commit & push (CI opsiyonel—şu an yok)

## 10.2 AI Coding Agent Kuralları

AI'ya verilen tüm görevlerde:

* Tüm dosyaları okuması için manifest ver
* Değişiklikleri incremental patch formatında istemelisin
* `Do not hallucinate new files` kuralı zorunlu
* “Spec dosyaları full overwrite edilir”

AI her zaman:

* test önerir
* edge-case düşünür
* build/run doğrular
* type safety kontrol eder

Bu kurallar **LLM Council** tarafının projeyi güvenli ve tutarlı üretmesini sağlar.

---

# 11. VSCode Extension Geliştirme İlkeleri

Extension:

* UI/UX
* Komutlar
* Panel + webview
* Orchestrator ile HTTP/WebSocket üzerinden haberleşme
* Yalnızca interface katmanı

Extension’ın hiçbir zaman LLM’e direkt bağlı olmaması gerekir.

---

# 12. MCP Bridge Geliştirme İlkeleri

Bridge:

* IDE agent’lara “orchestrator’ı görünmez şekilde” sunar
* Model çağrısı içermez
* Yalnızca JSON-RPC / MCP protokol köprüsüdür

---

# 13. Config Yönetimi

Tek kaynak: **architect.config.json**

İçerik:

* Rollere göre model listeleri
* Embedding modeli tercihleri
* Parallel / sequential mod
* retry politikası

Secrets tutulmaz.

---

# 14. Spec Üretimi

Spec generation yalnızca şu üç dosyayı üretir:

* `project_context.yaml`
* `project_structure.yaml`
* `modules/*.yaml`

Bu dosyalar AI tarafından **FULL OVERWRITE** yazılır.

İnsan değişiklikleri **AI’ya seed** edilir, direkt dosya edit edilmez.

---

# 15. Manuel Override Politikaları

Geliştirici istediğinde:

* Model seçimini override edebilir
* Pipeline modunu değiştirebilir
* Sampling genişliğini sınırlayabilir
* Log seviyesini değiştirebilir

Bu override'lar **spec dosyasına** yazılmaz → sadece runtime ayarıdır.

---

# 16. Build & Dağıtım

Şu an skeleton düzeyinde:

* orchestrator ve mcp_bridge: node entrypoint
* vscode extension: local vsix build ileride eklenecek

Gelecekte:

* orchestrator: single binary packaging (pkg / nexe / bun build)
* mcp_bridge: standalone MCP uyumlu server
* extension: marketplace satışı opsiyonu

---

# 17. Ek Notlar

* Monorepo’da her ekleme filtre bazlı build stratejisini etkilemez
* AI'nın modülleri üretirken `context selector` doğru çalışması için dosya isimleri tutarlı olmalıdır
* Tüm roller birbirinden izoledir; coupling yasaktır

---
