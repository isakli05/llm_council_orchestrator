# Claurst Değerlendirmesi — Provenans, Teknik Fayda ve Karar Sınırı

> Denetim: 2026-08-17. Worker G raporu + ebeveyn doğrulaması (gh api meta verisi birebir teyit edildi).
> Denetlenen: https://github.com/Kuberwastaken/claurst · main · HEAD `595b0ebe3e8afbfb71881bf95454a2ecb7b1d54c` (temiz klon) · etiket/sürüm v0.1.7 (2026-07-06) · 547 commit · 31 kimlik/katkıda bulunan · lisans GPL-3.0 (yalnız).
> Erişim: klon /tmp/audit-claurst; erişim zamanı 2026-08-16T23:24Z–2026-08-17T00:0xZ.
> Not: Worker G doğrulama için `cmake` paketini sisteme kurdu (pacman) — depo dışı, denetim izinde beyan edilir.

## 1. Cross-session kanıt durumu

§14 protokolü uygulandı: `claude --version` → 2.1.227 (≥2.1.224 OK, <2.1.232 @mention yok), platform Linux. Hedef oturum `claude-code-49` (PID 454771, cwd /home/isa/İndirilenler/claude-code, durum idle, peerProtocol=1) `claude agents --json` ile canlı teyit edildi. SendMessage iki denemede başarısız ("not reachable" — bu harness'ın araç yüzü bağımsız eş oturuma yönlendirmiyor). **Durum: UNAVAILABLE (iletilemedi).** Bu belge tamamen bağımsız doğrulamaya dayanır; önceki oturumun raporu hiçbir aşamada kanıt olarak kullanılmadı.

## 2. Eski rapor → güncel kanıt: iddia-delta tablosu

Kullanıcının betimlediği eski rapor: "iki commit'lik depo, eski Kuberwastaken/claude-code URL'si". Eski raporun tam metni erişilemediğinden delta, kullanıcının betimlemesi + bağımsız doğrulanan güncel durum üzerinden kurulmuştur.

| Konu | Eski rapor (betimleme) | Güncel doğrulanmış durum (2026-08-17) | Delta |
|---|---|---|---|
| URL/ad | Kuberwastaken/claude-code | 301 yönlendirmesi → Kuberwastaken/claurst (curl -sI, 0) | DEĞİŞTİ |
| Depo ölçeü | 2 commit | 547 commit (`git rev-list --count`) | KÖKTEN DEĞİŞTİ |
| Mimari | (iki commit'lik anlık görüntü) | Rust workspace: src-rust/ altında 12 crate, ~148K LOC; TUI ratatui 0.29; 13 sağlayıcı; models.dev tabanlı kayıt (~118 sağlayıcı/4500 model anlık görüntüsü) | YENİ |
| Sürüm | yok/bilinmiyor | v0.1.7 (2026-07-06), CI ile 5 platforma derlenen artifacts + SHA256SUMS (release.yml) | YENİ |
| Testler | bilinmiyor | `cargo test --workspace --locked` → 1773 geçti / 0 başarısız (bu makinede koşuldu; Worker G runtime kanıtı) | YENİ |
| Lisans | (eski raporda GPL-3.0 gözüküyordu) | GPL-3.0 tek lisans; kök LICENSE.md + workspace `license = "GPL-3.0"` (src-rust/Cargo.toml:22); çift lisans YOK | GEÇERLİ |
| Topluluk | yok | 10.249 yıldız, 7.774 çatal, 31 kimlik, 27 açık PR, 8 açık issue; son itme 2026-07-31 | YENİ |
| Provenans | sızıntı bağlantılı şüphesi | README.md:194 sızıntı analizini AÇIKÇA kaynak gösteriyor; spec/ 15 dosya ~1 MB (varlık/not edilmiş, içerik OKUNMADI - karantina) | DOĞRULANDI |

## 3. Provenans karantinası uygulaması

- Sızıntı kaynaklı özgün TypeScript kaynak/source map bu denetimde ERİŞİLMEDİ, alıntılanmadı, çoğaltılmadı. Yerel `~/İndirilenler/claude-code` dizininin içeriği OKUNMADI (yalnız üst-düzey ls meta verisi).
- `spec/` yalnızca varlık/boyut/amaç olarak kaydedildi (15 dosya, ~1 MB); içerik uygulama kaynağı olarak KULLANILMADI.
- Clean-room (iki fazlı süreç) iddiası README.md:205-218'de MAINTAINER CLAIM olarak etiketlendi; hukuki kesinlik TAŞIMAZ. Sızıntıdan AI ile üretilmiş spec'in kendisi karantineli materyal kabul edilir.
- Telif ifadesi analizi ile ticari sır/sözleşme/marka/distribüsyon soruları ayrı tutuldu. Bu belge hukuki görüş DEĞİLDİR.

## 4. Teknik doğrulanmış yetenekler (Worker G, path:line kanıtlı)

DOĞRULANDI (kod): TUI (crates/tui), PTY (portable-pty, pty_bash.rs), 13 sağlayıcı yönlendirici (api/src/registry.rs), models.dev model kayıt defteri (hard-coded ID YOK — mevcut llm_council_orchestrator'un tam tersi), araç döngüsü (~47 araç, iptal/compaction/bütçe), oturumlar (JSONL + SQLite), memory (memdir), subagent+worktree, teams, MCP istemcisi (rmcp), **ACP sunucusu** (canlı el sıkışma testi başarılı), plugins (veri odaklı), LSP istemcisi, izinler (4 mod) + sandbox anahtarı, hooks, cron/monitor.
YOK/DENEYSEL: DAP (yok), SSH (özellik yok), tarayıcı otomasyonu (deneysel bayrak), OTel span'leri no-op stub, MCP SUNUCU modu yok, süreç-içi SDK yok.
Risk kalemleri: OAuth yolunda bilinçli TLS parmak izi taklidi (api/src/bun_tls.rs — ToS riski), tek ana bakımcı (~%80 commit), öncü-sürüm bağımlılık (wreq 6.0.0-rc), canlı-API testi yok (1773 test hiçbir gerçek sağlayıcıya dokunmuyor).

## 5. Claurst fayda matrisi (özet) ve sınıflandırma

| Bileşen | Var? | Olgunluk | Yeniden kullanım modu | Öneri |
|---|---|---|---|---|
| ACP sunucusu | Evet (E2E testli) | İyi | **black-box harici süreç** | Teknik olarak uygun eş-ajan yüzeyi |
| stream-json headless | Evet (CC-uyumlu) | İyi | black-box harici süreç | Konsey üyesi başına child process olarak çalıştırılabilir |
| Sağlayıcı yönlendirici tasarımı | Evet | Yüksek | yalnızca-inceleme | Kayıt-defteri yaklaşımı modelimiz için ilham (kod değil) |
| TUI/PTY/araçlar/oturumlar | Evet | Yüksek | yalnızca-inceleme | Kavramlar yeniden uygulanır; kod GPL |
| DAP/SSH | Hayır | — | — | Zaten yok |
| spec/ dokümanları | Evet | — | **YASAK (karantina)** | Türetilmiş işlerde kullanılmaz |

**Sınıflandırma: STUDY + BLACK-BOX EXTERNAL PROCESS (koşullu); FORK/INTEGRATE-KOD OLARAK HARİÇ.**

## 6. Lisans karar sınırı (mühendislik çerçevesi; hukuki görüş değil)

- (i) Hukuk incelemesi OLMAKSIZIN genelde sorun olmayan: değiştirilmemiş ikiliyi ayrı süreç olarak kişisel/dahili kullanım (ACP/stream-json child process dahil); yalnızca iç yeniden dağıtım.
- (ii) NİTELİKLİ HUKUK İNCELEMESİ GEREKTİREN: herhangi bir Rust kodunu veya spec/ içeriğini kopyalamak; crate'leri GPL-olmayan ürüne statik/dinamik bağlamak; fork/yama/türev dağıtmak (GPL-3.0 kaynak ifşası + aynı lisans yükümlülükleri); farklı lisanslı ürüne katmak. Ayrıca teliften BAĞIMSIZ: sızıntı soyağacı (ticari sır maruzu), OAuth TLS taklidi (ToS), "Claude Code davranışı" klonlaması/marka yakınlığı.

## 7. OMP/Pi ile karşılaştırma ve nihai teknik hüküm

Claurst teknik bakımdan etkileyici (bu makinede check+test+release build+ACP el sıkışması hep geçti) ANCAK bizim senaryomuz için temel olarak elenir: (1) GPL-3.0 — MIT lisanslı OMP/Pi'nin aksine kod düzeyi her kullanım hukuk incelemesine takılır; (2) süreç-içi SDK yok — TypeScript konsey motoru yalnızca child-process (ACP/stream-json) sürülebilir; (3) DAP/SSH yok; (4) provenans yükü (sızıntı soyağacı + TLS taklidi) dağıtılan bir ürüne taşınması kabul edilemez risk. OMP (MIT, fork-of-Pi, TS) ve Pi (MIT, TS, npm SDK) her boyutta daha uygun temeldir. Claurst'ün değeri: (a) kamuya açık davranışsal karşılaştırma noktası (CC-parite hedefleri, ACP gerçek kullanım örneği), (b) opsiyonel harici eş-ajan (kullanıcının kendi makinesinde, dağıtımsız), (c) sağlayıcı-kayıt defteri tasarım referansı. **Phase 4 çalışma zamanı seçiminde Claurst temel/ fork olarak DEĞERLENDİRİLMEZ; yalnızca study/black-box sınıfında kalır.**
