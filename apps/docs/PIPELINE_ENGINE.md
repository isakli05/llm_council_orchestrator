---

# PIPELINE_ENGINE.md

**LLM Council Orchestrator – Pipeline Engine & State Machine Tasarımı**

Bu belge, orchestrator içerisindeki **pipeline engine’in çalışma prensiplerini**,
**state machine modelini**,
**modlar arası farklılıkları**,
**rollerin çağrı sırasını**,
**parallel/sequential yürütme mantığını**
ve
**dual-model işleme akışını**
detaylı şekilde açıklar.

Pipeline Engine, tüm LLM Council mimarisinin “kalp atışıdır”; her fonksiyon ve her rol onun komutu ile çalışır.

---

# 1. Pipeline Engine’in Görevi

Pipeline Engine:

1. Kullanıcı input’unu alır
2. Config’i yükler
3. State machine’i başlatır
4. Rolleri tetikler
5. Aggregator’a geçişi yönetir
6. Hatayı yakalar, loglar
7. Pipeline tamamlandığında tüm çıktıyı üretir

Özet:

**Tek bir pipeline çağrısı = deterministik, izlenebilir, state-driven süreç**

Her pipeline run’ı için benzersiz bir **run_id** üretilir.

---

# 2. Pipeline Modları

Pipeline Engine dört mod destekler:

```
quick_diagnostic
full_analysis
spec_generation
refinement
```

Her mod aynı state machine çatısını paylaşır ancak şu açılardan farklılaşır:

| Mod              | Roller               | Sampling        | Output         | Kullanım      |
| ---------------- | -------------------- | --------------- | -------------- | ------------- |
| quick_diagnostic | Minimum              | Hafif           | Risk özeti     | İlk görünüm   |
| full_analysis    | Tüm roller           | Geniş           | Final Report   | Ciddi analiz  |
| spec_generation  | Aggregator + SpecGen | Hedefli         | Spec dosyaları | Dosya üretimi |
| refinement       | Targeted             | Sorun bölgeleri | Yeni spec      | İyileştirme   |

---

# 3. State Machine Yapısı

Pipeline bir **deterministik state machine** olarak işler.

Aşağıdaki state diyagramı tüm modlar için ortaktır:

```
        ┌──────────────┐
        │ load_config  │
        └──────┬───────┘
               ▼
     ┌──────────────────────┐
     │ ensure_index_ready   │
     └───────────┬──────────┘
                 ▼
     ┌──────────────────────┐
     │   perform_sampling   │
     └───────────┬──────────┘
                 ▼
     ┌──────────────────────┐
     │    execute_roles     │
     └───────────┬──────────┘
                 ▼
     ┌──────────────────────┐
     │  dual_aggregation    │
     └───────────┬──────────┘
                 ▼
     ┌──────────────────────┐
     │ generate_final_report│
     └───────────┬──────────┘
                 ▼
     ┌──────────────────────┐
     │     spec_output      │  (yalnızca spec/refinement)
     └──────────────────────┘
```

Her state:

* Tek sorumluluğa sahiptir
* Hatasını üst katmana fırlatır
* Timeout'a sahiptir
* Tüm input/output'u loglar
* Idempotent tasarlanır

---

# 4. State: load_config

Bu state:

* architect.config.json yükler
* Modelleri okur
* Parallel/sequential modunu belirler
* Guardrail değerlerini alır
* Genel doğrulamayı yapar

Output:

```
{
  models: {...},
  pipeline_mode: "full_analysis",
  guardrails: {...},
  embedding_config: {...}
}
```

---

# 5. State: ensure_index_ready

Pipeline hiçbir şekilde index hazır değilken başlayamaz.

Bu state:

1. Indexer’a `GET /isIndexed` gönderir
2. Eğer false → Pipeline durur ve kullanıcıya “Index Required” döner
3. Eğer true → metadata çekilir

Bu state index’i oluşturmaz, sadece hazır olup olmadığını doğrular.

---

# 6. State: perform_sampling

Sampling Engine burada devreye girer.

Sampling modları:

* quick (light sampling)
* full (semantic dense sampling)
* spec (role-specific sampling)
* refinement (issue-focused sampling)

