---

# ARCHITECTURE_OVERVIEW.md

**LLM Council Orchestrator – Architecture Overview**

Bu belge, monorepo içindeki üç ana uygulamanın (orchestrator, mcp_bridge, vscode_extension) ve shared paketlerin birbirleriyle nasıl etkileştiğini açıklayan yüksek seviye mimari özetidir.
Amaç, sistemin **bileşenlerini**, **sınırlarını**, **akışlarını**, **katmanlarını** ve **tüm veri hareketini** tek bir yerde tam olarak anlamaktır.

---

# 1. Üst Mimari

LLM Council Orchestrator; üç ana katmandan oluşur:

```
               ┌────────────────────────┐
               │     VSCode Extension   │
               └──────────┬─────────────┘
                          │ HTTP/WebSocket
                          ▼
               ┌────────────────────────┐
               │       MCP Bridge       │
               └──────────┬─────────────┘
                          │ MCP / JSON-RPC
                          ▼
               ┌────────────────────────┐
               │       Orchestrator     │
               │  (Pipeline Engine)     │
               └────────────────────────┘
```

Bu yapıdaki temel prensip:

**UI her zaman en üstte, iş mantığı en ortada, index/embedding ve model çağrıları en altta konumlanır.**

Extension → Bridge → Orchestrator hiyerarşisi **sıkı ve değişmez bir sözleşmedir**.

---

# 2. Monorepo Genel Yapısı

```
apps/
  orchestrator/        → Pipeline engine + council + LLM logic
  mcp_bridge/          → MCP server
  vscode_extension/    → VSCode UI

packages/
  shared-types/        → Tipler
  shared-utils/        → Küçük yardımcılar
  shared-config/       → Pipeline modları
```

---

# 3. Orchestrator’ın İç Mimari Katmanları

Orchestrator **beyin** görevini görür. İç mimarisi 4 temel katmandan oluşur:

```
┌──────────────────────────────────────────────┐
│                 API Layer                    │
│ (Bridge veya başka bir giriş noktasından gelen│
│     pipeline tetikleme isteklerini alır)      │
└──────────────────────────────────────────────┘
                 ▼
┌──────────────────────────────────────────────┐
│             Pipeline Engine                  │
│  (state machine, step scheduling, role calls)│
└──────────────────────────────────────────────┘
                 ▼
┌──────────────────────────────────────────────┐
│             Integration Layer                │
│ indexer client                               │
│ model gateway                                │
│ config loader                                │
└──────────────────────────────────────────────┘
                 ▼
┌──────────────────────────────────────────────┐
│               Observability                  │
│ loglama, run_id üretimi, izleme              │
└──────────────────────────────────────────────┘
```

Bu mimari **temiz sınırlar** sağlar:

* API Layer iş mantığı bilmez
* Pipeline Engine dış dünya bilmez
* Integration layer dış bağımlılıkların bağlandığı yerdir
* Observability hiçbir iş mantığı içermez

---

# 4. Pipeline Engine – Sistem Kalbi

Pipeline Engine, **state machine tabanlıdır** ve dört mod çalıştırır:

1. **quick_diagnostic**
2. **full_analysis**
3. **spec_generation**
4. **refinement**

Her mod bir dizi adım içerir (özet):

```
load_config
↓
load_index
↓
sampling_engine
↓
role_execution (5 rol)
↓
dual_aggregation
↓
final_report
↓
(optional) spec_generation
```

Pipeline Engine her adımı **idempotent**, açık sorumluluklu ve bağımsız olarak işler.

---

# 5. Council Tasarımı (Multi-Agent / Multi-Model)

Beş rol vardır:

| Rol             | Görev                 | Primary           | Secondary       |
| --------------- | --------------------- | ----------------- | --------------- |
| Legacy Analysis | eski monolith okunumu | GLM-4.6           | GPT-5.1         |
| Architect       | hedef mimari          | GPT-5.1           | Claude Opus 4.5 |
| Migration       | geçiş stratejisi      | Claude Sonnet 4.5 | GPT-5.1         |
| Security        | izolasyon ve risk     | Claude Sonnet 4.5 | –               |
| Aggregator      | çıktıları birleştirme | GPT-5.1           | Opus 4.5        |

