# REMEDIATION-LOG — Codex Dış Denetimi 39 Bulgunun Kanıtlı Kapanışı

> ## ══ KALINTI KAPANIŞ PROGRAMI (2026-08-27, dal feat/external-audit-residual-closure) ══
>
> Bağımsız hazırlık yeniden-değerlendirmesinin 5 kalıntısı + 2 komşu
> doküman tutarsızlığı kapatıldı. Ayrıntılı kanıt:
> `RESIDUAL-CLOSURE-REPORT.md`. Dal commit'leri: cd6760e (ARCH-001 silme)
> → ab45b39 (graphify) → b537674 (SEC-003/006/PROD-003/doctor) → ac2e125
> (kanıt dokümanları) → finalization commit'i.
>
> | Kalıntı | Durum | Özet kanıt |
> |---|---|---|
> | SEC-003 | **FIXED** (yeniden sınıflandırıldı: önceki "FIXED" opsiyonel politikaydı) | Bağlayıcı etkin-kök: pin yoksa realpath(cwd); 10 araçta zorunlu; çözülmeyen kökte tümü fail-closed; ret çekirdek çağrısından önce; bağımsız adversarial inceleme "genuinely closed" (ampirik symlink probları) |
> | SEC-006 | **FIXED** (yeniden sınıflandırıldı) | Sessizlik yalnız id yokluğuyla; id'li notifications/* → -32601 + id yankısı; RPC + gerçek stdio zamanlayıcı düzeyinde pinli; geçersiz id asla yankılanmaz |
> | ARCH-001 | **FIXED** (genişletildi: arşiv → silme) | 320 takipli dosya silindi (−159.805 satır); workspace = yalnız spec-core; `pnpm audit --prod` 66 uyarıdan → **0**; tag `legacy-archive-final` + `docs/legacy-archive.md` kurtarma kaydı |
> | PROD-003 | **FIXED (deterministik)** + canlı kanıt **USER-GATED** | MENTIONS_TERMS → CONSTRAINT_TRACE (köklendirme zinciri + sayısal ilişki + yasak-icat; 9 adversarial vaka); korpus+eşik+rubrik-dosya-baytları sha256 kilidi `0024fef9…` (geçmiş zincirli, append-only); ön-kayıtlı signTest() kriteri kodda; canlı koşum ya sahibi tarafından yetkilendirilir ya da konsey-üstünlüğü iddiası emekli edilir (ACCEPTED-DOC) |
> | SEC-001 | **USER-GATED** (depo tarafı FIXED) | Tüm doğrulamalar temiz (değer yok, purge kanıtlı, marker 92 çift); /tmp/lco-pre-purge.bundle 0644→**0600** düzeltildi; kapanış = U1 tarihli rotasyon taahhüdü + bundle tasfiye kararı |
>
> Komşu düzeltmeler: `lco doctor` adapter gerçeği (canlı HTTP varsayılan,
> fail-closed; mock yalnız test/kütüphane) + etkin-kök raporlaması; U2
> dokümanı YÜRÜTÜLDÜ kaydına döndü; DATA-002/003 bütünlük dili tutarlı
> (semantik-drift, imza iddiası yok); Trusted Publishing "yapılandırıldı,
> uçtan-uca kanıtlanmadı" çerçevesi tüm yüzeylerde; root README npm-0.1.0
> bayatlığı giderildi. Süit: 75/1231 → **79/1304**, lint 0, packed smoke 0.

