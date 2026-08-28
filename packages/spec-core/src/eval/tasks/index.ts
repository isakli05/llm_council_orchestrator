/**
 * Deterministic eval corpus for the spec-core evidence gate.
 *
 * 20 natural-language intents a spec-producing pipeline must handle:
 * - ET-01..ET-12 `greenfield`: coherent, well-constrained requests that MUST
 *   produce a valid bundle (requirements, acyclic tasks, verification).
 *   ET-01..ET-06 are `p-mini`, ET-07..ET-12 are `p-standard`.
 * - ET-13..ET-17 `ambiguous`: deliberately under-specified requests; the
 *   pipeline must block instead of guessing.
 * - ET-18..ET-20 `conflicting`: single intents carrying two contradictory
 *   constraints; the pipeline must block instead of silently picking one.
 *
 * Corpus provenance (2026-08-28 substitution, owner-directed): ET-01..ET-12
 * are anonymized technical paraphrases of an owner-provided real-world B2B
 * requirements workload — the source's identity (document, company, domain,
 * persons) is withheld at the owner's request and appears nowhere in this
 * repository; only the twelve intents and their constraint declarations
 * below were carried over. ET-13..ET-20 remain the original synthetic
 * blocking tasks (written in Turkish; the greenfield paraphrases are in
 * English). They are the eval set itself — treat every edit as a change of
 * exam questions, not of copy.
 *
 * PROD-003 / RESIDUAL PROD-003: every greenfield task carries ONE
 * CONSTRAINT_TRACE assertion — the concrete constraints its intent names,
 * each predeclared as a machine-checkable grounding requirement
 * (requirement statement -> covering task -> related test -> judgeable
 * verification, plus optional numeric relation retention and a forbidden-
 * invention absence list). This REPLACES the earlier MENTIONS_TERMS
 * term-presence check, which a keyword dump or a glossary echo could satisfy.
 * The corpus test pins that every term literally appears in its own intent,
 * that every declared numeric value appears as a number token in its own
 * intent, that no raw good fixture satisfies any task's constraint set, and
 * that forbidden terms are absent from their own intent (they police
 * INVENTIONS, not intent wording).
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
  /** Natural-language user intent (greenfield: anonymized workload paraphrases; blocked: Turkish). */
  intent: string;
  /** True exactly for kind 'ambiguous' or 'conflicting'. */
  must_be_blocked: boolean;
  /** At least 2 per task; all deterministic over the compiled bundle. */
  assertions: DeterministicAssertion[];
}

