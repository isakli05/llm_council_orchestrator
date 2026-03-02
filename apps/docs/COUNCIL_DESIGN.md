---

# COUNCIL_DESIGN.md

**LLM Council Orchestrator – Multi-Model, Multi-Role Council Tasarımı**

Bu belge, LLM Council mimarisinin **teorik çerçevesini**,
**roller arası işleyişi**,
**dual-model karar sistemini**,
**cross-critique mekanizmasını**,
**fusion karar mantığını**,
**deterministik council yürütme politikalarını**,
ve
**Final Architectural Report üretimindeki davranış modelini**
profesyonel düzeyde anlatır.

Council sistemi, “tek modelin rastlantısal karar verme riskini” ortadan kaldırmak için tasarlanmıştır.

---

# 1. Council Nedir?

Council, birden fazla **uzman rol** ve birden fazla **LLM modelinin** birlikte çalıştığı,
kademeli bir **karar alma mekanizmasıdır**.

Amaç:

* Tek modelin zayıflığını gidermek
* Çelişkileri yakalamak
* Her rolün uzman bilgisini kullanmak
* Güvenilir, sürdürülebilir mimari kararlar elde etmek

Council şu bileşenlerden oluşur:

1. Roller (Legacy, Architect, Migration, Security)
2. Dual-model execution
3. Cross-critique mekanizması
4. Fusion engine
5. Aggregator (Final Report üretimi)

---

# 2. Council Neden Gereklidir?

Tek bir model:

* Tutarsızlık üretebilir
* Yanlış çıkarım yapabilir
* Yanlış kod/konsept bağdaştırabilir
* Hallucination yüzünden yanlış mimari karar verebilir
* Async token üretimi nedeniyle deterministik değildir

Council sistemi bunu çözer:

**Bir karar → En az 4 rol analizi + Dual-model cross-critique + Aggregator kontrollü fusion**

Bu, hataya dayanıklı bir mimari tasarım mekanizmasıdır.

---

# 3. Council Rolleri

Council dört uzman rolün analizine dayanır:

| Rol             | Amaç                                          |
| --------------- | --------------------------------------------- |
| Legacy Analysis | Mevcut monolith yapıyı anlamak                |
| Architect       | Hedef modern mimariyi belirlemek              |
| Migration       | Geçiş stratejisini oluşturmak                 |
| Security        | Tenant isolation & güvenlik modeli tasarlamak |

Bu rollerden çıkan içerik aggregator’a gider.

---

# 4. Council’in Çalışma Mimarisi

```
     ┌───────────┐
     │  Legacy   │
     └─────┬─────┘
           │
     ┌───────────┐
     │ Architect │
     └─────┬─────┘
           │
     ┌───────────┐
     │ Migration │
     └─────┬─────┘
           │
     ┌───────────┐
     │ Security  │
     └─────┬─────┘
           ▼
     ┌─────────────────────────┐
     │ Dual Aggregator & Fusion│
     └─────────────────────────┘
           ▼
     FINAL ARCHITECTURAL REPORT
```

Her rol bağımsızdır.
Her rolün sonucu aggregator’da birleşir.

---

# 5. Dual-Model Council Mantığı

Council sadece çoklu rol değildir; aynı zamanda çoklu modeldir.

Her rol:

* **Primary model**
* **Secondary model**

ile çalışır.

### Primary Model → Ana karar üretir

### Secondary Model → Eleştirir + Alternatif öneri üretir

Ardından fusion engine iki modelin çıktısını birleştirir.

Bu, kararların:

* Dengeli
* Yanlışlıklara karşı korumalı
* Tutarlı

olmasını sağlar.

---

# 6. Council’in 5 Aşamalı Çalışma Döngüsü

## 6.1 Aşama 1 — Primary Output

Primary model:

* Rolün uzmanlık hedefini
* Sampling context’i
* Kod örneklerini
* Mimari hedefleri
* DSL / output formatını

input olarak alır ve ilk öneriyi üretir.

Bu **yönlendirici** karardır.

---

## 6.2 Aşama 2 — Secondary Output

Secondary model:

* Bağımsız şekilde kendi yorumunu üretir
* Farklı bir zihinsel model sağlar
* Mimari hataları veya eksikleri işaret edebilir
* Alternatif yapılar sunabilir

Bu **dengeleyici** karardır.

---

## 6.3 Aşama 3 — Cross-Critique Round 1

**Secondary → Primary Eleştirisi**