> ## ══ PROGRAM KAPANDI (2026-08-27) — 39/39 ══
>
> **31 FIXED · 7 ACCEPTED-DOC · 1 USER-GATED (SEC-001: U1 rotasyon + U2
> purge kullanıcı eylemi — depo tarafı FIXED).**
>
> Dört faz (P0 fabbca4 · P1 f8f948e · P2 4c825d5 · P3 41c4ea2) main'e
> merge edildi; her faz implementer→bağımsız inceleyici→(gerekirse)
> fix-loop→fable whole-branch final inceleme→fix dalgası→re-review
> sürecinden geçti (25 iş kalemi, 6 fix-loop turu, 4 final fix dalgası).
>
> **Final kanıt (main @ 41c4ea2, denetleyici koşumu):** build 0 · lint 0 ·
> **1231/1231 test, 0 skip** (75 dosya; 576→1231) · packed-install smoke 0
> · test:coverage 0 (eşikler 91/89/96/91) · install --frozen-lockfile 0.
>
> ## ══ U4 KAPANDI — npm Trusted Publishing mimarisi (2026-08-27) ══
>
> 1. **Bootstrap yayın:** lco-spec@0.1.0, sahibin kimlik doğrulaması yapılmış
>    yerel npm CLI oturumundan bir kez yayınlandı (etkileşimli WebAuthn
>    güvenlik-anahtarı 2FA onayı — kullanıcı tarafından onaylandı; OTP/TOTP
>    istenmedi, token oluşturulmadı). Dirty-publish kapısı ilk denemede
>    doğru şekilde diretti (12 izlenmeyen kanıt dosyası) → kanıtlar
>    commit'lendi (e0f7675), etiket yeni HEAD'e taşındı, yayın tamamlandı.
> 2. **Kayıt doğrulaması:** npm view lco-spec → 0.1.0; dist-tags
>    {latest: 0.1.0}; repository birebir; dist.shasum e173deaf924d… =
>    CI dry-run paketiyle bayt-bayt aynı.
> 3. **Trusted Publishing:** `npm trust github lco-spec --repo
>    isakli05/llm_council_orchestrator --file publish.yml --allow-publish`
>    → id 39815b83-339e-434e-8256-b274d7048a38, permissions: publish;
>    `npm trust list` ile doğrulandı.
> 4. **Workflow göçü (11cdd89):** publish.yml NODE_AUTH_TOKEN hattından
>    arındı; OIDC değişimi (id-token: write + npm@^11.15 kurulum adımı);
>    TÜM kapılar korunur (yalnız dispatch, dry_run varsayılan true, tam
>    build/lint/test/smoke + freshness + readiness + sürüm eşleşmesi,
>    provenance). Depoda npm sırrı YOK, oluşturulmadı.
> 5. **Doğrulama:** göç push'u uzak CI'da yeşil (run 33073873397: Node 22
>    44s ✓ + Node 24 36s ✓). 0.1.0 yeniden yayınlanMADI (npm sürümleri
>    değişmez); ilk uçtan-uca OIDC yayını tasarım gereği bir sonraki
>    sürümde doğal olarak gerçekleşir.
>
> Plan: plans/2026-08-26-codex-remediation.md · Süreç defteri:
> .superpowers/sdd/2026-08-26-codex-remediation/progress.md — YEREL çalışma
> kaydıdır (depoya işlenmedi; taze klonlarda yoktur; ruling'ler + program-
> sonrası backlog orada yaşar). Bekleyen kullanıcı kapıları: U1/U2/U3/U4
> (kapanış raporunda).

Kanonik tablo. Durum değerleri: FIXED / ACCEPTED-DOC / USER-GATED / PENDING.
Kalem = plans/2026-08-26-codex-remediation.md görev numarası. Her faz sonunda
güncellenir; "geçti görünüyor" yasak — koşuldu/koşulmadı kanıtı zorunlu.

