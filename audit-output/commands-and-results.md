# Komutlar ve Sonuçlar — Denetim Kanıt Günlüğü

> Denetim tarihi: 2026-08-17. Tüm komutlar salt-okunur denetim amaçlı çalıştırılmıştır.
> Ana depo çalışma ağacı hiçbir noktada değiştirilmedi (aşağıda `git status` kanıtı).
> Build/test yeniden üretimi İzole geçici klon üzerinde Worker E tarafından yürütülür (bkz. ayrı bölüm).

## 1. Ebeveyn Preflight (ana depo)

Çalışma dizini: `/home/isa/projects/llm_council_orchestrator`

| # | Komut | Çıkış kodu | Sonuç özeti |
|---|------|-----------|-------------|
| 1 | `git remote -v` | 0 | origin = git@github.com:isakli05/llm_council_orchestrator.git (fetch+push) |
| 2 | `git status --short` | 0 | BOŞ — çalışma ağacı temiz |
| 3 | `git branch -a` | 0 | `* main`; `remotes/origin/main`, `remotes/origin/HEAD -> origin/main` |
| 4 | `git rev-parse HEAD` | 0 | `a5347e69ea5d726bd6c6bd6201385bfdb886ac5c` — referans commit ile BİREBİR AYNI |
| 5 | `git log -1 --format` | 0 | Tarih 2026-03-09 17:11:38 +0300, "docs: Add cost explosion audit for council architecture" |
| 6 | `git tag --sort=-version:refname` | 0 | BOŞ — depoda HİÇ etiket yok, release yok |
| 7 | `git log --oneline --decorate --graph --all` | 0 | 5 commit total: 8045565 → 7d00e56 → bf63bfb → 5b40302 → a5347e6 (lineer, tek dal) |
| 8 | `git ls-tree -r --name-only HEAD \| wc -l` | 0 | 349 izlenen dosya |
| 9 | `node --version` | 0 | v24.14.0 |
| 10 | `pnpm --version` | 0 | 10.17.1 |
| 11 | `find . -name package.json -not -path '*/node_modules/*'` | 0 | 8 adet: kök + apps/{indexer,mcp_bridge,orchestrator} + packages/shared-{config,observability,types,utils} |
| 12 | `find .. -name AGENTS.md -o -name CLAUDE.md ...` | 0 | Bu depoda YOK (komşu projelerde var: MaPos-v2, isakli.uk) |
| 13 | `jq ... package.json` (kök + 3 app) | 0 | Hiçbir pakette `bin` alanı YOK → CLI giriş noktası yok. Orchestrator deps: fastify 4, @opentelemetry/api, opossum, zod, uuid — resmî LLM SDK yok |
| 14 | `rg 'TODO\|FIXME\|placeholder\|describe.skip\|it.skip\|test.skip'` | 0 | 15 dosyada eşleşme. Kritik: tests/integration/orchestrator-auth.integration.test.ts (~20 `it.skip`), tests/e2e/quick-diagnostic-workflow.e2e.test.ts (`describe.skip` + TODO'lar) |
| 15 | `rg 'node-pty\|ssh2\|tmux'` | 1 (eşleşme yok) | PTY/SSH/tmux bağımlılığı ve kullanımı YOK |
| 16 | `rg -il 'worktree\|checkpoint\|rewind\|sandbox\|lsp\|dap'` | 0 | Yalnız 2 test/trace dosyasında geçiyor (bağımlılık yok) |

### Preflight erken bulgular (ebeveyn doğrulaması)
- `tasks/PROJECT_ANALYSIS_REPORT.md:51` (depoda Türkçe): "Temel pipeline tam, spec üretimi placeholder" — deponun KENDİ raporu spec üretiminin placeholder olduğunu söylüyor.
- `apps/orchestrator/REFACTOR_04_COMPLETION_REPORT.md:243`: "the implementation is production-ready" iddiası — Worker A tarafından çapraz doğrulanacak.
- `.github/workflows` dizini `git ls-tree` çıktısında YOK → CI yok hipotezi güçlü.

## 2. Cross-Session Messaging Preflight

| # | Komut | Çıkış kodu | Sonuç |
|---|------|-----------|-------|
| 1 | `claude --version` | 0 | 2.1.227 (Claude Code) — ≥2.1.224 GEREKSİNİMİ KARŞILIYOR; <2.1.232 (@session mention için) |
| 2 | `uname -s` | 0 | Linux — platform uygun |
| 3 | `ls ~/.claude/projects/ \| grep -i 'claude-code'` | 0 | `-home-isa--ndirilenler-claude-code` proje dizini mevcut (~/İndirilenler/claude-code) |
| 4 | `ls -lt .../e71ba8a5-*.jsonl` | 0 | Son aktivite 2026-08-17 02:05 (+03) — 10 dk önce, oturum canlı |
| 5 | `claude agents --json` | 0 | 3 oturum: signage (blocked), llm-council-orchestrator-10 (bu oturum, busy), **claude-code-49** (idle, cwd=/home/isa/İndirilenler/claude-code, sessionId e71ba8a5-1d86-4094-ae3e-0f676839fedc, peerProtocol=1) |
| 6 | SendMessage → `claude-code-49` | FAIL | "No agent named 'claude-code-49' is reachable" |
| 7 | SendMessage → `e71ba8a5-…` (sessionId) | FAIL | Aynı hata — bu oturumun SendMessage yüzü yalnız kendi alt-agent/teammate'lerine yönlendiriyor |

**Durum: UNAVAILABLE (delivered değil).** Hedef oturum canlı + idle + peerProtocol=1 iken bu harness'ın araç yüzünden yönlendirilemedi. v2.1.227 < 2.1.232 olduğundan @session mention sözdizimi de yok. Manuel dosya/inbox müdahalesi yasak (§14.1) → bağımsız Worker G denetimiyle devam. Kullanıcı istese `claude-code-49` oturumunda elle mesaj gönderebilir; denetim bunu beklemez.

### Provenans karantina notu
`~/İndirilenler/claude-code` yerel dizini sızıntı kaynaklı telifli materyal içerebilir. Bu denetimde dizin içeriği OKUNMADI (yalnızca üst-düzey `ls` meta-verisi). Worker G yalnız kamu GitHub deposu `Kuberwastaken/claurst` üzerinde çalışır.

## 3. Ebeveyn Çapraz Doğrulama Komutları (Wave 1 + F + D)

| # | Komut | Çıkış | Sonuç |
|---|------|-------|-------|
| A1 | `git ls-files \| grep '^\.env'` + `.env.test` uzunluk ölçümü (değer YAZILMADI) | 0 | `.env.test` izli; `ZAI_API_KEY=` 49 karakter değer; bf63bfb'de eklendi → F19 doğrulandı |
| A2 | `sed -n '1520,1564p' PipelineEngine.ts` | 0 | `default:` dalı placeholder success: true → F3 doğrulandı |
| A3 | `rg 'console.log\|process.stdout' apps/mcp_bridge/src` | 0 | transport/MCPServer.ts:207 + observability/Logger.ts:29 aynı stdout → F18 doğrulandı (yol düzeltmesiyle) |
| A4 | `gh api repos/isakli05/...` (workflows/releases/issues) | 0 | 0/0/0, private:false, pushed 2026-03-09 → F20 doğrulandı |
| B1 | `sed -n '1395,1434p'` + `sed -n '83,95p'` PipelineEngine.ts | 0 | Mod adım listeleri + DEEP_DOMAIN_ANALYSIS_ROLES=[LEGACY,ARCHITECT] → F4, F5, F10 doğrulandı |
| B2 | `sed -n '605,640p'` Aggregator.ts | 0 | `extractModuleSpecs` sabit placeholder dizisi → F6 doğrulandı |
| B3 | `rg 'grok' ModelGateway.ts`; `rg 'callWithRetry'` | 0 | grok parse ediliyor adaptör yok; callWithRetry yalnız tanım → F12, F13 doğrulandı |
| C1 | SpecController.ts:10-25 + `git log --follow` artifact | 0 | Sabit dosya adı; artifact yalnız 8045565'te → F8 doğrulandı |
| C2 | `rg 'aggregator\.aggregate'` | 0 | Tek çağıran PipelineEngine.ts:2499 (FULL aggregate adımı) → aggregateSpec erişilmez (F6) |
| F1v | `sed -n '1170,1178p'` indexer server.ts | 0 | `host: '0.0.0.0'` varsayılanı → F'nin indexer-binding bulgusu doğrulandı |
| F2v | `sed -n '165,175p'` GeminiAdapter.ts | 0 | `params: { key: this.apiKey }` → anahtar URL sorgusunda, doğrulandı |
| F3v | WebFetch developers.openai.com/api/docs/models/gpt-5.2-pro | 200 | "Responses API only… Chat Completions not supported" → Aggregator varsayılan yolda KIRIK (docs düzeyinde kesin; adaptör /v1/chat/completions'e post atıyor — OpenAIAdapter.ts:13) |
| D1 | `gh api repos/can1357/oh-my-pi` (license/push/lang) | 0 | MIT, TypeScript, pushed 2026-08-16 → doğrulandı |
| D2 | OMP LICENSE içeriği | 0 | Çift telif (Zechner + Bölük) → Pi fork iddiasıyla tutarlı |
| D3 | raw sdk.ts grep outputSchema | 0 | sdk.ts:511-513, 1694-1695'te `outputSchema/outputSchemaMode` → şema-doğrulanmış subagent çıktısı doğrulandı |
| D4 | `gh api repos/badlogic/pi-mono` | 0 | MIT, TypeScript, pushed 2026-08-16 → doğrulandı |

## 4. Worker E — İzole Build/Test Yeniden Üretimi (/tmp/audit-lco, temiz klon @ a5347e6)

| # | Komut | Çıkış | Sonuç |
|---|------|-------|-------|
| E1 | `git clone <primary> /tmp/audit-lco` | 0 | Temiz klon @ a5347e6 |
| E2 | `pnpm install --frozen-lockfile` | 0 | 312 paket, sorunsuz |
| E3 | `pnpm build` | **2** | shared-observability OK; mcp_bridge OK; **orchestrator BAŞARISIZ: 85 TS hatası** (tümü src/pipeline/__tests__ içinde; jest-dönemi kod + tip sürüklenmesi); **indexer'da build script YOK** |
| E4 | `pnpm test` | **1** | Dosya: 6 başarısız/25 geçti/1 atlandı; **Test: 60 başarısız / 406 geçti / 25 atlandı** (491) |
| E5 | `pnpm test:unit` | 1 | CLI çökmesi: `--dir` iki kez verilmiş; 0 test koştu |
| E6 | `pnpm test:integration` | 1 | "No test files found" |
| E7 | `pnpm test:e2e` | 1 | "No test files found" |
| E8 | `pnpm test:property` | 1 | CLI çökmesi: `Unknown option '--grep'` (vitest `-t` kullanır) |
| E9 | `pnpm test:coverage` | 1 | Aynı 60 başarısızlık; **coverage tablosu basılmadı**; eşikler (70/70/60/70) doğrulanamaz |
| E10 | `tsc --noEmit` orchestrator | 2 | 85 hata (src içindeki test dosyaları) |
| E11 | `tsc --noEmit` mcp_bridge | 0 | Temiz |
| E12 | `tsc --noEmit` indexer | 2 | 10 hata (test dosyaları) |
| E13 | `tsc --noEmit` shared-observability | 0 | Temiz |
| E14 | `tsc --noEmit` shared-config/types/utils | 2 | Bu paketlerde **tsconfig.json yok** → kök tsconfig'e düşüyor → 102'er hata |
| E15 | lint/verify scriptleri | — | Hiçbir package.json'da yok — KOŞULMADI |
| E16 | Sigara: orchestrator (tsx, 19801) | 0 | Dış bağımlılıksız açılır; /health/live + /health 200; temiz kapanma |
| E17 | Sigara: indexer (19802) | 0 | Açılır; /health 200; ensure → dürüst hata: embedding sunucusu yok (localhost:8000) |
| E18 | Sigara: mcp_bridge (stdio echo) | 0 | Açılır; JSON-RPC initialize yanıtlar; orchestrator'sız çalışır |

**Mock/gerçek sınıflandırması (özet):** Gerçek-yerel-servis: orchestrator-indexer-real (24 test: 12 geçti / 12 embedding gereği başarısız — dürüst başarısızlık, sahte değil). Gerçek-dış: ModelGateway.real-api.test.ts (3 test — **commit'lenmiş Z.AI anahtarıyla CANLI çağrı**; anahtar yoksa sessiz no-op). Mocklı: pipeline-status-flow, IndexClient.rag, mcp_bridge entegrasyonu (el yapımı mock orchestrator). Atlanan: auth 18 it.skip + e2e 7 (describe.skip; açılsa bile sunucu başlatma kodu yorumda, satır 158-167).
**Sahte-başarı desenleri (test tarafı):** auth suitinde 2 "her zaman geçen" dokümantasyon-testi (:439, :471); IndexController.test.ts:110 koşullu-boş assert; mcp integration.test.ts:284 `expect(true).toBe(true)`; real-api testi anahtar yokken sessiz return (:19-25). Üretim tarafındaki asıl vektör PipelineEngine.ts:1544 placeholder dalı ve bunu kapsayan test YOK.
**.audit/plans-out "268/336 test %100 geçiyor, üretime hazır" iddiaları bu commit'ten yeniden üretilemez.**

## 5. Worker G — Claurst Denetim Komutları (/tmp/audit-claurst, temiz klon @ 595b0eb)

| # | Komut | Çıkış | Sonuç |
|---|------|-------|-------|
| G1 | `git clone --filter=blob:none …/claurst` | 0 | Temiz klon; HEAD 595b0ebe3e8afbfb71881bf95454a2ecb7b1d54c |
| G2 | `git tag` / `rev-list --count` / `shortlog -sne` | 0 | v0.1.7 (2026-07-06); 547 commit; 31 kimlik |
| G3 | `gh api repos/Kuberwastaken/claurst` | 0 | GPL-3.0; 10.249 yıldız; 7.774 çatal; pushed 2026-07-31 (ebeveynce yeniden doğrulandı) |
| G4 | `curl -sI …/Kuberwastaken/claude-code` | 0 | 301 → claurst |
| G5 | `cargo check --workspace --locked` | 0 (cmake kuruldu: ilk deneme 101) | Uyarısız, 57s; rustc 1.95.0 |
| G6 | `cargo test --workspace --locked` | 0 (ilk deneme 101: tmpfs doldu → CARGO_TARGET_DIR=/var/tmp) | **1773 geçti / 0 başarısız** |
| G7 | `cargo build --release --locked -p claurst` | 0 | 36.303.744 bayt; `claurst 0.1.7` |
| G8 | `echo {initialize} \| claurst acp` | 0 | Geçerli JSON-RPC yanıtı (canlı ACP el sıkışması) |

Not: G5 için `cmake` paketi sisteme kuruldu (pacman) — depo dışı sistem değişikliği, denetim izni kapsamında beyan edilir. spec/ yalnızca varlık/boyut (15 dosya, ~1 MB) olarak kaydedildi; içerik OKUNMADI (provenans karantinası).