export const EVAL_TASKS: EvalTask[] = [
  // ── Greenfield, p-mini: enrollment / pre-order / catalog workloads ─────
  {
    id: 'ET-01',
    kind: 'greenfield',
    profile: 'p-mini',
    // E-01 membership dual path
    intent:
      'The platform shall support two B2B enrollment paths: accounts created manually by an administrator for existing customers, and a self-service application form where a new customer submits company details and an administrator issues an approve or reject decision.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 3 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: dual enrollment — manual administrator accounts + self-service
        // application form with an approve/reject decision
        constraints: [
          { id: 'C1', terms: ['application form'] },
          { id: 'C2', terms: ['administrator'] },
          { id: 'C3', terms: ['approve'] },
          { id: 'C4', terms: ['reject'] },
        ],
      },
    ],
  },
  {
    id: 'ET-02',
    kind: 'greenfield',
    profile: 'p-mini',
    // E-02 pre-order window
    intent:
      'During a seasonal campaign the pre-order system stays open for a fixed window and customers may order any quantity per size, with no forced size assortment.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 3 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: campaign-scoped pre-order window, free quantity per size
        constraints: [
          { id: 'C1', terms: ['campaign'] },
          { id: 'C2', terms: ['pre-order'] },
          { id: 'C3', terms: ['quantity'] },
        ],
        forbidden: ['asorti'], // "no forced size assortment" — an assortment-pack invention is ruled out
      },
    ],
  },
  {
    id: 'ET-03',
    kind: 'greenfield',
    profile: 'p-mini',
    // E-03 product detail screen
    intent:
      'Every model detail screen shall present fabric information, a measurement chart, lining information, and a trim list.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 3 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: detail screen carries fabric / measurement / lining / trim
        constraints: [
          { id: 'C1', terms: ['fabric'] },
          { id: 'C2', terms: ['measurement'] },
          { id: 'C3', terms: ['lining'] },
          { id: 'C4', terms: ['trim'] },
        ],
      },
    ],
  },
  {
    id: 'ET-04',
    kind: 'greenfield',
    profile: 'p-mini',
    // E-04 customization MOQ gate
    intent:
      'The customization module shall unlock only when the customer meets the minimum order quantity of 150 units; below 150 the module stays locked.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 3 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: customization gated on minimum order quantity >= 150
        constraints: [
          { id: 'C1', terms: ['customization'] },
          { id: 'C2', terms: ['minimum'], numeric: { operator: '>=', value: 150 } },
        ],
      },
    ],
  },
  {
    id: 'ET-05',
    kind: 'greenfield',
    profile: 'p-mini',
    // E-05 surcharge path
    intent:
      'A customer requesting a fabric change who cannot meet the minimum fabric quantity may instead place the order with a surcharge.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 3 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: surcharge fallback below the minimum fabric quantity
        constraints: [
          { id: 'C1', terms: ['surcharge'] },
          { id: 'C2', terms: ['fabric'] },
          { id: 'C3', terms: ['minimum'] },
        ],
      },
    ],
  },
  {
    id: 'ET-06',
    kind: 'greenfield',
    profile: 'p-mini',
    // E-06 shared pool
    intent:
      'Customers below the minimum may submit an order to a shared pool visible to other customers; when combined orders from different customers reach 150 units the pool is approved without surcharge, and at campaign end the owner either pays the surcharge or returns to the standard fabric.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 3 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: shared pool approved when combined orders reach >= 150
        constraints: [
          { id: 'C1', terms: ['pool'], numeric: { operator: '>=', value: 150 } },
          { id: 'C2', terms: ['combined'] },
          { id: 'C3', terms: ['surcharge'] },
        ],
      },
    ],
  },

  // ── Greenfield, p-standard: stock / tracking / payment workloads ──────
  {
    id: 'ET-07',
    kind: 'greenfield',
    profile: 'p-standard',
    // E-07 fabric stock option
    intent:
      'When a customer orders 80 units while fabric is supplied in batches of 150, the remaining 70 units of fabric shall be held as customer-named stock usable on a later order of a different model.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 4 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      { type: 'TRACE_REQ_TASK_COVERED' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: leftover batch fabric held as exactly-70-unit customer-named
        // stock for a later order (150 batch - 80 ordered = 70 remaining)
        constraints: [
          { id: 'C1', terms: ['stock'], numeric: { operator: '==', value: 70 } },
          { id: 'C2', terms: ['later'] },
        ],
      },
    ],
  },
  {
    id: 'ET-08',
    kind: 'greenfield',
    profile: 'p-standard',
    // E-08 live fabric tracking
    intent:
      'During the pre-order window a live tracking table shall accumulate ordered quantity per fabric, and a customer may select a popular confirmed fabric to bypass the minimum quantity.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 4 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      { type: 'TRACE_REQ_TASK_COVERED' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: live tracking table per fabric; popular confirmed fabric
        // bypasses the minimum quantity
        constraints: [
          { id: 'C1', terms: ['tracking'] },
          { id: 'C2', terms: ['fabric'] },
          { id: 'C3', terms: ['minimum'] },
        ],
      },
    ],
  },
  {
    id: 'ET-09',
    kind: 'greenfield',
    profile: 'p-standard',
    // E-09 stock orders
    intent:
      'Outside the pre-order window, ready-stock orders shall carry no minimum quantity and offer two assortment packs — one unit per size, or doubled mid sizes — with stock prepared for the most-demanded model-fabric combinations against re-order demand.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 4 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      { type: 'TRACE_REQ_TASK_COVERED' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: ready-stock orders — no minimum, two assortment packs,
        // stock prepared against re-order demand
        constraints: [
          { id: 'C1', terms: ['stock'] },
          { id: 'C2', terms: ['re-order'] },
          { id: 'C3', terms: ['assortment'] },
        ],
      },
    ],
  },
  {
    id: 'ET-10',
    kind: 'greenfield',
    profile: 'p-standard',
    // E-10 production tracking
    intent:
      'The customer panel shall show each order live through the stages fabric procurement, cutting, sewing, quality control, packaging, and shipping.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 4 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      { type: 'TRACE_REQ_TASK_COVERED' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: live order stages through cutting / quality control / shipping
        constraints: [
          { id: 'C1', terms: ['cutting'] },
          { id: 'C2', terms: ['quality control'] },
          { id: 'C3', terms: ['shipping'] },
        ],
      },
    ],
  },
  {
    id: 'ET-11',
    kind: 'greenfield',
    profile: 'p-standard',
    // E-11 catalog
    intent:
      "When an order completes, professional product photos shall be published automatically to the customer's catalog page, where the customer can build and download a private catalog.",
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 4 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      { type: 'TRACE_REQ_TASK_COVERED' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: auto-published photos; customer-built downloadable catalog
        constraints: [
          { id: 'C1', terms: ['catalog'] },
          { id: 'C2', terms: ['photos'] },
          { id: 'C3', terms: ['download'] },
        ],
      },
    ],
  },
  {
    id: 'ET-12',
    kind: 'greenfield',
    profile: 'p-standard',
    // E-12 proforma and payment
    intent:
      'On order completion the system shall generate a proforma invoice automatically; production starts only after a 35 percent deposit, shipment requires the remaining 65 percent, the customer pays by bank transfer and uploads the receipt, and all communication runs by email.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 4 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      { type: 'TRACE_REQ_TASK_COVERED' },
      {
        type: 'CONSTRAINT_TRACE',
        // intent: proforma -> 35% deposit gates production, remaining 65%
        // gates shipment, bank-transfer receipt uploaded, email-only contact
        constraints: [
          { id: 'C1', terms: ['proforma'], numeric: { operator: '>=', value: 35 } },
          { id: 'C2', terms: ['receipt'], numeric: { operator: '>=', value: 65 } },
          { id: 'C3', terms: ['email'] },
        ],
        forbidden: ['POS', 'payment gateway'], // bank transfer only — card/POS/processor inventions are ruled out
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