| ID | Önem | Durum | Kalem | Commit | Test kanıtı | Not |
|---|---|---|---|---|---|---|
| PROD-001 | BLOCKER | FIXED | T2 | 8173842 | bin-contract.test.ts (2 test, RED→GREEN); smoke:packed exit 0; npm pack --json mode 493 ×2 (denetleyici doğruladı) | 578/578 yeşil; smoke gerçek POSIX exec + MCP handshake |
| SEC-001 | HIGH | USER-GATED | T1 | 9ee0f2c | taahhüt ağacı değer taraması 0 vuruş (süreç-içi); guard tam-dosya incelemesi | U2 purge YÜRÜTÜLDÜ (2026-08-27): filter-repo replace-text — pickaxe 0 + tüm-rev grep 0; main+4 dal force-push; yedek /tmp/lco-pre-purge.bundle. Kalan TEK kullanıcı eylemi: U1 rotasyon (sağlayıcı anahtarı hâlâ geçerli olabilir — U1-KEY-ROTATION.md) |
| BACK-001 | HIGH | FIXED | T5 | 8684293 | +18 test RED→GREEN (654/654): blocked+temiz final→blocked; retry UNRESOLVED düşürürse RESOLUTION_MISSING (ID adlı); ekleme/koruma yasal | Zorlama gate kodunda (prompt değil); classifier kanıtı gatedBundle sonrası her yolda |
| BACK-002 | HIGH | FIXED | T4 | 5d5df34 | +49 lifecycle testi (636/636); 4 denetim senaryosu RED(17 fail)→GREEN çoklu katmanda sabit; e2e: drift'li re-freeze repin YOK | Geçiş tablosu lifecycle.ts'te veri; freeze/changeset/L08/generate tek kapı; blocked çift yönlü kapatıldı |
| DATA-001 | HIGH | FIXED | T6 | 0cd1d16+eaf3382 | 677/677 (+23 RED-first): eşzamanlı init tek-başarı (8+ koşum stabil); tasks.json yazılamaz → bayt-özdeş + retry; lint-geçersiz change → disk değişmez; stale-lock; MID-WRITE-SIM kalıntısız bayt-özdeşlik (fix turu: temp kaydı yazımdan önce + kilit tarafı ikizi) | src/storage/revision.ts: O_EXCL kilit (pid+inject'li zaman, 10s stale-break), temp+fsync+rename, hardlink yedek + inode-özdeş rollback, manifest-en-son; kilit asla ücretli çağrı span etmez |
| BACK-003 | HIGH | FIXED | T7 | da6c335 | namespace-ids.test (68 vaka) + closure.test (E-/DEC-/REQ-/TASK-/TST-9999 reddi) + l13.test + plan.test (--json bilinmeyen dep: exit≠0, ID adlı, plan JSON YOK) | Katman bölüşü: şema=aduzayı, L13 kapanış=varlık, compile=TASK- benzersizliği; changeset birleşik sonuçta yeniden doğrular — bypass yok |
| SEC-002 | HIGH | FIXED | T9 | 2cafc07 | 825/825 (+30, iki katman RED): default sunucuda injection saldırısı (yes:true+consent tüm kombinasyonlar) ASLA koşmaz (PWNED.txt yok); opt-in'de dahi draft/lint-dirty/drift/wrong-digest reddi; spawn testi flag+gizli env çocuğa görünmez kanıtı | consent.ts: 4 katman (allowExec env=1, frozen+verified+lint-clean, sha256 digest sunucu-tarafı yeniden-hesap, env allowlist); LCO_MCP_EXEC_ROOT önek-sabitleme (izolasyon T16) |
| UX-001 | HIGH | FIXED | T11 | c3b40dd+a0cf19a | 902/902 (+44): zarf tablosu README'de kod sabitlerine pinli test (single 12 istek/2211s, council 24/4422s); üç bütçe kapağı deterministik testler (BUDGET_EXCEEDED bir sonraki ücretli istekten önce, diske yazılmaz, yetim promise yok); attempt≠completion muhasebesi | Varsayılan SINGLE (tek nokta DEFAULT_GENERATE_VARIANT); flag>env>zarf varsayılanı; blocked early-exit reddedildi (gerekçeli) |
| PROD-002 | HIGH | FIXED | T3 | fb84181 | 9 yeni CLI testi RED→GREEN (587/587); smoke --help/--version exit 0; README komutları birebir koşularak doğrulandı | Badge doğrulanıp tutuldu (ci.yml uzakta gerçek); Docker quick-start kaldırıldı; legacy ARCHIVED etiketli |
| PROD-003 | HIGH | FIXED | T12 | 15c53ab+2fcfee1 | 935/935 (+33): iki-niyet-tek-fixture testi (genel fixture başkasının niyetini GEÇEMEZ); temiz-ama-sadakatsiz niyet=false; icat-etmeme sonuç-düzeyi (blockedCorrectly=outcome.kind); --repeats bağımsız koşumlar + min/max; G4 yalnız niyet-sadık+tam-usage + boş-küme guard'ı | MENTIONS_TERMS görev-başı (intent-eko hariç); icatlar danışma; terim-dökme sınırı + mock-badge kökeni README+rapor notlarında açıklı; canlı G4 prosedürü belgelendi (koşulmadı — kullanıcı env'i gerekli) |
| BACK-004 | HIGH | FIXED | T7,T8 | da6c335+28487ce | check/runner.test: DRY+unparseable → UNPARSEABLE-EXPECT, exit 1, sıfır komut, evidence YOK; L14 + check/expect.ts tek kaynak; 20 fixture uyumlu, 28 skip açıldı (794/0/0); good-fixture-gate.test 6 aşamalı tam kapsam | Şema artifact yeniden üretildi+commit; pet-clinic expect "exit 0" |
| ARCH-001 | MEDIUM | FIXED | T14 | 2b1523f+aa9eb6d | root scripts yalnız test:spec (legacy hedef sıfır; CI etkilenmez); 8 ARCHIVED.md; salvaj listesi sıfır-GO (DEFERRED'ler kanıt+ sahip şartlı — denetim kaynak-atıfları inceleyicide doğrulandı); 6 ölü dağıtım girdisi silindi (gerekçeli) | Dizinler yerinde (ruling); pnpm-lock dokunulmadı (frozen doğrulandı); yetim script'ler gelecek silme görevine kayıtlı (docs/legacy-salvage-list.md + task-14 raporu §7) |
| BACK-005 | MEDIUM | FIXED | T6 | 0cd1d16 | change.test: 3 yeniden yazılmış defect-encoder — geçersiz change exit 1 + HER bölüm bayt-özdeş; kilit/staging kalıntısı yok | validate-then-persist; README + --help sözleşmeyi belgeler |
| BACK-006 | MEDIUM | FIXED | T7 | da6c335 | validation.test + plan/check lint-kapısı çiftleri; trace compile-düzeyi karar pin'i (repair view) | plan/check en az lint-clean ister; duplicate TASK- compile hatası; seviye hataları eyleme dönüştürülebilir |
| DATA-002 | MEDIUM | ACCEPTED-DOC | T19/T20 | 0be6586+52e5a85 | README "Bilinen Sınırlar": manifest alanları (artifact_hash'ler dahil) hash-kapsamı DIŞI; verify ≠ manifest özgünlüğü; freeze köken guard'ı yalnız daraltır — kaynak-doğrulamalı paragraf (fable incelemesi birebir doğruladı) | Kriptografik kök-kanıt BİLİNÇLİ yok — yalnız ticari kanıt iddiası gelirse gelir; kullanıcıya soruldu (varsayılan: dürüst sınırlama korunur) |
| SEC-003 | MEDIUM | FIXED | T15 | 1dde80e | paths.test + compile.test + server.test: symlink kaçışı (dosya+dizin, okuma+yazma) reddi — link üzerinden HİÇBİR ŞEY yazılmaz; MCP dir gerçek-dizin dışı/ghost-pin/symlink-kaçışı reddi; meşru symlink'li ebeveyn yasal | storage/paths.ts: realpath sınırlaması (önek değil), no-follow lstat yazım kapıları, checkMcpDir allowed-root; T9 önek-pin → gerçek sınırlama (güçlendirme) |
| SEC-004 | MEDIUM | FIXED | T15 | 1dde80e | runner.test: mod 0600 (temp'te, pencere yok); iki koşum → iki dosya sıralı (asla ezme); redaksiyon desen-başı 16 test + dokunulmazlık pinleri; redaksiyon-sonra-kuyruk | Run-addressed immutable adlar inject'li saat+kilit altında sayaç; korumacı redaksiyon (bearer/api-key/atama/JWT) bellekte+diskte; README best-effort + gitignore rehberi |
| SEC-005 | MEDIUM | FIXED | T16 | 4ed78f5 | 1011/1011 (+10 gerçek-süreç, 5 RED denetim senaryolarında): torun-marker TIMEOUT sonrası YAZILMAZ; stdin EOF hızlı; SIGKILL eskalasyonu (trap '' TERM); zombie-reap kanıtı (kill(pid,0) throw); overflow yolunda da grup temizliği | execInProcessGroup: detached pgid, SIGTERM→400ms grace→SIGKILL→backstop; normal tamamlanmada da grup öldürülür; setsid kaçışı+Windows dürüstçe kapsam-dışı (README) |
| OPS-001 | MEDIUM | FIXED | T17 | 41d125c | 1047/1047 (+36): 1 MiB frame-cap bayt-öncesi (aşırı satır ASLA bütün bufferlanmaz, bağlantı yaşar — pinli); in-flight 16 → -32000 busy; stdout backpressure GERÇEKTEN okuyucuyu duraklatır (pause spy pinli); EPIPE drain→exit 3 / timeout→SIGKILL exit 4 / EOF exit 0; aynı-kök mutasyon serileştirme + eşzamanlı-generate in-flight red (sıfır LLM) | stdio.ts chunk assembler; exit kodları README'de |
| TEST-001 | MEDIUM | FIXED | T2 | 8173842 | rm -rf dist → standalone `pnpm --filter ./packages/spec-core test` 578/578, exit 0 | pretest dist'i temizleyip yeniden inşa eder; bayat-dist MCP tuzağı kapandı |
| TEST-002 | MEDIUM | FIXED | T2,T13 | 8173842+2e319a1 | bayt-bayt schema testi (RED: pertürbe yakalandı); build kendi dist'ini temizler (stale-canary RED); CI fail-on-diff (porcelain, 3 vaka kanıtlı) + smoke CI'da; test standalone 936/936 | prepublishOnly tek-build; packageManager pnpm@10.17.1 pin |
| OPS-002 | MEDIUM | FIXED | T13 | 2e319a1 | workflow ci-spec-core/iş spec-core (dosya ci.yml — badge geçerli); Node 22/24 matrisi (fail-fast:false) doğrulandı; scoped PATH-filtre tüm kapı komutlarında | UZAK KANIT: run 33069880868 (2026-08-27, force-push sonrası) — spec-core (22) ✓ 52s + spec-core (24) ✓ 48s, overall SUCCESS |
| PROD-004 | MEDIUM | FIXED | T10 | 8d5e587 | 858/858 (+33): 10 araç; MCP-only init→generate→freeze→change yolculukları (mock); eşzamanlı mutasyonlarda tam-bir-kazanan; sıfır-adapter-çağrısı retleri path-başına pinli; unspoofability bataryası (allowExec/allowGenerate/llm/env/yes istekte reddedilir) | lco_generate: LCO_MCP_ALLOW_GENERATE=1 + {intent,profile,variant} digest rıza zinciri; CLI/MCP aynı çekirdekler (delegasyon, kopya değil) |
| PROD-005 | MEDIUM | FIXED | T18 | 715c419+dd79056 | 1067/1067 (+20, RED 11): version.ts 4 farklı karar (malformed/non-canonical/newer-minor/unsupported-major — hepsi eyleme-dönüştürülebilir, tek yerden, compile sınırında pinli); legacy-blok strict-when-present (boş {} ölür — kasıtlı pre-publish kırılması, dokümante); p-legacy DENEYSEL her yüzeyde (artifact dahil); 1.x politikası dürüst (makine icat yok) | Ertelenen p-legacy↔legacy lint kuralı README'de kayıtlı; README test sayıları 1067'ye sabitlendi |
| PERF-001 | MEDIUM | FIXED | T21 | af4ae5b | 1158/1158 (+80): 10/100/1000 deterministik benchmark (en kötü L12@1000 350ms, eşikler ~14×+); kullanım satırında prompt-byte (UTF-8 tam toplam); Set-dedup sıra-özdeş; src/schemas/limits.ts tavanlar (korpus maksimumu ~10×, zod .max, eyleme-dönüştürülebilir, README) | Prompt caching bilinçli ertelendi (sağlayıcı-bağımlı — gerekçeli) |
| UX-002 | MEDIUM | FIXED | T3 | fb84181 | cli.test.ts: --help/-h exit 0, --version runtime-okumalı, `cmd --help` doğrulamadan önce (RED: 6/9 fail, eski parser ./--help/'e spec açıyordu) | |
| UX-003 | MEDIUM | FIXED | T11 | c3b40dd | unknown usage dört yüzeyde "unknown" (CLI spec/blocked, rapor tablosu, G4); G4 maliyet yarısı unknown'da adlandırılmış nedenle DÜŞER (0<=3*0 tatmin edilemez); kısmi toplamlar 0 giydirilmez | |
| BACK-007 | MEDIUM | FIXED | T21 | af4ae5b | l12.test: 24+22 vaka tabloları + tümevarımsal kaba-kuvvet çapraz-kontrol (non-vacuity guard'lı); src/*.ts vs src/*.md kanıtlı ayrık (RED→GREEN); `?` yanlış-negatifi yakalanır; transitive zincir sessiz/elmas-orta işaretli/kardeş işaretli | Tanımlı alt-küme: literals/?/*/segment-** (modül başlığı+README); L12 ERROR kalır, ID değişmez; fixture sözleşmesi intact |
| BACK-008 | LOW | FIXED | T5 | 8684293 | runner.test: iki kez geçersiz A → councilDegraded + prompts[3]'te A metni yok; bir-geçersiz-sonra-geçerli tam katılım | proposeBDegraded yapısal olarak A parametresi almaz |
| SEC-006 | LOW | FIXED | T17 | 41d125c | 13-vakalık zarf bataryası (RED 9 = denetim kusurları): jsonrpc="2.0" tam; id string|number|null (object reddi, yankılanmaz); notification=YANITSIZ (geçerliyse); params object; batch → tek -32600 | Karar: geçersiz id'siz istek id:null -32600 (JSON-RPC 2.0 §5.1 örneğiyle uyumlu, dokümante) |
| UX-004 | LOW | FIXED | T11 | a0cf19a | blank/whitespace inline+DOSYA reddi sıfır adapter çağrısıyla pinli; inline 10k; --intent-file 1M akıl tavanı (kaçış yolu gerçek — dört yüzey uzlaşmış); MCP arg katmanı -32602 | Fix turu: dosya yolu shared normalizeIntent tuzağı kapatıldı (RED: 10.001+ dosya kabul) |
| OPS-003 | LOW | FIXED | T25 | cb816bc | RED (4 fail, eski TIMEOUT pin'i diff'te kanıtlı) → GREEN: taşma ayrık OUTPUT-CAP sonucu (killReason 'output-cap', ilk-neden-kazanır); gerçek timeout ayrı pinli; etiket tablo/özet/kanıt/--help/MCP tüm yüzeylerde (3-katman pinleme) | 1 MiB sınırı adlandırılır + remedy (dosyaya yönlendir) |
| TEST-003 | LOW | FIXED | T24 | 039bfa0 | 1228/1228 (+10): D-state watchdog (RED: 5s asılı → GREEN 358ms, TIMEOUT korunur, sağlıklı yol değişmez); seq-pad x-önek (≤999 bayt-özdeş); NaN mtime guard (eski kod kilidi SİLİYORDU → LockHeldError); prepublish sınır testi temp-repo; path-DP 155×155 tümevarımsal çapraz-kontrol | Coverage CI'da fail-edebilir (test:coverage eşiği 91/89/96/91 — ölçülen 95.6/92.48/99.27/95.6 ratchet); @vitest/coverage-v8 TEK yetkili devDep; boşluk taraması: canlı-sağlayıcı kayıtlı istisna |
| DATA-003 | LOW | ACCEPTED-DOC | T25 | cb816bc | Doküman-yalnız: Bilinen Sınırlar güçlendirildi (trim/format/anahtar-sırası normalizasyonu + semantik-kimlik çerçevesi); consent-kapısı "post-freeze tamper" aşırı-iddiası semantik-drift kapsamına çekildi; kod DEĞİŞMEDİ (hash/verify/compile diff'te yok — inceleyici doğruladı) | Kanonik hashing bilinçli korunur (denetimin "retain" yönü); bayt-öz provenans ekleme-notu var |
| ARCH-002 | INFO | ACCEPTED-DOC | değişmez | — | dört faz whole-branch incelemesi (fable) kaynak-düzeyinde doğruladı: izolasyon bozulmadı, zod tek üretim bağımlılığı | korunum kanıtı: P0/P1/P2/P3 final incelemeleri |
| BACK-009 | INFO | ACCEPTED-DOC | değişmez | — | dört faz final incelemesi: strict parsing korunup güçlendirildi (namespace şemaları daralttı; yeni unknown-key yutma yok) | korunum kanıtı: P0/P1/P2/P3 final incelemeleri |
| DATA-004 | INFO | ACCEPTED-DOC | değişmez | — | JSON dosya kalıcılığı korundu (storage modülü saf node:fs; DB yok) | korunum kanıtı: P0/P1/P2/P3 final incelemeleri |
| SEC-007 | INFO | ACCEPTED-DOC | değişmez | — | DRY-varsayılan + yargılanamayan-koşulmaz + stdout saflığı dört fazda yeniden-pinlendi (T17 her-satır-parse smoke dahil) | korunum kanıtı: P0/P1/P2/P3 final incelemeleri |
| TEST-004 | INFO | ACCEPTED-DOC | değişmez | — | scoped deterministik suit gerçek-süreç + gerçek MCP stdio vakalarıyla büyüdü (576→1231); mock/live ayrımı dürüst | korunum kanıtı: P0/P1/P2/P3 final incelemeleri |
