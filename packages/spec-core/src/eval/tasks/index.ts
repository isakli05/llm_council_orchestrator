/**
 * Deterministic eval corpus for the spec-core evidence gate.
 *
 * 20 natural-language intents a spec-producing pipeline must handle:
 * - ET-01..ET-12 `greenfield`: coherent, well-constrained requests that MUST
 *   produce a valid bundle (requirements, acyclic tasks, verification).
 *   ET-01..ET-06 are `p-mini` (small CLI / game / converter scopes),
 *   ET-07..ET-12 are `p-standard` (API-backed services with NFR hints).
 * - ET-13..ET-17 `ambiguous`: deliberately under-specified requests; the
 *   pipeline must block instead of guessing.
 * - ET-18..ET-20 `conflicting`: single intents carrying two contradictory
 *   constraints; the pipeline must block instead of silently picking one.
 *
 * Intents are written in Turkish (the product's target language) as realistic
 * 3-8 sentence user requests. They are the eval set itself — treat every edit
 * as a change of exam questions, not of copy.
 *
 * PROD-003 / RESIDUAL PROD-003: every greenfield task carries ONE
 * CONSTRAINT_TRACE assertion — the concrete constraints its intent names,
 * each predeclared as a machine-checkable grounding requirement
 * (requirement statement -> covering task -> related test -> judgeable
 * verification, plus optional numeric relation retention and a forbidden-
 * invention absence list). This REPLACES the earlier MENTIONS_TERMS
 * term-presence check, which a keyword dump or a glossary echo could satisfy.
 * Terms are deliberately script/tech literals (SQLite, JWT, --sep, 429,
 * 09:00), not Turkish prose, so a faithful spec in any language satisfies
 * them by carrying the constraint values. The corpus test pins that every
 * term literally appears in its own intent, that no raw good fixture
 * satisfies any task's constraint set, and that forbidden terms are absent
 * from their own intent (they police INVENTIONS, not intent wording).
 *
 * FROZEN: this corpus (intents + constraint declarations + gate thresholds)
 * is hash-locked by src/eval/corpus-lock.json (see corpus-lock.ts). Editing
 * any of it without appending a new dated lock entry makes every eval run
 * fail loudly.
 */

export type EvalTaskId =
  | 'ET-01' | 'ET-02' | 'ET-03' | 'ET-04' | 'ET-05' | 'ET-06' | 'ET-07'
  | 'ET-08' | 'ET-09' | 'ET-10' | 'ET-11' | 'ET-12' | 'ET-13' | 'ET-14'
  | 'ET-15' | 'ET-16' | 'ET-17' | 'ET-18' | 'ET-19' | 'ET-20';

export type EvalTaskKind = 'greenfield' | 'ambiguous' | 'conflicting';

export type EvalTaskProfile = 'p-mini' | 'p-standard';

/** Declared numeric relation an intent states about a constrained quantity. */
export type NumericOperator = '==' | '<=' | '>=' | '<' | '>';

/**
 * One predeclared, machine-checkable intent constraint (RESIDUAL PROD-003).
 *
 * `terms` are anchor literals the intent names verbatim. A pure-digit term
 * (e.g. '7', '429') is matched as a STANDALONE number token (so '7' does not
 * match inside '17' or 'C7'); every other term is matched as normalized
 * substring text (so 'PostgreSQL' matches 'postgresql' and 'İstanbul'
 * matches 'Istanbul').
 *
 * `numeric`, when present, additionally requires the declared value to be
 * retained as a number token in the anchor sentence(s) of the grounding
 * requirement statement, and every OTHER number in those sentences to be
 * consistent with the declared relation (an intent-named number is always
 * allowed — the intent's own quantities are ground truth; a foreign number
 * on the wrong side of the declared bound is an invented re-scaling).
 */
export interface IntentConstraint {
  /** 'C1'.. per task — unique within its CONSTRAINT_TRACE. */
  id: string;
  /** Anchor terms; ALL must be grounded in one requirement statement. */
  terms: string[];
  /** Declared numeric relation retained in the anchor sentence (optional). */
  numeric?: { operator: NumericOperator; value: number };
}