Secondary model, Primary’nin yaptığı hataları ortaya koyar:

* Gereksiz karmaşıklık
* Yanlış mimari öneri
* Veritabanı modeli uyumsuzluğu
* SEO riskleri
* Tenant isolation eksikleri
* Domain routing çökmeleri

---

## 6.4 Aşama 4 — Cross-Critique Round 2

**Primary → Secondary Eleştirisi**

Primary model:

* Secondary’nin yanlış varsayımlarını
* Kritik güvenlik risklerini
* Uygulanamaz önerileri

analiz eder.

---

## 6.5 Aşama 5 — Fusion Decision

Fusion engine final tek karar oluşturur:

* Her iki modelin güçlü yönlerini alır
* Hataları temizler
* Tutarsızlıkları çözer
* Tek, dengeli bir “role-level fused output” üretir

Bu fused output aggregator’a gider.

---

# 7. Council Output Standartları

Her rolün council output’u şu formatta olur:

```json
{
  "role": "architect",
  "primary_raw": "...",
  "secondary_raw": "...",
  "critiques": {
    "primary_on_secondary": "...",
    "secondary_on_primary": "..."
  },
  "fused_output": "...",
  "runtime": {
    "primary_ms": 2100,
    "secondary_ms": 2400
  }
}
```

Bu hem debug hem aggregator için standarttır.

---

# 8. Aggregator Mantığı

Aggregator council’in üst seviyesidir.

Görevleri:

* Rol sonuçlarını toplar
* Aralarındaki çelişkileri bulur
* Tutarsızlık çözümü yapar
* Final içerik akışını standartlaştırır
* Bölümler halinde **Final Architectural Report** oluşturur

### Tipik Bölümler:

1. Legacy Overview
2. Target Architecture
3. Tenant Model
4. Routing / SEO planı
5. Data / API Model
6. Migration Strategy
7. Risk Analysis
8. Security Model
9. Recommendations
10. Spec Summary

---

# 9. Council Guardrail Kuralları

Council deterministiktir. Guardrail kuralları:

### 9.1 Index gerekliyse pipeline başlamaz

Final kararlar **semantic context** olmadan yapılamaz.

### 9.2 4 rol + 1 aggregator → minimum gereklilik

Daha azı mimari doğruluk seviyesini düşürür.

### 9.3 Dual-model zorunludur (security hariç)

Hataları azaltır.

### 9.4 Parallel yürütme default

Performance > sequence
Ama kullanıcı override edebilir.

### 9.5 Final Report olmadan spec generation imkansız

Spec dosyaları körü körüne üretilemez.

---

# 10. Modeller Arası İş Bölümü

Council modelleri şu uzmanlık çerçevesine göre seçildi:

| Model             | Uzmanlık                              | Council Rolü                    |
| ----------------- | ------------------------------------- | ------------------------------- |
| GLM-4.6           | Legacy kod, PHP, uzun metin doğruluğu | Legacy Analysis                 |
| GPT-5.1           | Genel mimari, kritik analiz           | Architect, Secondary Legacy     |
| Claude Opus 4.5   | High-level reasoning, planlama        | Architect Secondary, Aggregator |
| Claude Sonnet 4.5 | Security, isolation, API riskleri     | Security, Migration Primary     |
| GPT-5.1           | Aggregator Primary                    | Aggregator                      |

Bu eşleşme pratik test sonuçlarına dayalıdır.

---

# 11. Council’in Deterministik Olmasını Sağlayan İlkeler

1. Aynı input için aynı state sırası
2. Aynı sampling kuralları
3. Aynı rol sırası
4. Aynı model sırala akışı
5. Timeout değerlerinin sabit olması
6. Fusion algoritmasının tutarlı olması

Bunlar council’in “tekrarlanabilir” olmasını sağlar.

---

# 12. Council Hangi Sorunları Çözer?

* Tek modelin yalancı tutarlılığı
* Yanlış mimari kararlar
* Atlanan riskler
* Migration planındaki boşluklar
* Tenant isolation hataları
* SEO / routing bütünlüğü problemleri
* Veri akışındaki uyumsuzluklar

---

# 13. Gelecekteki Potansiyel Genişlemeler

* 6–8 rol desteği
* Domain-specific role packs (FinTech, SaaS, Marketplace)
* Local tiny-models ile self-critic first-pass
* Model-level caching
* Role-level parallel fusion
* Distributed council nodes

---