/**
 * Bir kütük kaydının işi bitti mi?
 *
 * Asistan sayfası yeniden kurulduğunda ortaya çıkan ders şuydu: bir ekran, işi
 * bitmiş olanı bekleyenle aynı ağırlıkta gösterdiği sürece boşalmıyor. Aynı
 * soru on iki kütükte de geçerli, ve cevabı on iki yere yazmak o listeyi
 * birinde eskitir (CLAUDE.md §4). Hüküm burada, bir kez.
 *
 * Hüküm **enum başına** veriliyor, tablo başına değil: aynı enum'u üç tablo
 * kullanıyorsa (`work_state` üçünde) hangi değerin son olduğu üçünde de aynı
 * şeydir. Şema enum'un değerlerini biliyor, hangisinin son olduğunu bilmiyor —
 * o bir alan hükmü ve gerekçesiyle yazılmak zorunda.
 *
 * Her girdi enum'un **bütün** değerlerini ikiye bölüyor, ve
 * `tests/register-states.mjs` bunu şemaya karşı sınıyor: enum yeni bir değer
 * kazandığında, o değerin son olup olmadığına karar verilmeden test geçmiyor.
 * Enum sapmasında işe yarayan desenin aynısı.
 *
 * **Bazı enum'larda hiçbir değer son değil, ve bu boşluk kasıtlı.** Bir
 * tutum (`stance`) bir iş değil; bir duruşmanın hazırlık durumu duruşmayı
 * bitirmiyor; kırılmış bir varsayım bitmiş değil, en acil olandır. Oraya zorla
 * bir "bitmiş" değeri yazmak, olmayan bir bitişi icat etmek olurdu.
 */

export interface RegisterStateRule {
  /** Hâlâ birinin ilgisini isteyen değerler. */
  open: string[];
  /** İşi bitmiş olanlar: ekranda geri çekilebilirler. */
  settled: string[];
  /** Neden böyle bölündüğü. */
  why: string;
  /**
   * Bitmiş hâli var, ama ekranda geri çekilmiyor — ve bunun gerekçesi.
   *
   * Her liste bir iş kuyruğu değil. Bir karşılaştırma tablosunda elenen aday,
   * tablonun içeriğidir: neden seçilmediği kaybolan şeydi ve onu kapalı bir
   * bölüme koymak, tabloyu var eden şeyi geri çekmek olurdu. Bir ödeme
   * planında ödenmiş kalem, planın aritmetiğinin parçası.
   *
   * Bu alan dolduğunda `tests/register-states.mjs` o ekranda bölme aramıyor;
   * boş olup da bölünmemiş bir ekran ise teste yakalanıyor. Yani "bakıldı,
   * bölmek yanlış olurdu" ile "kimse bakmamış" ayrı kalıyor.
   */
  keepOnScreen?: string;
}

