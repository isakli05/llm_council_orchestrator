---

# ORCHESTRATOR_DESIGN.md

**LLM Council Orchestrator – Detailed Design Document**

Bu belge orchestrator uygulamasının **iç tasarımını**, **katmanlarını**, **servislerini**, **pipeline state machine yapısını**, **rol yönetimini**, **config modelini**, **model çağrı mekanizmasını** ve **tüm orkestrasyon akışını** en ince ayrıntısına kadar açıklar.
Orchestrator, LLM Council ekosisteminin çekirdek “beyin” uygulamasıdır.

---

# 1. Amaç ve Kapsam

Orchestrator’ın görevi:

1. Kullanıcı veya IDE ajanından gelen pipeline tetikleme isteklerini almak
2. Config’i yüklemek (architect.config.json)
3. Pipeline state machine’i çalıştırmak
4. Indexer’dan veri çekmek
5. Model rollerini (Legacy, Architect, Migration, Security, Aggregator) çağırmak
6. Dual-model + cross-critique süreçlerini işletmek
7. Final Architectural Report üretmek
8. Gerekirse spec dosyalarını (project_context.yaml, module.yaml) üretmek
9. Tüm aşamalarda loglama yapmak

Orchestrator **hiçbir UI içermez**; VSCode ve MCP client’lar sadece ona bağlanır.

---

# 2. Kapsam Dışı (Explicit Boundaries)

Orchestrator:

* Dosya sistemi okuma/yazma yapmaz
* IDE ile UI ilişkisinde görev almaz
* Inline code edit etmez
* LLM entegrasyonunu low-level HTTP connector olarak içermez
* Embedding üretmez (bu Indexer görevidir)
* MCP protokolü uygulamaz (bridge’in görevidir)

---

# 3. Yüksek Seviye Mimari

```
                 ┌─────────────────────────────────┐
                 │      Orchestrator API Layer     │
                 │ (Bridge veya CLI’den gelen istek)│
                 └─────────────────────────────────┘
                                ▼
                 ┌─────────────────────────────────┐
                 │       Pipeline Engine           │
                 │  (State Machine + Scheduler)    │
                 └─────────────────────────────────┘
                                ▼
            ┌──────────────────────────┬───────────────────────────┐
            ▼                          ▼                           ▼
  ┌─────────────────┐      ┌──────────────────────┐     ┌──────────────────────┐
  │ Role Manager     │      │ Indexer Client       │     │ Model Gateway        │
  └─────────────────┘      └──────────────────────┘     └──────────────────────┘
            ▼                          ▼                           ▼
                         ┌───────────────────────────────┐
                         │ Dual Aggregator & Critique    │
                         └───────────────────────────────┘
                                    ▼
                         ┌───────────────────────────────┐
                         │ Final Architectural Report     │
                         └───────────────────────────────┘
                                    ▼
                         ┌───────────────────────────────┐
                         │ Spec Generator (optional)      │
                         └───────────────────────────────┘
```

---

# 4. Modüler Yapı

Her iş yükü bağımsız bir modülde tanımlanır. Aşağıdakiler orchestrator içindeki ana modüllerdir:

```
orchestrator_core/
pipeline_engine/
pipeline_state_machine/
role_manager/
model_gateway/
index_client/
dual_aggregator/
prompt_builder/
config_loader/
logging/
spec_generator/
```

Her modül minimal API ile birbirine bağlanır.

---

# 5. API Layer (Giriş Katmanı)

**API Layer** dış dünyaya açılan tek kapıdır.

Kaynaklar:

* MCP Bridge
* VSCode extension
* CLI (opsiyonel)

Görevleri:

1. Pipeline request almak:

   * prompt
   * pipeline_mode
   * seçili modeller (opsiyonel override)
   * workspace path veya project ID
2. Request’i doğrulamak
3. Pipeline Engine’e yönlendirmek
4. Pipeline progress callback mekanizmasını tetiklemek

API Layer **hiçbir iş mantığı yapmaz**, sadece yönlendirir.

---

# 6. Config Loader

Config dosyası:
**architect.config.json**

Sorumluluklar:

* Model listelerini yüklemek
* Parallel/sequential modunu okumak
* Embedding engine seçimini almak
* Pipeline guardrail parametrelerini yüklemek
* Default ayarları uygulamak

Config loader katmanı hem orchestrator hem de Bridge tarafından okunabilir.

---

# 7. Pipeline Engine – State Machine

Pipeline Engine sistemin en kritik katmanıdır.

Pipeline modları:

1. quick_diagnostic
2. full_analysis
3. spec_generation
4. refinement

Hepsi aynı state machine altyapısını kullanır ama adımları farklıdır.

---

