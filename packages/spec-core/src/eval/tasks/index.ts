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
 */

export type EvalTaskId =
  | 'ET-01' | 'ET-02' | 'ET-03' | 'ET-04' | 'ET-05' | 'ET-06' | 'ET-07'
  | 'ET-08' | 'ET-09' | 'ET-10' | 'ET-11' | 'ET-12' | 'ET-13' | 'ET-14'
  | 'ET-15' | 'ET-16' | 'ET-17' | 'ET-18' | 'ET-19' | 'ET-20';

export type EvalTaskKind = 'greenfield' | 'ambiguous' | 'conflicting';

export type EvalTaskProfile = 'p-mini' | 'p-standard';

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
  | { type: 'BLOCKED' };

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