export const REGISTER_STATES: Record<string, RegisterStateRule> = {
  accreditation_state: {
    open: ['not_started', 'in_progress', 'evidence_submitted'],
    settled: ['met', 'not_applicable'],
    why: 'Kanıt gönderilmiş olmak karşılanmış olmak değil; kurum cevap verene kadar iş sürüyor. "Uygulanmaz" bir karardır ve o karardan sonra yapılacak bir şey yok.',
  },
  action_status: {
    open: ['open', 'in_progress', 'blocked'],
    settled: ['done', 'cancelled'],
    why: 'Tıkanmış bir aksiyon bitmiş değil, en çok ilgi isteyen hâlidir.',
  },
  assumption_state: {
    open: ['unverified', 'holding', 'shaky', 'broken'],
    settled: [],
    why: 'Bir varsayımın bitmiş hâli yok. Kırılmış bir varsayım tamamlanmış bir iş değil; planın dayandığı şeyin çöktüğü andır ve en acil olanıdır.',
  },
  boq_state: {
    open: ['draft', 'issued'],
    settled: ['superseded'],
    why: 'Yürürlükteki metraj `issued`; yerine yenisi geçmiş olan artık kimseden bir şey istemiyor.',
  },
  candidate_outcome: {
    open: ['under_review', 'shortlisted'],
    settled: ['selected', 'rejected', 'withdrawn'],
    why: 'Kısa listeye girmek bir karar değil, bir sonraki karara kalmaktır.',
    keepOnScreen:
      'Aday listesi bir iş kuyruğu değil, bir karşılaştırma. M14-02 bu kütüğü tam olarak kaybolan şey için istiyor: dört avukattan birinin neden seçildiği, yani diğer üçünün neden seçilmediği. Elenen adayı kapalı bir bölüme koymak, karşılaştırmayı var eden kaydı geri çekmek olurdu. Bir talepteki aday sayısı da zaten birikmiyor.',
  },
  candidate_state: {
    open: ['pending'],
    settled: ['adopted', 'dismissed'],
    why: 'Aksiyon adayı ya kütüğe alınır ya elenir; ikisi de karardır ve karardan sonra kuyrukta işi yoktur.',
  },
  contract_state: {
    open: ['draft', 'signed', 'active', 'suspended'],
    settled: ['expired', 'terminated'],
    why: 'Askıya alınmış sözleşme hâlâ canlı: askı kalkabilir ve yükümlülükler duruyor.',
  },
  counsel_state: {
    open: ['proposed', 'instructed', 'on_record'],
    settled: ['withdrawn'],
    why: 'Vekâlet dosyada olduğu sürece canlıdır; `on_record` bir bitiş değil, görevin kendisidir.',
  },
  decision_status: {
    open: ['in_force', 'suspended'],
    settled: ['implemented', 'rescinded'],
    why: 'Yürürlükte olan bir karar hâlâ birinin yapacağı bir şey demektir. Askıya alınmış olan da canlı: askı kalkabilir.',
  },
  donation_state: {
    open: ['pledged', 'partly_received'],
    settled: ['received', 'lapsed'],
    why: 'Kısmen alınmış bağış takip gerektirir; tamamen alınmış ya da düşmüş olan gerektirmez.',
  },
  filing_state: {
    open: ['planned', 'drafting', 'filed', 'late'],
    settled: ['served', 'withdrawn'],
    why: 'Sunulmuş layiha henüz tebliğ edilmemiştir ve tebliğ bir iştir. Geciken, bitmiş olanın tersi: en acil olan.',
  },
  implementation_state: {
    open: ['no_actions_recorded', 'outstanding'],
    settled: ['implemented', 'abandoned', 'rescinded'],
    why: '"Aksiyona bağlanmamış" bitmiş değil: kararın ne yapılarak yerine getirileceğini henüz kimse söylememiş, ve bu başlı başına bir iş.',
  },
  intake_state: {
    open: ['analysing', 'ready', 'failed'],
    settled: [],
    why: 'Bir okumanın bitmişliği bu sütunda değil: `ready` olmak tekliflerin karara bağlandığı anlamına gelmiyor. Alımın bitmişliğini `intake_queue.disposition` söylüyor (0050, 0051).',
  },
  issue_state: {
    open: ['open', 'in_progress'],
    settled: ['resolved', 'closed'],
    why: 'Çözülmüş bir sorun kapatılmayı bekleyebilir ama kimseden iş istemiyor.',
  },
  meeting_status: {
    open: ['planned', 'in_progress'],
    settled: ['completed', 'cancelled'],
    why: 'Yapılmış toplantının aksiyonları kendi kütüğünde duruyor; toplantının kendisi bitmiştir.',
  },
  milestone_progress: {
    open: ['planned', 'in_progress', 'missed'],
    settled: ['achieved', 'abandoned'],
    why: 'Kaçırılmış kilometre taşı tarihçe değil, iştir: ya yeni bir tarih ya bir karar ister.',
  },
  milestone_state: {
    open: ['planned', 'due', 'certified'],
    settled: ['paid', 'cancelled'],
    why: 'Onaylanmış hakediş ödenmeyi bekliyor ve bekleme bir iştir.',
    keepOnScreen:
      'Sözleşmenin ödeme planı bir kuyruk değil, bir aritmetik: sıra numarası, tutar ve altındaki "planlanan / ödenen" toplamı birlikte okunuyor. Ödenmiş kalemi geri çekmek, toplamı açıklayan satırları gizlemek olurdu. Plan sözleşme imzalanırken yazılıyor ve sonra büyümüyor.',
  },
  obligation_state: {
    open: ['open', 'in_progress', 'at_risk', 'breached', 'suspended'],
    settled: ['fulfilled'],
    why: 'İhlal edilmiş yükümlülük bitmiş değil, kütükteki en acil şeydir. Mahkeme saati durdurduysa (`suspended`) yükümlülük hâlâ duruyor.',
  },
  order_state: {
    open: ['in_force', 'varied', 'appealed'],
    settled: ['discharged', 'spent'],
    why: 'Değiştirilmiş karar hâlâ yürürlükte, değişmiş hâliyle. Temyizdeki karar da canlı.',
  },
  period_state: {
    open: ['open'],
    settled: ['closed'],
    why: 'Kapanmış malî dönem değiştirilemez; açık dönem her gün yeni kayıt alıyor.',
  },
  preparation_state: {
    open: ['not_started', 'in_preparation', 'ready', 'missed'],
    settled: [],
    why: 'Hazırlığın bitmesi duruşmanın bitmesi değil. Bir duruşmanın bitmişliği tarihinin geçmesi ve sonucunun kaydedilmesidir; bu sütun yalnız hazırlığı anlatıyor.',
  },
  procurement_state: {
    open: ['drafted', 'approved', 'candidates_invited'],
    settled: ['awarded', 'cancelled'],
    why: 'İhale edilmiş talebin işi sözleşmeye geçti; talebin kendisi bitti.',
  },
  programme_state: {
    open: ['proposed', 'curriculum_drafted', 'submitted_to_cue', 'deferred'],
    settled: ['approved', 'withdrawn'],
    why: 'Ertelenmiş program bitmiş değil: "sonra dönülecek" demek, dönülmesi gereken bir şey olduğu anlamına gelir.',
    keepOnScreen:
      'Program kütüğü bir iş kuyruğu değil, üniversitenin ne vereceğinin listesi: ad, derece, kadro, müfredat, hedef alım bir arada okunuyor. Onaylanmış program bu tablonun en önemli satırı — kapanmış bir iş değil, projenin amacının kendisi (M10-08). Kadro aritmetiği de bütün kütükten hesaplanıyor.',
  },
  proposal_state: {
    open: ['proposed'],
    settled: ['applied', 'declined'],
    why: 'Uygulanmış teklif kaydını açtı; reddedilen artık satır olarak durmuyor (0050) ve değer tamlık için burada.',
  },
  question_status: {
    open: ['open', 'escalated'],
    settled: ['answered', 'dropped'],
    why: 'Yukarı taşınmış soru bitmiş değil, daha yüksek sesle açık.',
  },
  report_state: {
    open: ['draft', 'approved'],
    settled: ['published', 'withdrawn'],
    why: 'Onaylanmış ama yayımlanmamış rapor yayımlanmayı bekliyor.',
    keepOnScreen:
      'Rapor listesi bir kuyruk değil, arşivin seçicisi: soldaki listeden bir derleme seçilip sağda okunuyor. Yayımlanmış rapor, insanın okumaya geldiği şeydir — onu kapalı bir bölüme koymak, bitmiş işi geri çekmek değil, ekranın amacını geri çekmek olurdu. Bu kütüğün asıl sorusu hacim ve o ikinci dalgada (büyüyen kütükler) sorulacak.',
  },
  risk_state: {
    open: ['open', 'mitigating', 'materialised'],
    settled: ['closed'],
    why: 'Gerçekleşmiş risk bitmiş değil: artık yönetilecek bir sorundur ve ilgiyi en çok o ister.',
  },
  scenario_state: {
    open: ['considered'],
    settled: ['retired'],
    why: 'Rafa kaldırılmış senaryo bir daha hesaba girmiyor.',
  },
  stage_state: {
    open: ['not_started', 'in_progress', 'blocked'],
    settled: ['done', 'abandoned'],
    why: 'Tıkanmış aşama bitmiş değil; tıkanmanın kendisi iştir.',
    keepOnScreen:
      'Yol haritası bir kuyruk değil, bir güzergâh: aşamalar sıralı, aralarında ok var ve her biri kendinden öncekine bakıyor (M10-07). Bitmiş aşamayı geri çekmek, zincirin yarısını görünmez kılar — "önceki bitmedi" diyen bir satırın öncesi ekranda olmaz, oklar yanlış şeyleri birleştirir. Güzergâhın geçilmiş kısmı, nerede olunduğunu söyleyen şeydir.',
  },
  stance: {
    open: ['champion', 'supporter', 'neutral', 'sceptic', 'opponent', 'unknown'],
    settled: [],
    why: 'Tutum bir iş değil, bir konum. "Karşıt" bitmiş bir şey değil; `unknown` ise kaydedilmemiş bir tutumdur ve ikisi de geri çekilemez.',
  },
  valuation_state: {
    open: ['draft', 'qs_certified', 'director_approved'],
    settled: ['paid', 'rejected'],
    why: 'Direktör onayı ödeme değil: onaylanmış hakediş ödenmeyi bekliyor.',
  },
  voucher_state: {
    open: ['requested', 'approved'],
    settled: ['paid', 'rejected', 'withdrawn'],
    why: 'Onaylanmış fiş ödenmeyi bekliyor ve bekleyen ödeme kütüğün asıl işi.',
  },
  work_state: {
    open: ['planned', 'in_progress', 'blocked', 'legally_suspended', 'emergency_preservation'],
    settled: ['completed'],
    why: 'Hukukî olarak durdurulmuş ya da acil koruma altındaki iş bitmiş değil: durma hâli, ilgilenilmesi gereken hâldir.',
  },
};

/** Bu değer, kaydın işinin bittiğini söylüyor mu? */
export function isSettled(enumName: string, value: string | null): boolean {
  if (value === null) return false;
  const rule = REGISTER_STATES[enumName];
  // Paketin tanımadığı bir enum ya da değer, bitmiş sayılmıyor. Tanımadığı bir
  // şeyi geri çekmek, görünmesi gereken bir satırı gizlemek olurdu; fazladan
  // görünen satır görülür ve karar alır.
  return rule ? rule.settled.includes(value) : false;
}

/**
 * Bekleyen ve bitmiş olarak ayır.
 *
 * Sıra korunuyor: çağıran yer kendi sıralamasını veriyor ve bu fonksiyon onu
 * bozmuyor.
 */
export function splitBySettled<T>(
  rows: readonly T[],
  enumName: string,
  stateOf: (row: T) => string | null,
): { open: T[]; settled: T[] } {
  const open: T[] = [];
  const settled: T[] = [];
  for (const row of rows) (isSettled(enumName, stateOf(row)) ? settled : open).push(row);
  return { open, settled };
}