## 7.1 Genel State Machine

Tüm modların ortak iskeleti:

```
STATE: load_config
STATE: ensure_index_ready
STATE: perform_sampling
STATE: execute_roles
STATE: dual_aggregation
STATE: generate_final_report
STATE: spec_output (yalnızca spec/refinement modunda)
```

Her state:

* async çalışır
* idempotent olmalıdır
* hatayı üst katmana fırlatır
* kendi timeout’una sahiptir

---

# 8. Role Manager

Role Manager rol modüllerinin orkestrasyonunu yapar.

Her rol aşağıdaki API ile çalışır:

```
executeRole({
  role_name,
  primary_model,
  secondary_model,
  prompt,
  context_chunks
})
```

**Dual-model cross-critique**:

1. Primary output üretilir
2. Secondary output üretilir
3. Secondary → Primary critique
4. Primary → Secondary critique
5. Fusion: Tek sonuç üretilir

Output:

```
{
  role: "architect",
  fused_output: "...",
  primary_raw: "...",
  secondary_raw: "...",
  critiques: {...}
}
```

---

# 9. Model Gateway

Model çağrılarını soyutlayan tek katmandır.

Görevler:

* OpenRouter
* Anthropic
* OpenAI
* Google AI
* Local LLM (opsiyonel)

Hepsine unified bir API sağlar:

```
callModel({
  provider,
  model,
  system,
  prompt,
  tokens
})
```

Model Gateway iç dizaynı:

```
provider_registry/
  openrouter_client.ts
  anthropic_client.ts
  openai_client.ts
  google_client.ts
  local_llm_client.ts
```

---

# 10. Prompt Builder

Her rolün farklı prompt şablonu vardır.

Prompt Builder:

* Prompt’ları consistent oluşturur
* Context chunk’larını uygun sıraya koyar
* Pipeline moduna göre prompt’u genişletir/daraltır
* Cross-critique mesajlarını üretir

Prompt Builder modları:

```
buildLegacyPrompt()
buildArchitectPrompt()
buildMigrationPrompt()
buildSecurityPrompt()
buildAggregatorPrompt()
```

---

# 11. Index Client

Indexer ayrı bir uygulamadır. Orchestrator, indexer ile HTTP/IPC üzerinden konuşur.

API:

```
GET /isIndexed
POST /index
POST /semanticSearch
GET /chunks
GET /metadata
```

Index Client görevleri:

* Index hazır değilse pipeline’ı bloke etmek
* sampling_engine için semantic search yapmak
* Legacy/Architect/Migration rollerine uygun ilgili chunk’ları sağlamak

Index client **asla** embedding üretmez.

---

# 12. Dual Aggregator

Bu katman, beş rolden gelen çıktıları tek bir Final Architectural Report’a dönüştürür.

Aşamalar:

1. Tutarsızlık kontrolü
2. Çelişki çözümü
3. İçerik birleştirme
4. Yapısal standardizasyon
5. Yaygın mimari anti-pattern’leri işaretleme
6. Final rapor formatı üretme

Dual agregasyon için iki model aynı anda çalışır:

* GPT-5.1
* Claude Opus 4.5

Fusion çıktısı sistemin en kritik dokümanıdır.

---

# 13. Spec Generator

Spec generator yalnızca iki durumda çalışır:

* spec_generation modu
* refinement modu

Çıktılar:

* project_context.yaml
* project_structure.yaml
* modules/*.yaml

Özellikler:

* FULL OVERWRITE
* İnsan tarafından düzenlenmez
* Final Architectural Report’u input alır
* Manuel tetikleme gerektirir

---

# 14. Observability

Akış:

```
run_id: UUID
events: [
  { timestamp, state, detail }
]
```

Log kanalları:

* pipeline.log
* roles.log
* model.log
* indexer.log

Hiçbir PII (kişisel veri) loglanmaz.

---

# 15. Performans

Hedef süreler:

| Mod   | Hedef                       |
| ----- | --------------------------- |
| quick | 5–15 saniye                 |
| full  | 30–120 saniye               |
| spec  | 30–120 saniye               |
| index | değişken, incremental hızlı |

Pipeline Engine paralel/seri modda çalışabilir.

Default: **parallel**

---

# 16. Güvenlik

* Kod embedding için asla uzak API kullanılmaz
* API key loglanmaz
* Çıktılar workspace dışına yazılmaz
* Remote provider’lara sadece kullanıcı key’i ile istek yapılır

---

# 17. Gelecek Genişlemeleri

* Plugin tabanlı rol sistemi
* Inline code refactoring
* Multi-user workspace
* Distributed indexer
* On-device model gateway

Mimari bu genişlemelere hazırdır.

---