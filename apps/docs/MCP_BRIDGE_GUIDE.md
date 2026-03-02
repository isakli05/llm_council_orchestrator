---

# MCP_BRIDGE_GUIDE.md

**LLM Council Orchestrator – MCP Bridge Teknik Entegrasyon Rehberi**

Bu belge, LLM Council Orchestrator ekosisteminin **MCP Bridge (Model Context Protocol Bridge)** bileşenini detaylı olarak açıklar.
Bu bileşen, Cursor, Claude Code, Kiro, Cline gibi AI kod ajanlarının Orchestrator ile haberleşmesini sağlar.

MCP Bridge, IDE entegrasyonlarına kıyasla daha düşük seviyeli ancak çok daha esnek bir arayüzdür.
Her MCP uyumlu ajan, bu bridge üzerinden aynı endpoint’lerle pipeline tetikleyebilir ve sonuçları okuyabilir.

---

# 0. MCP Bridge’in Sistem İçindeki Yeri

Genel mimari:

```
AI Agent (Cursor / Claude Code / Kiro / Cline)
      ↓  (MCP protokolü)
MCP Bridge
      ↓  (HTTP / local IPC / function calls)
Orchestrator
      ↓
Final Architectural Report + Spec Dosyaları
```

MCP Bridge:

* Bir sunucu değildir
* Bir UI değildir
* Bir orchestrator değildir

Sadece **protokol adaptörüdür**.

---

# 1. Amaçlar ve Sorumluluklar

## 1.1 Amaç

Her AI kod ajanının, kendi native MCP protokolüyle Orchestrator’ın pipeline’larını başlatmasını sağlamak.

Bunun anlamı:

* Kodu ajanlar workspace’i okur
* Ajan pipeline’ı tetikler
* Orchestrator analiz yapar
* Bridge → MCP üzerinden cevap döndürür

## 1.2 Sorumluluklar

* MCP `tools` tanımlamak
* Ajan tarafından gelen payload’ı doğrulamak
* Pipelineları orchestrator’a iletmek
* Pipeline progress’i event stream olarak döndürmek
* Üretilen dosyaların path bilgisini sağlamak
* Hata formatını MCP standardına çevirmek

## 1.3 Sorumluluk Dışı

* Dosya sistemi okuma/yazma (AI ajanlar yapar)
* Council mantığı
* Role execution
* Embedding
* Sampling
* Spec generation

Bridge sadece bir **aktarış katmanıdır**.

---

# 2. MCP Tools

AI ajanları MCP üzerinden “tools” çağırır.

Bridge aşağıdaki araçları sağlar:

### 2.1 `llm.index_status`

**Amaç:** Orchestrator tarafında index'in hazır olup olmadığını dönmek.

Girdi:

```
{
  "project_path": "/path/to/project"
}
```

Çıktı:

```
{
  "indexed": true | false,
  "progress": "..."
}
```

---

### 2.2 `llm.run_pipeline`

**Amaç:** Quick / Full / Spec / Refinement pipeline’larını tetiklemek.

Girdi:

```
{
  "project_path": "...",
  "prompt": "...",
  "pipeline_mode": "full_analysis",
  "override_models": null
}
```

Çıktı:

* MCP üzerinden streamed progress
* Pipeline bitince final_result döner

---

### 2.3 `llm.get_latest_report`

Pipeline bittikten sonra son raporu almak için.

Çıktı:

```
{
  "report": "<Final Architectural Report text>"
}
```

---

### 2.4 `llm.get_spec_files`

Üretilen YAML dosyalarının içeriklerini döner.

Çıktı:

```
{
  "project_context": "...yaml...",
  "modules": {
      "module1.yaml": "...",
      "module2.yaml": "..."
  }
}
```

---

# 3. Bridge → Orchestrator Entegrasyonu

Bridge, orchestrator’a doğrudan API çağrısı yapar.

Zorunlu endpoint'ler:

> **Note:** All API endpoints use the `/api/v1/` prefix for versioning (Requirements: 23.1).

### 3.1 `/api/v1/pipeline/run`

POST
Pipeline başlatır.

### 3.2 `/api/v1/pipeline/progress/:run_id`

GET
Progress eventleri sağlar.

### 3.3 `/api/v1/pipeline/result/:run_id`

GET
FinalArchitecturalReport verir.

### 3.4 `/api/v1/spec/modules`

GET
Üretilen YAML dosyalarını döner.

### 3.5 `/api/v1/spec/project_context`

GET
Project context YAML dosyasını döner.

Bağlantı yapısı config'den gelir:

```
architect.config.json → orchestrator.host / orchestrator.port
```

---

# 4. Hata Yönetimi

MCP Bridge, tüm hataları MCP hata formatına çevirir.

Örnek:

**Orchestrator hatası:**

```
{
  "error": {
    "code": "INDEX_NOT_READY",
    "message": "Index must be built before running pipelines"
  }
}
```

**MCP’ye dönüşen format:**

```
{
  "error": "INDEX_NOT_READY",
  "message": "Index must be built before running pipelines"
}
```

Ajan bunu kendi UI'sında gösterir.

---

# 5. Pipeline Event Stream

Bridge, orchestrator’dan gelen eventleri MCP’nin `result.stream` formatına çevirir.

Örnek:

**Orchestrator event:**

```
{ "state": "execute_roles", "role": "architect" }
```

**MCP stream eventi:**

```
{
  "type": "update",
  "content": "execute_roles: architect"
}
```

Ajan bunu progress çubuğu, terminal veya UI overlay olarak gösterir.

---

# 6. Güvenlik ve İzolasyon

Bridge şu güvenlik ilkelerine uymalıdır:

* Dosya içeriği asla orchestrator’a gönderilmez
* Yalnızca path bilgileri gider
* Embedding tamamen lokal ve orchestrator tarafındadır
* Bridge, model API key'lerini bilmez
* Bridge, workspace dosyalarına erişmez

Bu mimari özellikle güvenlik açısından kritiktir.

---

# 7. MCP Bridge Dosya Yapısı

```
apps/mcp_bridge/
  src/
    server.ts
    tools/
      index_status.ts
      run_pipeline.ts
      get_latest_report.ts
      get_spec_files.ts
    utils/
      validation.ts
      orchestrator_client.ts
  package.json
```

Her tool bağımsızdır.

---

# 8. Çalışma Sırası

Kullanıcı (Cursor / Claude Code / Cline / Kiro) şu adımlarla çalışır:

1. Ajan workspace’i tarar
2. Ajan `llm.index_status` tool’unu çağırır
3. Index hazır değilse kullanıcıya uyarı verir
4. Pipeline tetiklenirse
5. Bridge → orchestrator’a iletir
6. Orchestrator tüm council’i çalıştırır
7. Bridge stream eventlerini ajana iletir
8. Ajan pipeline sonucu UI’ya yansıtır
9. Spec dosyaları workspace’e yazılır
10. Ajan Orchestrator’dan son raporu alır

Bu süreç, her AI coding agent için aynıdır.

---

# 9. Genişleme Olanakları

MCP Bridge gelecekte şu özellikleri alacak:

* Çok projeli workspace desteği
* Custom pipeline mode’ları
* Session ID tabanlı pipeline yönetimi
* Remote orchestrator cluster desteği
* Local orchestrator docker runtime

Bu eklemeler backward-compatible şekilde yapılmalıdır.

---

# 10. Temel Tasarım İlkeleri

1. Bridge **çok ince** olmalı (thin layer).
2. İş mantığı orchestrator’da kalmalıdır.
3. Input doğrulama strict olmalıdır.
4. Progress eventleri kaybolmamalıdır.
5. AI ajanları minimum konfigürasyon ile çalışabilmelidir.

---