/**
 * CONSTRAINT_TRACE (RESIDUAL PROD-003): intent fidelity as a grounding trace
 * rather than term presence. Each constraint must be carried by an actual
 * requirement statement (NOT glossary/decision prose, NOT the bundle's own
 * intent echo); that requirement must be referenced by >= 1 task; that task
 * must carry a related test case (a case text naming one of the constraint's
 * terms) and a judgeable verification contract (an `expect` stating an exit
 * code — the L14 contract — with a real command). Numeric constraints retain
 * their declared operator/value. `forbidden` lists architectural inventions
 * the intent explicitly rules out; each term must be ABSENT from the bundle's
 * commitment surfaces (glossary terms, decision statements, task titles).
 *
 * Honest boundary (documented in the pre-registration): a determined
 * adversary can still fabricate a full fake trace — a deterministic gate
 * pins WHERE evidence must live, it cannot read prose semantics. A prose
 * operator flip that keeps every digit ('under 300' -> 'at least 300') is
 * likewise not detectable without NLP; value re-scaling and off-values are.
 */
export interface ConstraintTraceAssertion {
  type: 'CONSTRAINT_TRACE';
  constraints: IntentConstraint[];
  /** Invention vectors: absent from the intent itself, enforced absent from commitment surfaces. */
  forbidden?: string[];
}

/**
 * Machine-checkable expectation about the bundle a pipeline produces for a
 * task. The runner (W5) evaluates these against the compiled bundle; nothing
 * here involves an LLM judge.
 */
export type DeterministicAssertion =
  | { type: 'HAS_REQUIREMENTS'; min: number }
  | { type: 'TASKS_ACYCLIC' }
  | { type: 'TASKS_HAVE_VERIFICATION' }
  | { type: 'TRACE_REQ_TASK_COVERED' }
  | { type: 'STATE_IS_DRAFT_OR_BLOCKED' }
  | { type: 'BLOCKED' }
  | ConstraintTraceAssertion;

export interface EvalTask {
  /** 'ET-01'..'ET-20', unique across the corpus. */
  id: EvalTaskId;
  /** greenfield must pass; ambiguous/conflicting must be blocked. */
  kind: EvalTaskKind;
  /** p-mini: small CLI/game/converter scope; p-standard: API-backed service. */
  profile: EvalTaskProfile;
  /** Natural-language user intent (Turkish, 3-8 sentences, realistic). */
  intent: string;
  /** True exactly for kind 'ambiguous' or 'conflicting'. */
  must_be_blocked: boolean;
  /** At least 2 per task; all deterministic over the compiled bundle. */
  assertions: DeterministicAssertion[];
}