Output:

```
{
  context_chunks: [...],
  sampling_summary: {...}
}
```

Sampling Engine:

* Dil bazlı ayrıştırma yapabilir
* semanticSearch ile ilgili kod bloklarını seçer
* Token limitini ihlal etmez
* Roller için hedefli context hazırlar

---

# 7. State: execute_roles

Bu state tüm rollerin tek tek çalışmasını başlatır.

Roller:

```
legacy_analysis
architect
migration
security
aggregator_precheck (opsiyonel)
```

## 7.1 Parallel vs Sequential

Config ayarı:

```
"pipeline": {
  "execution": "parallel" | "sequential"
}
```

Default: **parallel**

Yürütme sırası:

### Parallel Mode:

```
legacy_analysis  ┐
architect        ├── çalışır → sonuçlar Role Manager'e gider
migration        ┘
security         → sequential çalışabilir (güvenlik sebepleriyle)
```

### Sequential Mode:

```
legacy → architect → migration → security → aggregator
```

---

# 8. Rollerin Çalışma Akışı

Her rol şu pipeline ile çağrılır:

```
primary_output = call(primary_model)
secondary_output = call(secondary_model)   (varsa)
critique_rounds = run_cross_critique(primary_output, secondary_output)
fused_output = fuse(primary, secondary, critiques)
```

Cross-critique, council tasarımının çekirdeğidir.

## 8.1 Cross-Critique Döngüsü

Tipik akış:

1. Primary output → Secondary critique
2. Secondary output → Primary critique
3. Model pair → Strateji karşılaştırma
4. Fusion: Ortak karara varılabilir bir içerik oluşturma

Output:

```
{
  fused,
  primary_raw,
  secondary_raw,
  critiques
}
```

---

# 9. State: dual_aggregation

Bu state, role sonuçlarını alır ve final bütünleştirmeyi yapar.

İşlem:

1. Tüm rollerden fused output topla
2. Tutarsızlık analizi yap
3. Çelişki çözümü uygula
4. Final içerik akışını standardize et
5. İki model ile dual run (GPT-5.1 + Opus 4.5)
6. Tek bir Final Architectural Report üret

Output:

```
final_report
```

---

# 10. State: generate_final_report

final_report → formatlanır:

* Bölümler
* Başlıklar
* Numbering
* JSON + Markdown + Text
* VSCode paneline uygun versiyon
* MCP Bridge’e uygun versiyon

---

# 11. State: spec_output (yalnızca spec + refinement)

Spec Output şu dosyaları üretir:

```
project_context.yaml
project_structure.yaml  (gerekirse)
modules/*.yaml
```

Kurallar:

* FULL OVERWRITE
* İnsan tarafından düzenlenemez
* Yalnızca manuel tetikleme ile başlar
* Final report olmadan çalışamaz

---

# 12. Error Handling Politikası

Pipeline Engine şu durumlarda akışı keser:

1. Index hazır değil
2. Model çağrısı 3 kez retry sonrası başarısız
3. Config geçersiz
4. Rol output’u boş/dengesiz
5. Aggregator çelişki çözemiyor

Bu noktada pipeline yarıda kesilir.

---

# 13. Loglama ve Observability

Her step loglanır:

```
[run_id] [timestamp] [STATE] [message]
```

Ayrıca:

* roles.log
* model.log
* aggregator.log
* pipeline.log

gibi dosyalar veya console output üretilebilir.

---

# 14. Pipeline Engine İçin Kararlılık Kriterleri

Bir pipeline engine’in “stable” sayılması için:

* Aynı context ile aynı sırada aynı state’leri çalıştırması
* Token limitlerinin tutarlı yönetilmesi
* Indexer/Bridge/VSCode dependency’lerinin açıkça ayrılmış olması
* Her state’in tek sorumluluğunun olması
* Timeout’ların sabit olması
* Parallel modun hiçbir state’i bozmaması

---

# 15. Geleceğe Dönük Genişleme Alanları

* Plugin-based state machine
* Dinamik rol ekleme
* Çoklu pipeline paralel çalıştırma
* Remote orchestrator cluster
* Embedded synergy (local model hybrid)
* Auto-refinement loop

---
