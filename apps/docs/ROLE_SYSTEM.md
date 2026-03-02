---

# ROLE_SYSTEM.md

**LLM Council Orchestrator – Role Architecture & Execution Model**

Bu belge LLM Council sisteminin **rol mimarisini**,
her rolün **sorumluluk alanlarını**,
**model seçimi stratejisini**,
**dual-model cross-critique mekanizmasını**,
**roller arası veri akışını**,
ve
**Aggregator’a giden final output formatını** detaylı şekilde açıklar.

Rol sistemi, LLM Council tasarımının beynin içindeki ayrı uzmanlık merkezleridir.
Her rol kendi “bakış açısını” üretir, orchestrator bunları birleştirir.

---

# 1. Rol Sistemi Nedir?

Rol sistemi, pipeline engine tarafından çağrılan **uzman modellerden** oluşur:

1. Legacy Analysis Agent
2. Architect Agent
3. Migration Strategy Agent
4. Security/Isolation Agent
5. Dual Aggregator & Critique Fusion Agent

Her rol:

* Kendi uzmanlık alanında analiz yapar
* Dual-model ile çalışabilir
* Context chunk’ları kullanır
* Pipeline Engine’e structured output döner

---

# 2. Roller Arası Ayrım

Her rol **farklı bir uzman zekası** temsil eder.

Ayrım prensipleri:

* Bir rol asla diğerinin işini yapmaz
* Bir rolün output’u bir sonraki rolü etkileyebilir
* Her rol yalnızca kendi alanındaki mimari kararları alır
* Roller birbirinin yerine geçmez

---

# 3. Roller ve Sorumlulukları

## 3.1 Legacy Analysis Agent

Amaç:

* Mevcut legacy kodu anlamak
* Routing, controller, PHP view, template yapısını çözmek
* Veri modellerini ve bağımlılıkları çıkarmak
* Teknolojik riskleri belirlemek
* Kodda görülen anti-pattern’leri işaretlemek

Kullandığı modeller:

```
primary: GLM-4.6
secondary: GPT-5.1
mode: dual-model (cross-critique enabled)
```

Output:

* Kod yapısı özeti
* Routing haritası
* View/template yapısı
* API endpoint yapısı
* Teknoloji borcu listesi
* Risk alanları

---

## 3.2 Architect Agent

Amaç:

* Modern multi-tenant SaaS hedef mimarisini tasarlamak
* RLS, domain routing, tenant isolation
* Temel servislerin ayrımı
* Multi-language / multi-currency stratejileri
* SEO ve URL bütünlüğü planı
* Event-driven + modular tasarım önerileri

Modeller:

```
primary: GPT-5.1
secondary: Claude Opus 4.5
mode: dual-model (cross-critique enabled)
```

Output:

* Yüksek seviye mimari
* Domain model
* Servis sınırları
* Migration hedef yapısı
* Frontend/Backend mimari kararları

---

## 3.3 Migration Strategy Agent

Amaç:

* Legacy → Modern mimariye dönüşüm için fazlandırılmış migration planı çıkarmak
* Riskleri yönetilebilir fazlara bölmek
* Backward compatibility stratejileri
* Eski kodla yeni kodun bir süre birlikte çalışması için plan
* Domain seviye “cutover” adımları

Modeller:

```
primary: Claude Sonnet 4.5
secondary: GPT-5.1
mode: dual-model (cross-critique enabled)
```

Output:

* Migration fazları
* Modül bazında ayrım
* Veri modeli dönüşüm planı
* Yapısal riskler için çözüm önerileri

---

## 3.4 Security & Isolation Agent

Amaç:

* Tenant isolation
* Data leakage risk analizi
* RLS model tasarımı
* Auth stratejileri
* API güvenliği
* Multi-tenant saldırı yüzeyleri kontrolü

Model:

```
primary: Claude Sonnet 4.5
secondary: null
mode: single-model
```

Security kritik bir rol olduğu için secondary model opsiyoneldir;
öneri: İleride dual-model yapılabilir.

Output:

* Güvenlik riskleri
* İzolasyon modeli
* Auth flow
* Endpoint riskleri
* Zafiyet analizi

---

## 3.5 Dual Aggregator & Critique Fusion Agent

Bu rol diğer rollerden farklıdır;
amacı **tüketmek + birleştirmek**tir.

Amaç:

* Legacy, Architect, Migration ve Security rollerinin çıktısını almak
* Tutarsızlıkları bulmak
* Çelişen noktaları işaretlemek
* Çözüm stratejileri önermek
* Tek bir “Final Architectural Report” oluşturmak

Modeller:

```
primary: GPT-5.1
secondary: Claude Opus 4.5
mode: dual-model (cross-critique enabled)
```

Output:

**Final Architectural Report**

---

# 4. Role Execution Pipeline

Tüm roller aynı execution şablonuna sahiptir:

```
PRIMARY_MODEL → PRIMARY_OUTPUT
SECONDARY_MODEL → SECONDARY_OUTPUT (varsa)
CROSS_CRITIQUE ROUND-1
CROSS_CRITIQUE ROUND-2
FUSION_ENGINE → FUSED_OUTPUT
RETURN: role_output
```

Role Manager bunu tek bir adım olarak kapsüller.

---

# 5. Model Seçimi Stratejisi

Config'den yüklenen modeller override edilebilir.

Örnek config:

```json
"models": {
  "legacy_analysis": ["glm-4.6", "gpt-5.1"],
  "architect": ["gpt-5.1", "claude-opus-4.5"],
  "migration": ["claude-sonnet-4.5", "gpt-5.1"],
  "security": ["claude-sonnet-4.5"],
  "aggregator": ["gpt-5.1", "claude-opus-4.5"]
}
```

Kullanıcı pipeline çağrısında:

```
pipeline.run({
  overrideModels: {
    architect: ["gpt-5.1", "gpt-4.1"]
  }
})
```

gibi custom model seti kullanabilir.

---

# 6. Prompt Yapısı

Her rolün kendi prompt builder fonksiyonu vardır.

Örnek “Architect Agent” prompt:

```
ROLE: Architect Agent
OBJECTIVE: Legacy sistemden modern multi-tenant SaaS mimarisi tasarlamak.
CONTEXT: {context_chunks}

GUIDELINES:
- tenant isolation
- rls
- domain routing
- multi-language
- seo
- event-driven
- security boundaries

OUTPUT FORMAT:
{JSON structured spec}
```

Prompt Builder rollerin:

* hedefini (objective)
* context’ini
* output formatını
* constraint’lerini

otomatik oluşturur.

---

# 7. Dual-Model Cross-Critique

Council sisteminin en kritik mekanizmasıdır.

Akış:

### 7.1 Primary Run

Primary model → ana öneriyi üretir.

### 7.2 Secondary Run

Secondary model → bağımsız öneri üretir.

### 7.3 Critique Round 1

Secondary → Primary output’u eleştirir:

* eksikler
* yanlış çıkarımlar
* riskli öneriler

### 7.4 Critique Round 2

Primary → Secondary output’u değerlendirir:

* tutarsızlıklar
* yanlış varsayımlar
* hatalı mimari kararlar

### 7.5 Fusion Engine

Her iki öneriyi de birleştiren son aşama:

```
fused_output = unify(primary, secondary, critiques)
```

Bu fused output final değil, aggregatora gider.
Son kararı aggregator verir.

---

# 8. Role Output Formatı

Standart role output formatı:

```json
{
  "role": "architect",
  "primary_raw": "...",
  "secondary_raw": "...",
  "critiques": { ... },
  "fused_output": "...",
  "metadata": {
    "model_primary": "...",
    "model_secondary": "...",
    "runtime_ms": 2300
  }
}
```

Her rol output’u ayrı bir bölüme dönüşür.

---

# 9. Aggregator'a Veri Akışı

Role Manager tüm fused output’ları toplar:

```
legacy_data
architect_data
migration_data
security_data
```

Bunlar aggregator’a şu formatla gider:

```
{
  "legacy": { ... },
  "architect": { ... },
  "migration": { ... },
  "security": { ... }
}
```

Aggregator bu verileri **Final Architectural Report** haline getirir.

---

# 10. Hata Yönetimi

Bir rol başarısız olursa:

* Pipeline Engine state’i “failed_role_execution” olur
* Diğer roller durdurulur
* Aggregator çalışmaz
* Spec generation engellenir

Başarısız olma sebepleri:

* Model’den boş output
* Yanlış format
* Timeout
* Provider hatası

---

# 11. Performans Hedefleri

| Rol             | Süre        |
| --------------- | ----------- |
| Legacy Analysis | 3–10 saniye |
| Architect       | 5–12 saniye |
| Migration       | 3–10 saniye |
| Security        | 2–6 saniye  |
| Aggregator      | 4–12 saniye |

Pipeline toplamı modlara göre şekillenir.

---

# 12. Genişleme Alanları

* Plugin-based role architecture
* Özel roller (Database Analyst, API Auditor, CI/CD Reviewer…)
* Domain-specific role packs
* Role-level caching
* Hybrid local LLM rolleri

---