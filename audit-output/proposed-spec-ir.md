# Önerilen Development Spec IR v1

> Denetim tarihi: 2026-08-17. Dondurulmuş bulgulara dayanır: mevcut artifact'ler 15 alanlık task-contract rubricinde 0–1/15 kapsıyor (evidence-index.md F22); şema doğrulama/lint/hash/dondurma/delta/izlenebilirlik yok (F22); `development_specs/*.yaml` el yazımı ve statiktir (F8); DomainSpecWriter yalnız keşif meta-verisi yazar (F7).

## 1. Artifact paketi

```
spec/
  manifest.json          # bağlayıcı üst veri (aşağıda)
  intent.md              # kullanıcı niyeti, aynen + normalize edilmiş özet
  assumptions.yaml       # her varsayım: id, statement, evidence, impact_if_wrong
  glossary.yaml          # terim → tanım; lint, glossary dışı terimi yakalar
  requirements/          # REQ-xxxx.yaml: statement, priority, evidence, acceptance_refs
  ux/                    # UX-xxxx.yaml (P-standart+): journey, ekran, erişilebilirlik
  architecture/          # ARC-xxxx.yaml: karar (ADR benzeri), bileşen, sınır, trade-off
  contracts/             # CON-xxxx.yaml: OpenAPI/JSON Schema/gRPC idl referansları + kopyası
  data/                  # DAT-xxxx.yaml: şemalar, migrasyon, saklama, GDPR sınıfları
  security/              # SEC-xxxx.yaml: tehdit, gereksinim, NFR bütçeleri
  operations/            # OPS-xxxx.yaml: deploy, gözlemlenebilirlik, SLO, rollback
  testing/               # TST-xxxx.yaml: strateji, fixture, property, coverage hedefi
  tasks/                 # TASK-xxxx.yaml: atomik task sözleşmeleri (aşağıda)
  traceability.json      # intent↔req↔arc↔task↔test kenar listesi + tutarlılık denetimi
  decisions/             # DEC-xxxx.yaml: konsey karar kaydı (council-protocol.md A5 şeması)
  evidence/              # kanıt paketi kopyası/referansları (E-xxxx)
  changes/               # CP-xxxx: dondurma sonrası delta teklifleri
  legacy/                # YALNIZ modernizasyon modu (aşağıda)
```

Karmaşıklık profilleri (council-protocol.md A1) bu ağacın alt kümesini zorunlu kılar: P-mini = manifest, intent, requirements, tasks, traceability, decisions. Anlamsız kağıt işi üretmek yasak (§12).

## 2. manifest.json (bağlayıcı alanlar)

```json
{
  "spec_schema": "lco-spec/1.0",
  "project": {"name": "...", "mode": "greenfield|legacy"},
  "evidence_snapshot": {"pack_hash": "sha256:...", "collected_at": "..."},
  "state": "draft | reviewed | frozen | superseded | blocked",
  "council_run": {"run_id": "...", "config_fingerprint": "sha256(model+provider+prompt-versions)"},
  "artifact_hashes": {"tasks/TASK-0001.yaml": "sha256:..."},
  "unresolved_count": 2,
  "blocking_count": 0,
  "target_runtime": {"platform": "...", "stack": "..."}
}
```

Kural: `blocking_count > 0` iken `state` asla `frozen` olamaz; derleyici bunu programatik zorlar (fail-closed).

## 3. Atomik task sözleşmesi (TASK-xxxx.yaml)

Rubric (15 alan; mevcut sistem 0–1/15):

