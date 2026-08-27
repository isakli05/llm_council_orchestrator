# Göç Yol Haritası (Aşama 0–7, çıkış kapıları ve durdurma koşullarıyla)

> Denetim: 2026-08-17. Aşama sırası §17'deki bağımlılık düzenini korur; Worker H değişiklikleri (kazı dürüstlüğü, Aşama 2.5 kanıt kapısı, saat bütçeleri, Aşama 6 silme tarihi, Aşama 0 CI) entegre edilmiştir. Takvim hilesi yok: her aşamanın kendi bütçesi ve kapısı vardır; kapı sağlanmadan aşama "tamamlanmış" sayılmaz (§18).

## Aşama 0 — Gerçeklik taban çizgisi
- **Amaç**: Depoyu kanıtla uyumlu hale getirmek; her sonraki iddianın doğrulanabilir olmasını sağlamak.
- **Önkoşullar**: Yok (bugün başlanabilir).
- **Kapsanan bağlamlar**: tüm mevcut depo.
- **Çıktılar**: (1) ZAI anahtarı İPTAL + `.env.test` geçmişten temizlenir (R1 — ilk gün); (2) `pnpm build` onarımı (test dosyaları tsconfig'ten dışlanır; indexer'a build script eklenir); (3) test Suite'leri onarılır — hedef: 0 başarısız, atlananların sayısı ve nedenleri README'de beyan; per-suite scriptler çalışır hale gelir; (4) GitHub Actions: push'ta install+build+test+typecheck matrisi; (5) README yeniden yazımı (kanıta dayalı; sahte badge kaldırılır; .audit/plans-out arşivlenir); (6) **Kazı envanteri** (H): her aday modül için go/no-go — "yeniden yazımı ≤ X gün mü?" tablosu; hayır diyenler silinir, taşınmaz; (7) MCP köprüsü stdout→stderr (tek satır, R15).
- **Deterministik test**: CI yeşil; `rg 'executed \(placeholder\)' src/` → 0 eşleşme (henüz üretimde değil ama grep kapısı kurulur); kazı tablosundaki her KEEP modülü izole testle derlenir.
- **Çıkış kapısı**: CI yeşil + anahtar iptali belgelenmiş + kazı go/no-go tablosu imzalı.
- **Dur/geri al**: Build onarımı 2 haftayı aşarsa: kod tabanını dondur, doğrudan Aşama 1'deki yeni çekirdek iskeletine geç, eski repo arşiv et (izin verilen sonuç).

## Aşama 1 — Sınırlar ve fail-closed
- **Amaç**: Konsey/spec/sağlayıcı/indexer/harness arayüzlerinin ayrılması; placeholder başarının tam tersine çevrilmesi.
- **Önkoşullar**: Aşama 0 kapısı.
- **Kapsam**: yeni `packages/` (council-engine, spec-compiler, provider-registry, discovery-lib, indexer-lib) + geçici uyumluluk katmanı (mevcut HTTP/MCP çağıranlar kırılmasın).
- **Çıktılar**: Arayüz tanımları (TS tipleri + Zod şemaları); PipelineEngine step-switch'i arayüz-arkasına çekilir; tanınmayan adım → `success:false, code:"UNKNOWN_STEP"` (fail-closed); provider-registry: tek doğruluk kaynağı, kimlikler 4–5 yerden 1 yere; sağlayıcı sağlık denetim komutu (`lco providers health`); (H) OMP/Pi/Claurst değerlendirmesi bu aşamada YAPILMAZ — motor çerçevesiz kalır.
- **Deterministik test**: Bilinmeyen-adım testi fail-closed bekler; registry tablosundan eksik kimlik testi hata üretir.
- **Çıkış kapısı**: Placeholder-success yolları sıfır (grep-enforced); arayüzler Zod'la doğrulanıyor; eski HTTP API davranış uyumluluğu kontrat testiyle sabit.
- **Dur/geri al**: Arayüz tasarımı 3 haftayı aşarsa: kapsam küçült — yalnız council-engine + spec-compiler arayüzleri, geri kalanı Aşama 2'ye.

