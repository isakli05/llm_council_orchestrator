# Hedef Konsey Protokolü (Council Protocol v1 Tasarımı)

> Denetim tarihi: 2026-08-17. Bu belge, dondurulmuş Wave-1 kanıtlarına (bkz. evidence-index.md F1–F24) dayanarak mevcut sistemin ne yapmadığını tanımlar ve hedef protokolü somut, testable bileşenlerle önerir.
> İlke: "daha fazla ajan kullan" bir protokol değildir. Her aşamanın deterministik çıktısı ve reddi (fail-closed) kuralı vardır.

## 0. Mevcut sistemin protokolle ilişkisi (dondurulmuş gerçek)

Mevcut kod = paralel fan-out (aynı prompt → M model, Promise.all) + tek model sentez (sabit `gpt-5.2-pro`) + prompt metninde "consensus" üslubu. Hesaplanmış hiçbir mekanizma yok: eleştiri yok, tartışma yok, uyuşmazlık tespiti yok, hakem yok, oy yok, güven skoru yok, bütçe yok (F9). SPEC/REFINEMENT modları sahte başarı döner (F3–F6). Bu bölümün geri kanı hedeftir.

## 1. Protokol aşamaları

### A1 — Giriş ve karmaşıklık sınıflandırması (deterministik + 1 ucuz LLM çağrısı)
- Girdi: kullanıcı niyeti (doğal dil), mod seçimi (`greenfield | legacy | feature | bug | refinement`).
- Çıktı (JSON Schema ile doğrulanır): `mode`, `risk` (low/med/high), `uncertainty` (0–1 + gerekçe listesi), `domains[]`, `artifact_profile` (aşağıdaki karmaşıklık profillerinden hangi artifact'lerin zorunlu olduğu).
- Karmaşıklık profilleri: **P-mini** (tek amaçlı küçük uygulama: intent+requirements+tasks+traceability), **P-standart** (+ux+architecture+contracts+data+security+testing+operations), **P-legacy** (+legacy/ paketi), **P-critical** (+security derinliği, bağımsız doğrulayıcı zorunlu).
- Sınıflandırıcı çıktısı belirsizse → `UNRESOLVED` işaretle, kullanıcıya tek soruluk netleştirme; cevap yoksa dondurma REDDEDİLİR. (Mevcut sistemin fail-open davranışının tam tersi; F16/F23.)

### A2 — Kanıt paketi (Evidence Pack)
- Kaynaklar: kullanıcı girdisi, repo anlık görüntüsü (indexer çıktısı + keşif sinyalleri — mevcut SignalExtractor/DomainDiscoveryEngine salvaged bileşen), çalışma gözlemleri (test çıktıları, build logları), mevcut dokümanlar, kısıtlar.
- Her kanıt: kararlı `evidence_id` (E-0001…), `provenance` (kaynak yol/URL, toplama zamanı, toplayıcı), `hash` (içerik SHA-256), `kind` (user_input|code|runtime|doc|constraint).
- Kanıt ID'leri sonraki tüm aşamalarda referans zorunludur — izlenebilirliğin temeli.

### A3 — Uyarlanabilir rol yönlendirme (Adaptive Role Routing)
- Rol kataloğu: product, domain, ux, architecture, data, api, security, qa, operations, legacy-analyst, legacy-migration.
- Yönlendirme kuralı: artifact_profile + domains → gereken roller VE her rol için model seti. **Varsayılan olarak her rol tek modele gider**; çoklu model YALNIZCA `impact=high` kararlarında (A5'te belirlenir, iteratif olarak) zorunludur.
- Bu, mevcut sistemin "her rol her zaman 2 model" fan-out'unu (F10: 7+4D amplifikasyon) değiştirir: maliyet, kararın etkisine bağlı olur.

### A4 — Bağımsız öneriler ve eleştiriler (Independent Proposals & Critiques)
- Yüksek etkili kararlar için: N bağımsız görünüm (farklı modeller VE farklı talimat çerçeveleri — anchoring'e karşı: her görünüme diğerlerinin çıktısı VERİLMEZ, yalnızca kanıt paketi verilir).
- Ardından hedefli eleştiri turu: her görünüm, diğerlerinin ÖZET iddialarını (A5 yapıları) alır ve çürütme odaklı eleştiri üretir. Zincir dışı düşünme (chain-of-thought) ASLA istenmez veya saklanmaz; yalnızca kısa, denetlenebilir gerekçe (`rationale ≤ 200 kelime`) ve kanıt referansları.

### A5 — Yapılandırılmış iddialar (Structured Claims)
Her karar adayı (JSON Schema ile doğrulanır):
```yaml
claim_id: C-0007
decision: "Kimlik doğrulama: kısa ömürlü JWT + refresh token"
rationale: "..."            # ≤200 kelime, denetlenebilir
evidence: [E-0003, E-0012]  # A2'den
confidence: 0.72            # model beyanı + kalibrasyon denetimi
impact: high                # high → çoklu görünüm + hakem zorunlu
assumptions: ["OAuth sunucusu mevcut değil"]
alternatives: [             # en az 1 alternatif ZORUNLU
  {option: "Session cookie", rejected_because: "..."}
]
status: proposed | accepted | rejected | UNRESOLVED
```

### A6 — Çatışma defteri (Conflict Ledger)
- Kaynaklar: (i) A4 eleştirilerinde geçen çelişkiler, (ii) kullanıcı kısıtları ile iddia çelişkileri, (iii) iki iddianın aynı karar uzayını farklı çözmesi.
- Kayıt: `conflict_id, claims[], severity (blocker|major|minor), impact, owner (role), status (open|resolved|escalated)`.
- `blocker` açık kalırken spesifikasyon DONDURULAMAZ (A9 kapısı).

### A7 — Hedefli tartışma ve yükseltme (Targeted Debate & Escalation)
- Yalnızca `severity ∈ {blocker, major}` çatışmalar için ek tur; tur sayısı, token, maliyet ve gecikme bütçeleri A8'den düşülür.
- Bütçe tükenirse çözülmemiş karar → `UNRESOLVED` olarak dondurulamaz-spesifikasyona `blocked` işaretiyle işlenir; sessiz icat YASAK (§2.1 gereği).

### A8 — Hakem ve bağımsız doğrulayıcı (Judge & Verifier)
- Hakem modeli, çoğunluğu gerçek saymaz. Puanlama boyutları (her biri 0–1, rubrik deterministik tanımlı): kanıt kapsamı (claimed evidence ∩ mevcut kanıt), kısıt uyumu, test edilebilirlik (her kabul kriteri çalıştırılabilir mi), iç tutarlılık.
- Hakem çıktısı da A5 şemasıyla sınırlıdır; `judge_confidence < eşik` → karar UNRESOLVED kalır.
- Doğrulayıcı (verifier) sentezden SONRA ve farklı model/konfigürasyonla çalışır: kabul edilmiş her kararın spesifikasyon artifact'lerinde karşılığı var mı (traceability), verification command'lar gerçekten koşulabilir mi.

### A9 — Spec derleyici (Spec Compiler, deterministik)
- Kabul edilen iddialar → `spec/` paketi (bkz. proposed-spec-ir.md). Derleme KOD tarafında deterministiktir: LLM yalnızca iddia üretir; artifact birleştirme, hash'leme, sürümleme programatiktir.
- JSON Schema (Zod) ile doğrulama; şema ihlali → derleme başarısız (fail-closed), placeholder doldurma YASAK (mevcut Aggregator.ts:519-525 davranışının tam tersi).

### A10 — Spec lint ve çapraz-artifact analizi (deterministik, LLM'siz)
Kurallar (tamamı programatik): tanımsız terim kullanımı (glossary dışı), yetim gereksinim (task'i olmayan requirement), testi olmayan task, döngüsel task DAG'i, arayüz uyumsuzluğu (contract A'nın beklediği tür contract B'de yok), şema çatışması, NFR bütçesi eksik (P-standart+ profillerde), `UNRESOLVED` iddia içeren artifact.

### A11 — Dondurma ve değişiklik seti (Freeze & Change Sets)
- Dondurma önkoşulları: A6 blocker'ları = 0, A10 lint hataları = 0, kullanıcı onayı.
- manifest.json bağlar: şema sürümü, proje+mod, kanıt anlık görüntü hash'i, konsey run ID, model/sağlayıcı konfigürasyon parmak izi, artifact hash'leri, UNRESOLVED sayısı, durum (`draft|reviewed|frozen|superseded|blocked`).
- Dondurulmuş spec değişmez; değişiklik yalnızca `changes/CP-xxxx` delta teklifiyle (etkilenen iddialar, task'ler, testler + yeniden doğrulama).

### A12 — Yürüt ve doğrula (Execute & Verify)
- Geliştirici ajan(lar) yalnızca onaylı task sözleşmelerini uygular (izin verilen dosya kapsımı dışına çıkamaz — ağ geçidi/kaba kontrol deterministik).
- Her task tamamlanma kanıtı üretir: çalıştırılmış verification command çıktıları, test sonuçları, diff kapsamı.
- Bağımsız doğrulayıcı: conformance (spec↔kod) + regresyon değerlendirmesi; sonuç `verified | partial | failed` + kanıt bağlantıları.

## 2. Maliyet kontrol formülü (mevcut 7+4D ile karşılaştırma)

Hedef: `calls = roles(mode, profile) + multi_view(high-impact) + debate(open_blockers) + judge + verify`.
- P-mini greenfield tipik: 1 (sınıflandırma) + 2–3 rol + 0–2 çoklu görünüm + 1 hakem + 1 doğrulama ≈ **5–8 çağrı** (mevcut QUICK=2 ama hiçbir artifact üretmez; mevcut FULL=27 çağrı ve hâlâ task DAG üretmez).
- Bütçeler: `max_calls, max_tokens, max_cost_usd, max_rounds` run başına; aşım → kalan kararlar UNRESOLVED + rapor (asla sessiz devam yok).
- Prompt tekrarı önleme: kanıt paketi referansla paylaşılır (evidence_id), her çağrıda tam içerik yeniden gönderilmez (mevcut sistem aynı taban promptu her modele, 20 chunk'ı her domain'e yeniden gönderir — F10 amplitüdasyon kökü).

## 3. Çevrimdışı değerlendirme paketi (LLM-judge'a güvenme)

1. **Deterministik lint vektörleri**: hazırlanmış hatalı spec'ler (döngü, yetim, terim ihlali) → A10 hepsini yakalamalı; kaçırma = protokol hatası.
2. **Sözleşme testleri**: örnek task sözleşmeleri → sahte geliştirici ajan (script) sözleşmeyi nokta nokta uygulayabilmeli; uygulayamıyorsa talimat belirsiz (belirsizlik metriği).
3. **Adversarial/mutasyon**: bilinen hatalı kararlarla (çelişen kısıtlar) besleme → sistem UNRESOLVED/BLOCKED dönmeli; mevcut sistemin fail-open'i (F16) bu testte yakalanır.
4. **Uygulama-varyans testi**: aynı frozen spec ≥2 farklı geliştirici modelle uygulanır → çıkan davranış farkı (test geçme, arayüz uyumu) varyans skoru; spec kalitesinin ana metriği.
5. **Kalibrasyon**: confidence 0.9 iddiaların gerçekte ne sıklıkla doğru olduğu — zamanla izlenir.

## 4. Protokolün reddi (kill criteria)
- A11 dondurma hiçbir gerçek projede (değerlendirme paketindeki adversarial hariç) tetiklenemiyorsa: protokol aşırı katıdır, eşikler gevşetilir.
- Ortalama çağrı sayısı mevcut FULL(7+4D)'i aşıyorsa uyarlanabilir yönlendirme başarısızdır.
- Değerlendirme paketindeki deterministik testler geçilemiyorsa protokol v1 release edilemez.