```yaml
task_id: TASK-0007
title: "Kullanıcı JWT doğrulama middleware'i"
purpose: "REQ-0003'ü karşıla; DEC-0005 kararını uygula"
refs: {requirements: [REQ-0003], architecture: [ARC-0002], decisions: [DEC-0005]}
depends_on: [TASK-0005]        # derleyici döngü denetimi yapar (topolojik sıralama)
preconditions:
  - "TASK-0005 merge edilmiş"
  - "contracts/auth.yaml donmuş"
permitted_scope:
  - "src/auth/**"
  - "tests/auth/**"
protected: ["src/legacy/**", ".env*"]
interface_changes:             # beklenen arayüz ekleme/değişiklik
  - {symbol: "verifyJwt(req): Promise<Claims>", file: "src/auth/jwt.ts"}
invariants:
  - "Tüm /api rotaları verifyJwt arkasında"
  - "Token TTL ≤ 15dk (SEC-0002)"
instructions: "..."            # belirsizliği önleyecek kadar kesin; mekanik detay dayatmaz
tests:
  - {kind: unit, file: "tests/auth/jwt.test.ts", cases: ["expired token rejected", ...]}
  - {kind: property, property: "imzalı token her zaman doğrulanır"}
verification:
  - {command: "pnpm test tests/auth/", expect: "exit 0, ≥12 tests pass"}
  - {command: "pnpm typecheck", expect: "exit 0"}
acceptance:
  - "REQ-0003 kabul kriterlerinin tamamı test ediliyor"
  - "Yeni güvenlik başlığı eklenmedi (kapsam dışı)"
rollback: "git revert bu task commit'i; şema değişikliği yok, migration gerekmez"
completion_evidence:
  required: [verification_outputs, test_summary, diff_scope_check]
risk: {level: low|med|high, note: "..."}
complexity: xs|s|m|l
```

Atomicite kuralı: bir task bağımsız endişeleri birleştiriyorsa bölünür ("tüm modülü uygula" atomic DEĞİLDİR); ancak mikro-task üretmek için yapay bölme yasak. Ölçüt: her task'ın kendi doğrulama komutları ve geri alınabilirliği olmalı.

## 4. Legacy (modernizasyon) paketi — `spec/legacy/`

```
legacy/
  as_is_architecture.yaml     # bileşenler, bağımlılık grafiği, çalışma zamanı envanteri
  as_is_data.yaml             # şemalar, hacimler, sahiplik, kalite sorunları
  behavior_inventory.yaml     # kullanıcı yolculukları + iş kuralları (kaynak: kod/obs/görüşme)
  preserve_change_drop.yaml   # davranış başına karar + gerekçe + kanıt
  parity_matrix.yaml          # eski↔yeni davranış eşlemesi; boşluklar açık
  golden_tests/               # karakterizasyon testleri + oracle provenance (kaydedilmiş çıktılar nereden: prod mi, kayıt mı, model mi)
  data_migration.yaml         # eşleme, backfill, çift-yaz/çift-ok, uzlaşma, geri alma
  integration_compat.yaml     # dış sistem sözleşmeleri; kırılma riski
  strategy.yaml               # strangler (artımlı dilimler) vs tam yeniden yazım — KANITLA
  cutover.yaml                # dilim planı, bir arada yaşama, kesişme, geri alma, söküm kriterleri
```

Strateji seçimi kuralı (§2.2): varsayılan YOK. Kar, bağlantı, operasyonel risk, kesme noktaları, test edilebilirlik ve iş kısıtlarına göre `strategy.yaml` gerekçelidir; "küçük sistem + yüksek güven + düşük kesme maliyeti" tam yeniden yazımı haklı çıkarabilir.

## 5. Doğrulama katmanı (deterministik zincir)

1. **Şema**: her artifact JSON Schema (Zod) ile doğrulanır — derleme zamanında, LLM'siz.
2. **Lint** (council-protocol.md A10): tanımsız terim, yetim gereksinim, testsiz task, döngü, arayüz uyumsuzluğu, şema çatışması, NFR bütçe eksikliği, UNRESOLVED sızıntısı.
3. **Traceability denetimi**: traceability.json kenarlarının her ikisi ucu var; her REQ en az bir TASK, her TASK en az bir test kümesi.
4. **Freeze**: manifest hash'leri + onay; sonrası yalnızca change set.
5. **Conformance**: yürütme sonrası doğrulayıcı, kod↔spec karşılaştırmasını kanıtla raporlar.

## 6. Örnek: mevcut depodan bir dönüşüm

Mevcut `apps/indexer/development_specs/indexer_project_context.yaml` (el yazımı, 74 satır, Türkçe) bu IR'e şu şekilde taşınır: `project` bloğu → `intent.md` + `manifest.project`; `architecture.layers` → `architecture/ARC-0001.yaml` (bileşen grafiği + kararlar); `constraints` → `requirements/REQ-xxxx` (kabul kriteri EKLENEREK — mevcut haliyle ölçülemez); `modules` → her modül bir `tasks/TASK-xxxx` adayına dönüşür ancak ÖNCE arayüz/invariant/verification alanları konsey tarafından doldurulur. Bu dönüşüm, mevcut artifact'in "arkaplan okuması" olduğunu, sözleşme olmadığını doğrular (F8, F22).