**Dual-model + cross-critique** mekanizması:

1. Her rol aynı promptu iki modele gönderir.
2. İki model birbirini eleştirir.
3. Fusion aşamasında tek sonuç çıkar.

Bu, karar kalitesini ciddi şekilde artırır.

---

# 6. MCP Bridge Mimarisı

MCP Bridge, gerçek iş mantığı içermez.

Tek görevi:

```
IDE Agent ←→ MCP Bridge ←→ Orchestrator
```

* JSON-RPC tabanlıdır
* Dosya okuma/yazma Orchestrator’dan değil Bridge’den yapılır
* Indexer, VSCode, CLI veya başka kaynaklardan gelen talepleri normalize edip Orchestrator’a iletir

Bridge, “transport” katmanıdır; hiçbir mimari hesap yapmaz.

---

# 7. VSCode Extension Mimarisı

VSCode Extension tamamen bir UI’dır.

Görevleri:

* Orchestrator pipeline’larını tetiklemek
* Pipeline progress göstermek
* Üretilen YAML dosyalarını workspace’e yazmak
* Kullanıcıdan proje scope’u almak
* Config paneli göstermek
* Log paneli göstermek

Extension **LLM çağırmaz, council bilmez**.

---

# 8. Indexer / Embedding Mimarisi

Indexer monorepo içinde ayrı bir uygulama veya dış bağımsız bir servis olabilir.

**Orchestrator indexer değildir.**

Indexer’ın görevleri:

* Dosyaları taramak
* Chunk’lamak
* Embedding oluşturmak
* Vektör araması yapmak

Embedding **daima lokal** çalışır:

* BGE-large
* E5-large
* BGE-m3 (cihaz güçlüyse)

Indexer yalnızca bir **read-only** API sunar:

```
/isIndexed
/getChunks
/semanticSearch
/getMetadata
```

---

# 9. Veri Akışı (End-to-End)

End-to-end akış:

```
VSCode UI
    ▼  (HTTP/WebSocket)
MCP Bridge
    ▼  (MCP JSON-RPC)
Orchestrator API
    ▼
Pipeline Engine
    ▼
Indexer + Embedding + Model Gateway
    ▼
Dual Aggregation
    ▼
Final Report
    ▼
Spec Files (optional)
    ▼
Bridge → VSCode → Workspace
```

Bu akış deterministik ve tamamen kontrol altındadır.

---

# 10. Config Mimarisi

Tek kaynak dosyası:

```
architect.config.json
```

Bu dosya modelleri, embedding tercihlerini, parallel/sequential modunu ve runtime ayarlarını içerir.

Bu dosya:

* Orchestrator’ın parametre setidir
* UI veya Bridge üzerinden düzenlenmez
* Basit ve düz JSON’dur

---

# 11. Sistem Sınırları (Boundaries)

**Bir bileşen diğerinin sorumluluk alanına asla geçmez:**

| Sınır                        | Açıklama                        |
| ---------------------------- | ------------------------------- |
| VSCode → Orchestrator        | Sadece tetikleme; hesaplama yok |
| MCP → Orchestrator           | Sadece routing; hesaplama yok   |
| Orchestrator → Indexer       | Okuma; embedding yazdırma yok   |
| Orchestrator → Model Gateway | Sadece API çağrıları            |
| Orchestrator → VSCode        | UI yönlendirme yok              |

Bu sınırlar sistemin “temiz mimari” yapısını korur.

---

# 12. Geleceğe Açılan Kapılar

Bu mimari ileride kolayca genişler:

* Inline editor integration (Cline/Continue)
* Multi-user workspace
* Distributed indexer
* On-device LLM modelleri
* Plugin tabanlı rol sistemi

Bu mimari bu genişlemeleri “zero-friction” destekleyecek şekilde tasarlanmıştır.

---