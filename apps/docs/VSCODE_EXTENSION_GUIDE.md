---

# VSCODE_EXTENSION_GUIDE.md

**LLM Council Orchestrator – VSCode Extension Tasarım ve Entegrasyon Rehberi**

Bu belge, LLM Council Orchestrator ekosisteminin **VSCode uzantısı tarafını** tam teknik kapsamıyla açıklar.
Uzantı, geliştiricinin Orchestrator ile etkileşim kurduğu birincil UI yüzeyidir.

Amaç:

* Workspace → Orchestrator bağlantısını yönetmek
* Proje klasörü seçimi
* Index durumu görüntüleme
* Pipeline tetikleme (quick/full/spec/refinement)
* Pipeline progress ekranı
* Üretilen YAML dosyalarının workspace’e yazılması
* Model/pipeline seçeneklerinin UI üzerinden değiştirilmesi

---

# 0. Genel Mimarî

VSCode Extension, üç katmandan oluşur:

```
UI Layer (Webview Panels)
Command Layer (vscode.commands)
Client Layer (HTTP/MCP Client → Orchestrator)
```

Temel görev:

**Kullanıcı → UI → Extension → Orchestrator → Output → Workspace**

Extension hiçbir zaman:

* Council çalıştırmaz
* Pipeline adımı yürütmez
* Model çağrısı yapmaz
* Embedding üretmez

Sadece “UI + file I/O + orchestrator client” üçlüsünü gerçekleştirir.

---

# 1. Extension'ın Sorumlulukları

## 1.1 Workspace Kapsamı

* Geliştirici workspace klasörünü açar.
* Uzantı otomatik olarak aktif olur.

## 1.2 Project Root Seçimi

Kullanıcı, orchestrator’ın çalışacağı proje kökünü seçer:

* Varsayılan: workspace root
* Alternatif: herhangi bir alt klasör

Bu seçim sorulmalıdır:

```
"Bu klasörü LLM Council projesi olarak işaretlemek istiyor musunuz?"
```

## 1.3 Index Durumu Gösterimi

Orchestrator’dan `/isIndexed` çağrısı yapılarak UI’da:

* Indexed
* Not indexed
* Indexing…

gibi durumlar gösterilir.

## 1.4 Pipeline Tetikleme

Uzantı dört pipeline modu için command sağlar:

```
LLM Council: Quick Diagnostic
LLM Council: Full Analysis
LLM Council: Generate Specs
LLM Council: Refinement
```

Her bir command pipeline’ı başlatır.

## 1.5 Pipeline Progress UI

Pipeline progress iki şekilde gösterilir:

* **Status bar item** (gerçek zamanlı durum)
* **Webview paneli** (aşamaları listeleyen UI)

Örnek aşamalar:

```
load_config
ensure_index_ready
perform_sampling
execute_roles
dual_aggregation
generate_final_report
spec_output
```

UI sadece görselleştirir.

## 1.6 Üretilen Dosyaların Workspace’e Yazılması

Spec dosyaları üretildiğinde:

```
project_context.yaml
project_structure.yaml
modules/*.yaml
```

dosyaları tam içerik olarak workspace’e yazılır.
Bu işlem FULL OVERWRITE olarak yapılır.

## 1.7 Kullanıcı Ayarları

VSCode Settings ile yapılır:

```
llmCouncil.orchestrator.host
llmCouncil.orchestrator.port
llmCouncil.defaultPipelineMode
llmCouncil.parallelExecution
llmCouncil.rawOutputMode
```

---

# 2. Genel Dosya Yapısı

```
apps/vscode_extension/
  package.json
  src/
    extension.js
    commands/
    client/
    ui/
    utils/
  media/
    webview_assets/
```

---

# 3. Extension Activation Sırası

Activation events:

```
"activationEvents": [
  "onCommand:llmCouncil.openPanel",
  "onCommand:llmCouncil.runQuick",
  "onCommand:llmCouncil.runFull",
  "onCommand:llmCouncil.runSpec",
  "onCommand:llmCouncil.runRefinement"
]
```

Extension aktivasyonu:

1. Settings yüklenir
2. Orchestrator client başlatılır
3. Status bar item oluşturulur
4. Komutlar kaydedilir

---

# 4. Command Yapısı

Komutlar:

| Komut                    | Açıklama                  |
| ------------------------ | ------------------------- |
| llmCouncil.runQuick      | Quick Diagnostic pipeline |
| llmCouncil.runFull       | Full Analysis pipeline    |
| llmCouncil.runSpec       | Spec Generation pipeline  |
| llmCouncil.runRefinement | Refinement pipeline       |
| llmCouncil.openPanel     | Webview panelini aç       |

En kritik komutlar pipeline tetikleyenlerdir.

Komut-flow:

```
command → validate project root → show progress UI → call orchestrator → receive stream → write files → success/fail UI
```

---

# 5. Orchestrator Client

Bu katman:

* HTTP / MCP üzerinden orchestrator ile iletişim kurar
* Timeout ayarlarını yönetir
* Pipeline modunu gönderir
* Yanıtın progress olarak gelmesini destekler

### 5.1 Örnek request:

```
POST /pipeline
{
  "project_path": "...",
  "prompt": "...",
  "pipeline_mode": "full_analysis",
  "override_models": null
}
```

### 5.2 Örnek progress eventi:

```
{
  "type": "state_update",
  "state": "execute_roles",
  "detail": "Running architect role"
}
```

---

# 6. Webview UI Tasarımı

Webview iki panelden oluşur:

### 6.1 Pipeline Panel

Bu panel pipeline’ın aşamalarını gerçek zamanlı gösterir.

Bölümler:

```
Pipeline Summary
Current State
Role Execution States
Logs (pipeline log, model log, aggregation log)
Final Output Summary
```

Webview refresh gerektirmez; mesajlarla güncellenir.

### 6.2 Report & Specs Panel

Pipeline bittiğinde:

* Final Architectural Report görüntülenecek
* project_context.yaml preview
* module.yaml preview

Bu panel sadece gösterim içindir, düzenleme yapılmaz.

---

# 7. Status Bar Entegrasyonu

Status bar item pipeline ilerlerken şu modlarda olur:

* Idle
* Indexing…
* Running pipeline…
* Waiting for roles…
* Aggregating…
* Done

Renkler:

* Mavi: Idle
* Sarı: Running
* Yeşil: Success
* Kırmızı: Error

---

# 8. Dosya Yazma ve FULL OVERWRITE Kuralı

VSCode Extension şu prensipleri uygular:

1. İnsan düzenlemesi yapılmaz
2. Yeni spec üretildiğinde her zaman tam overwrite yapılır
3. Dosyalar workspace path içinde oluşturulur
4. Merge/diff yapılmaz
5. Tüm dosyalar atomik şekilde yazılır

Bu sayede LLM tarafında deterministik spec üretimi sağlanır.

---

# 9. Hata Durumları

Uzantı şu hataları kullanıcıya bildirir:

* Orchestrator bağlantısı yok
* Index hazır değil
* Pipeline başarısız oldu
* Spec dosyaları üretilemedi
* Timeout
* Yanlış config

VSCode extension hiçbir zaman pipeline’ı yeniden denemez;
retry orchestrator tarafında yapılır.

---

# 10. Genişleme Alanları

İleri sürümlerde ek özellikler:

* Right-click → “Analyze this file with LLM Council”
* Inline annotation (öneriler için)
* Diff-based contextual analysis
* Custom pipeline presetleri
* Çoklu proje desteği
* Local model execution integration

---