export const EVAL_TASKS: EvalTask[] = [
  // ── Greenfield, p-mini: small CLI / game / converter scopes ────────────
  {
    id: 'ET-01',
    kind: 'greenfield',
    profile: 'p-mini',
    intent:
      'Kullanıcıların uzun URL\'leri kısaltabildiği, her kısa kodun tıklanma sayısını izleyen tek dosyalık bir komut satırı aracı istiyorum. Kısa kodlar tam 7 karakter olmalı ve yalnızca harf, rakam ile tire karakterini içermeli. Veriler proje dizinindeki tek bir SQLite dosyasında tutulmalı, araç hiçbir ağ bağlantısı veya harici sunucu gerektirmemeli. shorten, stats ve resolve olmak üzere üç alt komut bulunmalı; resolve mevcut olmayan bir kod için 3 numaralı kaçış koduyla sonlanmalı. Araç, günde en fazla 1000 kısaltma varsayımıyla saniyede 10 işlemin altında kalmacak kadar hızlı olmalı.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 3 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: single SQLite file, offline (no network/server), 7-char codes,
        // shorten/stats/resolve subcommands, exit 3 on unknown resolve
        constraints: [
          { id: 'C1', terms: ['sqlite'] },
          { id: 'C2', terms: ['shorten'] },
          { id: 'C3', terms: ['resolve'] },
          { id: 'C4', terms: ['7'], numeric: { operator: '==', value: 7 } },
        ],
        forbidden: ['http', 'api', 'websocket', 'rest'], // "hiçbir ağ bağlantısı veya harici sunucu gerektirmemeli"
      },
    ],
  },
  {
    id: 'ET-02',
    kind: 'greenfield',
    profile: 'p-mini',
    intent:
      'Elle yazdığım notları Markdown biçiminden HTML\'e çeviren küçük bir komut satırı aracı istiyorum. Başlıklar, kalın ve italik vurgular, sıralı ve sıralanmamış listeler, kod blokları ile bağlantılar desteklenmeli. Girdi dosyası yolu argüman olarak alınmalı, çıktı aynı adı taşıyan .html uzantılı dosyaya yazılmalı. Tanınmayan bir söz dizimi eşleştiğinde araç hata vermek yerine metni olduğu gibi aktarmalı ve standart hataya bir uyarı basmalı. Yalnızca dilin standart kitaplığı kullanılmalı; 10 MB\'lık bir girdi dosyası 2 saniyenin altında dönüşmelidir.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 3 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: Markdown->HTML, stdlib only, 10 MB input under 2 seconds
        constraints: [
          { id: 'C1', terms: ['markdown'] },
          { id: 'C2', terms: ['html'] },
          { id: 'C3', terms: ['2'], numeric: { operator: '<', value: 2 } },
        ],
        forbidden: ['axios', 'express'], // "yalnızca dilin standart kitaplığı kullanılmalı"
      },
    ],
  },
  {
    id: 'ET-03',
    kind: 'greenfield',
    profile: 'p-mini',
    intent:
      'Terminalde çalışan, bilgisayarın 1 ile 100 arasında tuttuğu sayıyı kullanıcıya 7 denemede bulduran bir sayı tahmin oyunu istiyorum. Her denemeden sonra daha büyük, daha küçük veya bildin biçiminde bir geri bildirim verilmeli. Kullanıcı sayı olmayan bir giriş yaptığında program çökmemeli ve geçersiz giriş deneme hakkını harcamamalı. Oyun bitiminde kaç denemede bilindiği gösterilmeli, tekrar oynama sorusuna evet denilirse yeni bir sayı tutulmalı. Renkli çıktı ANSI kaçış kodlarıyla verilmeli ama Windows terminalinde de okunaklı kalmalı.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 3 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: 1..100 range, 7 attempts, ANSI colors
        constraints: [
          { id: 'C1', terms: ['ansi'] },
          { id: 'C2', terms: ['100'], numeric: { operator: '<=', value: 100 } },
          { id: 'C3', terms: ['7'], numeric: { operator: '<=', value: 7 } },
        ],
      },
    ],
  },
  {
    id: 'ET-04',
    kind: 'greenfield',
    profile: 'p-mini',
    intent:
      'Satış raporlarını CSV biçiminden JSON\'a dönüştüren bağımsız bir komut satırı aracı istiyorum. İlk satır başlık kabul edilmeli, sayısal görünen alanlar otomatik olarak JSON sayısına çevrilmeli, boş hücreler null olmalı. Ayraç varsayılan olarak virgül olmalı ama --sep bayrağıyla noktalı virgül de seçilebilmeli. Biçimi bozuk bir satır bulunursa araç o satırı atlamalı ve işin sonunda kaç satır atlandığını raporlamalı. 50.000 satırlık bir girdi dosyası 5 saniyenin altında işlenmelidir.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 3 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: CSV->JSON, --sep flag, 50.000 rows under 5 seconds
        constraints: [
          { id: 'C1', terms: ['csv'] },
          { id: 'C2', terms: ['json'] },
          { id: 'C3', terms: ['--sep'] },
          { id: 'C4', terms: ['5'], numeric: { operator: '<', value: 5 } },
        ],
      },
    ],
  },
  {
    id: 'ET-05',
    kind: 'greenfield',
    profile: 'p-mini',
    intent:
      'Yapılacaklarımı terminalden yönetmem için sade bir todo uygulaması istiyorum. add, list, done ve remove olmak üzere dört komut bulunmalı; kayıtlar kullanıcı ana dizinindeki tek bir JSON dosyasında saklanmalı. Her kayıt en fazla 200 karakterlik bir başlık ve isteğe bağlı bir son tarih taşımalı. list çıktısı gecikmiş öğeleri en üste almalı ve bunları ünlem işaretiyle işaretlemeli. Veri dosyası bozuksa araç çökmek yerine bozuk dosyayı yedekleyip boş bir listeden devam etmeli.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 3 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: single JSON store, add/list/done/remove, <= 200-char titles
        constraints: [
          { id: 'C1', terms: ['json'] },
          { id: 'C2', terms: ['remove'] },
          { id: 'C3', terms: ['200'], numeric: { operator: '<=', value: 200 } },
        ],
      },
    ],
  },
  {
    id: 'ET-06',
    kind: 'greenfield',
    profile: 'p-mini',
    intent:
      'Ekiple paylaştığımız servis hesapları için güçlü parolalar üreten küçük bir komut satırı aracı istiyorum. Varsayılan olarak 16 karakter uzunluğunda, büyük ve küçük harfler ile rakam ve özel karakter içeren parolalar üretilmeli. --length bayrağıyla 8 ile 128 arasında bir uzunluk seçilebilmeli, --no-symbols bayrağıyla özel karakterler dışlanabilmeli. Parolalar kriptografik kalitede bir rastgelelik kaynağıyla üretilmeli, aynı komut art arda çalıştığında sonuçlar arasında hiçbir benzerlik olmamalı. Üretilen parolalar hiçbir log dosyasına yazılmamalı, yalnızca standart çıktıya basılmalı.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 3 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: 16-char default, --length 8..128, --no-symbols, never logged
        constraints: [
          { id: 'C1', terms: ['--length'] },
          { id: 'C2', terms: ['--no-symbols'] },
          { id: 'C3', terms: ['16'], numeric: { operator: '==', value: 16 } },
          { id: 'C4', terms: ['8'], numeric: { operator: '>=', value: 8 } },
          { id: 'C5', terms: ['128'], numeric: { operator: '<=', value: 128 } },
        ],
      },
    ],
  },

  // ── Greenfield, p-standard: API-backed services with NFR hints ────────
  {
    id: 'ET-07',
    kind: 'greenfield',
    profile: 'p-standard',
    intent:
      'Bir ekip için görev yönetimi sunan REST tabanlı bir servis istiyorum. Kullanıcılar e-posta ve parola ile kayıt olabilmeli, oturum açtığında 24 saat geçerli bir JWT almalı. Görevler başlık, açıklama, son tarih ve durum alanlarını taşımalı; bir görevi yalnızca sahibi görebilmeli ve değiştirebilmeli. POST /tasks, GET /tasks, PATCH /tasks/:id ve DELETE /tasks/:id uçları bulunmalı ve tüm yanıtlar JSON olmalı. p95 uçtan uca gecikme 300 ms\'nin altında olmalı, servis 500 eşzamanlı bağlantıyı düşürmeden taşımalı. Veriler PostgreSQL\'te saklanmalı, parolalar güçlü bir karma algoritmasıyla özetlenerek tutulmalı.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 4 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      { type: 'TRACE_REQ_TASK_COVERED' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: 24-hour JWT, PostgreSQL, p95 < 300 ms, 500 concurrent
        constraints: [
          { id: 'C1', terms: ['jwt'] },
          { id: 'C2', terms: ['postgresql'] },
          // unit anchor: 'ms' survives an off-value rewrite, so a wrong bound
          // fails NUMERIC_VALUE_MISSING rather than mere un-grounding
          { id: 'C3', terms: ['ms'], numeric: { operator: '<', value: 300 } },
          { id: 'C4', terms: ['24'], numeric: { operator: '==', value: 24 } },
        ],
      },
    ],
  },
  {
    id: 'ET-08',
    kind: 'greenfield',
    profile: 'p-standard',
    intent:
      'Apartman arkadaşlarıyla ortak giderleri paylaşmak için bir gider takip servisi istiyorum. Kullanıcı bir grup oluşturabilmeli, gruba gider ekleyebilmeli ve sistem her ayın sonunda kimin kime ne kadar borçlu olduğunu en az sayıda transferle hesaplamalı. Tüm işlemler kimlik doğrulaması gerektirmeli, grup verilerini yalnızca grup üyeleri okuyabilmeli. Gider tutarları kuruş hassasiyetinde tutulmalı ve ondalık kayan nokta hataları oluşmamalı. Silinen giderler 30 gün boyunca geri alınabilir olarak saklanmalı, bu sürenin sonunda kalıcı olarak silinmeli.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 4 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      { type: 'TRACE_REQ_TASK_COVERED' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: minimal-transfer settlement, deleted expenses recoverable 30 days
        constraints: [
          { id: 'C1', terms: ['transfer'] },
          { id: 'C2', terms: ['30'], numeric: { operator: '<=', value: 30 } },
        ],
      },
    ],
  },
  {
    id: 'ET-09',
    kind: 'greenfield',
    profile: 'p-standard',
    intent:
      'Yüklenen görsellerin farklı boyutlarda önizlemelerini üreten bir servis istiyorum. İstemci görseli yüklediğinde servis 200, 600 ve 1200 piksel genişlikte üç küçültülmüş kopya oluşturmalı ve CDN üzerinden sunulacak adresleri dönmeli. Yalnızca JPEG ve PNG kabul edilmeli, 20 MB üzeri dosyalar 413 yanıtıyla reddedilmeli. Dönüşüm 30 saniyeden uzun sürecektense iş asenkron kuyruğa alınmalı ve istemciye bir durum sorgulama adresi verilmeli. Başarısız dönüşümler en fazla 3 kez yeniden denenmeli, tümü başarısız olursa iş ölü mektup kuyruğuna taşınmalı.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 4 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      { type: 'TRACE_REQ_TASK_COVERED' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: JPEG/PNG only, > 20 MB rejected with 413, 200/600/1200 px via CDN
        constraints: [
          { id: 'C1', terms: ['jpeg'] },
          { id: 'C2', terms: ['png'] },
          // unit anchor: 'mb' survives an off-value status-code rewrite
          { id: 'C3', terms: ['mb'], numeric: { operator: '==', value: 413 } },
          { id: 'C4', terms: ['cdn'] },
        ],
      },
    ],
  },
  {
    id: 'ET-10',
    kind: 'greenfield',
    profile: 'p-standard',
    intent:
      'Kullanıcılara haftalık özet e-postaları gönderen bir bildirim servisi istiyorum. Servis her pazar 09:00\'da Europe/Istanbul saat dilimine göre o haftanın özetini derleyip abonelere göndermeli. Kullanıcılar e-posta adreslerini doğrulamadan abone olamamalı ve tek tıklamayla abonelikten çıkabilmeli. Gönderim başına en fazla 3 deneme yapılmalı, üç kez üst üste başarısız olan adresler 90 gün boyunca kara listeye alınmalı. Servis saatte 10.000 e-posta gönderimini desteklemeli, gönderim kayıtları denetim için 1 yıl saklanmalı.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 4 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      { type: 'TRACE_REQ_TASK_COVERED' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: Sundays 09:00 Europe/Istanbul, max 3 retries, 90-day blacklist
        constraints: [
          { id: 'C1', terms: ['09:00'] },
          { id: 'C2', terms: ['istanbul'] },
          { id: 'C3', terms: ['90'], numeric: { operator: '>=', value: 90 } },
          { id: 'C4', terms: ['3'], numeric: { operator: '<=', value: 3 } },
        ],
      },
    ],
  },
  {
    id: 'ET-11',
    kind: 'greenfield',
    profile: 'p-standard',
    intent:
      'Üçüncü parti bir hava durumu sağlayıcısının önünde önbellek katmanı görevi görecek bir API ağ geçidi istiyorum. weather uç noktası üst sağlayıcıya saatte en fazla 1.000 istek gönderebilmeli; aynı şehir için 10 dakika içinde yinelenen istekler önbellekten yanıtlanmalı. Sağlayıcı yanıt vermezse ağ geçidi son başarılı yanıtı bayat olarak etiketleyip dönmeli. İstemcilere günlük 5.000 isteklik ücretsiz kota uygulanmalı, aşım durumunda 429 yanıtı dönmeli. Tüm uçlar API anahtarıyla korunmalı ve anahtarlar düz metin olarak saklanmamalı.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 4 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      { type: 'TRACE_REQ_TASK_COVERED' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: weather endpoint, 10-minute cache, 429 on quota exceed
        constraints: [
          { id: 'C1', terms: ['weather'] },
          { id: 'C2', terms: ['429'] },
          { id: 'C3', terms: ['10'], numeric: { operator: '<=', value: 10 } },
        ],
      },
    ],
  },
  {
    id: 'ET-12',
    kind: 'greenfield',
    profile: 'p-standard',
    intent:
      'Mahalle kütüphanesi için kitap rezervasyon servisi istiyorum. Bir kitabın tüm kopyaları dışarıda olduğunda üye sıraya girebilmeli, kitap geri döndüğünde sıradaki ilk üyeye e-posta bildirimi gitmeli. Rezervasyon 48 saat içinde teslim alınmazsa hakkı sıradaki üyeye geçmeli. Her üye aynı anda en fazla 3 aktif rezervasyon tutabilmeli. Ödünç süresi 14 gün olmalı, gecikmede günde 1 puan ceza kesilmeli ve 30 puanı aşan üyeler yeni rezervasyon yapamamalı. Tüm hareketler saniye çözünürlüklü zaman damgasıyla denetim izine yazılmalı.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 4 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      { type: 'TRACE_REQ_TASK_COVERED' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: 48-hour pickup window, 14-day loans, max 3 active, 30-point cap
        constraints: [
          { id: 'C1', terms: ['48'], numeric: { operator: '<=', value: 48 } },
          { id: 'C2', terms: ['14'], numeric: { operator: '==', value: 14 } },
          { id: 'C3', terms: ['3'], numeric: { operator: '<=', value: 3 } },
          { id: 'C4', terms: ['30'], numeric: { operator: '<=', value: 30 } },
        ],
      },
    ],
  },

  // ── Ambiguous: deliberately under-specified; must block, not guess ────
  {
    id: 'ET-13',
    kind: 'ambiguous',
    profile: 'p-mini',
    intent:
      'Küçük dükkânımız için stok takibi yapan bir araç istiyoruz ama henüz hangi veritabanını kullanacağımıza karar vermedik. Ürün adı, barkod ve adet bilgilerini kaydedebilmeli, barkodlar benzersiz olmalı. Raporlama ihtiyacımız olacak ancak ne tür raporlar isteyeceğimizi şimdilik bilmiyoruz. Kullanıcı sayısının 5\'i geçmeyeceğini varsayıyoruz ama bu da kesin değil, ekip büyüyebilir. Aracı tek kişi mi yoksa aynı anda birkaç kişi mi kullanacak belli olmadığı için tasarımı da buna göre açık tutmanızı istiyoruz.',
    must_be_blocked: true,
    assertions: [{ type: 'BLOCKED' }, { type: 'STATE_IS_DRAFT_OR_BLOCKED' }],
  },
  {
    id: 'ET-14',
    kind: 'ambiguous',
    profile: 'p-mini',
    intent:
      'İndirilenler klasörümü düzenleyen bir betik istiyorum. Dosyalar türlerine göre klasörlere ayrılmalı ama hangi türün hangi klasöre gideceği kurallarını ben de tam olarak bilemiyorum. Aynı adlı iki dosya olduğunda ne yapılacağına henüz karar vermedik, üzerine yazma riski kesinlikle olmamalı. Kuralların ileride kolayca değiştirilebilmesini istiyoruz, nasıl bir kural biçimi istediğimizi ise düşünmedik. Betiğin Windows mu Linux mu üzerinde çalışacağı da kesinleşmedi, ikisi de olabilir.',
    must_be_blocked: true,
    assertions: [{ type: 'BLOCKED' }, { type: 'STATE_IS_DRAFT_OR_BLOCKED' }],
  },
  {
    id: 'ET-15',
    kind: 'ambiguous',
    profile: 'p-standard',
    intent:
      'Müşterilerimiz için bir self servis portalı istiyoruz ama kimlik doğrulamayla ilgili beklentimiz henüz netleşmedi. Müşteriler siparişlerini görüntüleyebilmeli ve destek talebi açabilmeli. Oturum açma gerekip gerekmeyeceğine, gerekiyorsa tek faktörlü mü iki faktörlü mü olacağına karar vermedik. İleride kurumsal bir SSO sağlayıcısı entegre edilebilir ama hangi sağlayıcı olacağı belli değil. Verilerin ne kadar süre saklanacağı da belirsiz; hukuk ekibinin süreci netleşmesi gerekiyor.',
    must_be_blocked: true,
    assertions: [{ type: 'BLOCKED' }, { type: 'STATE_IS_DRAFT_OR_BLOCKED' }],
  },
  {
    id: 'ET-16',
    kind: 'ambiguous',
    profile: 'p-standard',
    intent:
      'Eticaret sitemiz için bir sepet servisi düşünüyorum. Sepete ekleme, çıkarma ve miktar güncelleme yapılabilmeli. Trafiğin ne seviyeye çıkacağını henüz ölçmedik; kampanya dönemlerinde 10 katına çıkabiliyor, bazen ise tamamen sakin oluyor. Oturum bilgisinin tarayıcıda mı sunucuda mı tutulacağına karar verilmedi. Ödeme adımı ayrı bir servis olarak kurulacak ancak iki servis arasındaki arayüz henüz tasarlanmadı. Sepetin sekmeler arasında eşzamanlı tutulup tutulmayacağı da pazarlama ekibiyle görüşülüyor, şu an bir kararı yok.',
    must_be_blocked: true,
    assertions: [{ type: 'BLOCKED' }, { type: 'STATE_IS_DRAFT_OR_BLOCKED' }],
  },
  {
    id: 'ET-17',
    kind: 'ambiguous',
    profile: 'p-standard',
    intent:
      'Şirket içinde kullanılacak bir mesajlaşma aracı istiyoruz. Kişisel sohbetlerin yanında proje bazlı kanallar olmalı ve mesajlar aranabilmeli. Mesajların ne kadar süre saklanacağı netleşmedi; hukuk ekibi bazı kayıtların 5 yıl tutulması gerektiğini söylüyor ama hangi kapsamda olduğunu henüz açıklamadı. Arşiv ile canlı sohbet ayrımı yapılıp yapılmayacağı da belli değil. Yöneticilerin çalışan mesajlarını görüp göremeyeceği tartışması sürüyor, kullanıcılar sildikleri mesajları sonradan geri görebilmeli mi sorusu da cevapsız.',
    must_be_blocked: true,
    assertions: [{ type: 'BLOCKED' }, { type: 'STATE_IS_DRAFT_OR_BLOCKED' }],
  },

  // ── Conflicting: two contradictory constraints in one intent ──────────
  {
    id: 'ET-18',
    kind: 'conflicting',
    profile: 'p-mini',
    intent:
      'Kişisel bir not defteri uygulaması istiyorum. Notlar hiçbir zaman kaybolmamalı; kullanıcının sildiği notlar bile geri getirilebilecek şekilde sonsuza dek saklanmalı, bu bizim için kritik bir ürün vaadi. Öte yandan GDPR kapsamında kullanıcı hesabını kapattığında tüm verilerinin kalıcı olarak silinmesini talep edebilmeli ve sistem bu talebi 30 gün içinde eksiksiz yerine getirmek zorunda. Yedekler de dahil hiçbir kopya kalmamalı. Dolayısıyla sistem hem her şeyi ebediyeten saklamalı hem de her şeyi iz bırakmadan silebilmeli.',
    must_be_blocked: true,
    assertions: [{ type: 'BLOCKED' }, { type: 'STATE_IS_DRAFT_OR_BLOCKED' }],
  },
  {
    id: 'ET-19',
    kind: 'conflicting',
    profile: 'p-standard',
    intent:
      'Bir klinik için hasta kayıt sistemi istiyoruz. Tüm tıbbi kayıtlar değiştirilemez olmalı; bir kez yazılan kayıt sonradan düzenlenememeli veya silinememeli, denetim izi için bu şart. Ancak KVKK gereği hastalar sağlık verilerinin düzeltilmesini veya silinmesini talep edebilmeli ve kurum bu talepleri karşılamakla yükümlü. Aynı zamanda raporlama ekibi anonimleştirilmiş veri istiyor ama hangi alanların anonimleştirileceği hastanın onayı olmadan belirlenemiyor. Sistem hem hiçbir kaydın değişmediğine kanıt sunacak hem de silme taleplerini yedekler dahil kalıcı uygulayacak şekilde kurulmalı.',
    must_be_blocked: true,
    assertions: [{ type: 'BLOCKED' }, { type: 'STATE_IS_DRAFT_OR_BLOCKED' }],
  },
  {
    id: 'ET-20',
    kind: 'conflicting',
    profile: 'p-standard',
    intent:
      'Topluluk için bir alıntı paylaşım servisi istiyoruz. Ürün vizyonu gereği tüm uçlar herkese açık olmalı; kullanıcılar kayıt olmadan hem okuma hem yazma yapabilmeli, kayıt duvarı büyümeyi engellediği için kesinlikle istemiyoruz. Güvenlik ekibi ise yazma işlemlerinin yalnızca kimliği doğrulanmış kullanıcılarla sınırlanması gerektiğini, anonim erişimin salt okunur kalması gerektiğini ve bunun pazarlık edilemez bir politika olduğunu söylüyor. Pazarlama tarafı ziyaretçilerin dakikada 1000 okuma yapabilmesini isterken güvenlik tarafı anonim kullanıcıya dakikada 10 isteğin üzerinde izin vermiyor. Servis bu iki tarafın şartlarını aynı anda karşılamak zorunda.',
    must_be_blocked: true,
    assertions: [{ type: 'BLOCKED' }, { type: 'STATE_IS_DRAFT_OR_BLOCKED' }],
  },
];