## Aşama 2 — Spec IR v1
- **Amaç**: proposed-spec-ir.md'yi çalışır derleyiciye çevirmek.
- **Çapsam**: spec-compiler, spec-lint, manifest/hash, freeze/change-set, traceability.
- **Çıktılar**: Şema paketi (Zod) + derleyici + lint kuralları (A10 listesi) + dondurma kapısı (`blocking_count>0` → freeze reddi) + örnek spec paketi (bu deponun kendisi ilk müşteri: indexer modül spec'i); deterministik CLI: `lco spec compile|lint|freeze|verify`.
- **Deterministik test**: Ekilmiş hatalı spec vektörleri (döngü, yetim, tanımsız terim, NFR eksik, UNRESOLVED sızıntısı) → lint REDDETMEZSE test başarısız; freeze sonrası suni değişiklik → hash uyuşmazlığı yakalar.
- **Çıkış kapısı**: Lint reddi oranı ekilmiş-kötü setinde >0 (hepsi yakalanır); iyi sette 0 hatalı pozitif (minik rubrik); dondurma/değişiklik-seti turları çalışır.
- **Dur/geri al**: Kapsam Aşama 2.5 kapısına yetmiyorsa: lint alt kümesiyle devam, NFR kuralları ertelenir.

## Aşama 2.5 — Kanıt Kapısı (H; harness yatırımı ÖNCESİ zorunlu)
- **Amaç**: Farklılaştırıcının gerçekliğini ölçmeden harness harcaması yapmamak.
- **Çıktılar/testler**: (1) ≥20 gerçek görevden donmuş eval seti + otomatik puanlama; (2) derleyici gerçekliği (Aşama 2 vektörleri + grep kapısı); (3) konsey gerçekliği: council+spec, tek-model taban çizgisini önceden ilan edilmiş eşikte yener; görev başına maliyet ≤3× taban; (4) adversarial: çelişen kısıt girdileri UNRESOLVED/BLOCKED üretir (mevcut sistemin fail-open'inin tam tersi).
- **Çıkış kapısı**: Dört testin dördü de geçmek ZORUNDA.
- **Dur/geri al (kill)**: Herhangi biri başarısızsa → Aşama 4–5 iptal; Spec IR bağımsız linter/MCP aracı olarak yayımlanır; konsey tarafı araştırma notuna indirilir. Bu bir başarısızlık değil, BÜTÇE KORUMASIdır.

## Aşama 3 — Uyarlanabilir konsey
- **Amaç**: council-protocol.md'nin 12 aşamasını (A1–A12) implementasyonu.
- **Kapsam**: council-engine (sınıflandırma, kanıt paketi, rol yönlendirme, iddialar, çatışma defteri, hedefli tartışma, hakem, bütçe kapları).
- **Çıktılar**: Protokol turu CLI'dan koşulur; her karar DEC-xxxx kaydı; bütçe aşımı → kalan kararlar UNRESOLVED (asla sessiz devam yok); prompt tekrarı giderilir (evidence_id referansı); çevrimdışı değerlendirme paketi (council-protocol.md §3) CI'a bağlanır.
- **Deterministik test**: Eval seti + kalibrasyon izleme + bütçe-simülasyon testleri (sahte sağlayıcıyla).
- **Çıkış kapısı**: Eval setinde taban çizgisini geçmek + adversarial fail-closed testleri yeşil + çağrı sayısı bütçe formülü içinde.
- **Dur/geri al**: Protokol aşırı katıysa (hiçbir dondurma tetiklenemiyorsa) eşik gevşetilir; maliyet tabanın 3×'ini aşıyorsa rol yönlendirme daraltılır.

## Aşama 4 — Harness entegrasyon spike'ı (atılabilir)
- **Amaç**: Motor↔harness bağını KANITLA seçmek. Hedef: atılabilir tek spike (§15), uygulanamaz.
- **Kapsam**: MCP istemci tarafı + seçilmiş istemci (öncül: **OMP MCP/RPC yolu** — in-process extension DENEMEZ önce, MCP önceliklidir [H]) + en kötü yol testi (MCP → RPC sırası; yetenek kontrol listesi: worktree, PTY, tipli subagent çıktısı, oturum akışı).
- **Başarı ölçütü (deterministik)**: (1) motor OMP'yi MCP istemcisi olarak bir konsey görevinde sürüyor; (2) task yürütme worktree'de izole; (3) subagent sonucu şema-doğrulanmış geliyor; (4) iptal/bütçe harness'e taşınıyor; (5) Node 24 + hedef platformlarda kurulumnative addon'suz ya da sorunsuz.
- **Başarısızlık ölçütü (kill)**: Yukarıdakilerden 2+ sağlanamıyorsa veya kurulum kırılgansa → **A-lite yedek planı** devreye girer (kendi ince döngüsü: bash + dosya + node-pty + MCP istemcisi + git worktree, ~1–2k satır) — tarihli kararla.
- **Çıkış kapısı**: Spike değerlendirme raporu + istemci kararı (OMP / A-lite / karışık) + entegrasyon sözleşmesi (sürüm kilitli).

## Aşama 5 — Yürüt ve doğrula
- **Amaç**: task DAG'inin izole yürütülmesi + bağımsız conformance.
- **Çıktılar**: `lco run <spec>` → task bazında izole worktree, kapsam (permitted_scope) zorlaması, doğrulama komutu çalıştırma, tamamlanma kanıtı toplama, doğrulayıcı raporu (`verified|partial|failed`); eski Fastify/HTTP yüzeyi sökülür (strangler tamam).
- **Deterministik test**: Kapsam ihlali reddedilir; kanıtsız task tamamlanamaz; sahte-uygulama (test amaçlı) doğrulayıcıda `failed` üretir.
- **Çıkış kapısı**: Uçtan uca örnek: doğal dilden donmuş spec'e, izole yürütmeye, conformance raporuna — tek komutla, eval setinin en az bir görevinde.
- **Dur/geri al**: Yürütme güvenliği aşarsa kapsamı salt-okunur doğrulama moduna düşür.

## Aşama 6 — Legacy yeniden yapım
- **Amaç**: proposed-spec-ir.md §4'teki legacy/ paketi + preserve/change/drop + parity/golden + cutover.
- **Önkoşullar**: Aşama 5 (yürütme motoru hazır; aksi halde inventar üretmek boşa).
- **Çıktılar**: Davranış envanteri (discovery-lib + kullanıcı yolculukları), golden test korpusu (oracle provenance ZORUNLU), data migration planı, strangler-vs-rewrite karar şablonu (kanıt alanlı), cutover/geri alma kriterleri. **Doğumunda silme tarihi**: parity sonrası +30 gün'de geliştirme dalı kapatılır (H).
- **Deterministik test**: Golden korpus üzerinde parity skoru; cutover provası sandbox'ta geri alma ile.
- **Çıkış kapısı**: Örnek bir legacy sistemde (bu deponun kendi eski pipeline'ı ilk aday) tam tur.
- **Dur/geri al**: 30 günlük pencere dolduysa ve parity yoksa: mod kapanır, öğrenilenler dokümante edilir.

## Aşama 7 — Sertleştirme ve sürüm
- **Amaç**: Paket, CI matrisi, gözlemlenebilirlik, dokümantasyon, yükseltme/geri alma, destek politikası.
- **Çıktılar**: npm/GitHub Release (değişiklik günlüğü + geri alma talimatı); platform matrisi CI'ı; oturum/maliyet gözlemlenebilirliği (OTel gerçek bağlanır: çağrı-başı token/maliyet); kullanıcı dokümanları; sürüm politikası (spec şeması sürümlemesi dahil).
- **Çıkış kapısı**: "Üretim hazır" yalnız burada ve ancak: CI matrisi yeşil + gerçek E2E (mock'suz, test kimlikleriyle) + release/rollback provası belgeli (§18).
- **Dur/geri al**: Release kriterleri tutmuyorsa etiket atılmaz.

## Sürekli kurallar
- Her aşamada saat bütçesi; aşarsa dur-yeniden-karar toplantısı (tek geliştirici için: yazılı karar notu).
- Ana dala 2 ardışık hafta merge yoksa: dur ve yeniden karar ver (H).
- OMP pin'i aylık CHANGELOG denetimi; churn maliyeti > değer ise istemci çeşitlendirme/CLI'ya dönüş (R5).
- Claurst: yalnız study/black-box; herhangi kod alıntısı düşünüldüğü an dur ve hukuk incelemesi şartını uygula (R10).
