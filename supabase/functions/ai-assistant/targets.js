/**
 * Bir belgeden hangi kayıtların çıkarılabileceği: tek tanım (M13-14).
 *
 * Bu dosya üç şeyi birden besliyor ve bu kasıtlı:
 *
 *   1. **Modele gönderilen şema.** Modelden serbest metin değil, bu alanların
 *      doldurulmuş hâli isteniyor. "Bu belgede bir yükümlülük var" bir cevap
 *      değildir; "yükümlü MIU, konusu şu, vadesi 30 gün" bir cevaptır.
 *   2. **Onay formu.** Aynı alanlar, aynı sırayla, düzenlenebilir hâlde.
 *   3. **Yazma.** Onaylandığında çağrılacak fonksiyon `src/api/proposals.ts`'de,
 *      aynı anahtarla. Testi ikisini birbirine bağlıyor.
 *
 * Neden tek dosya: alan listesini iki yere yazmak, sapan kopyayı yaratmaktır
 * (CLAUDE.md §4). Model bir alanı doldurur, form onu göstermez, ve teklif
 * sessizce eksilir.
 *
 * `human: true` olan alanı model dolduramaz. Sebebi her seferinde aynı:
 * belgede yazmayan bir şey. Bir mektup "sorumlusu Ahmet" diyebilir ama
 * portaldaki hangi profil olduğunu söyleyemez; onu seçen insandır. Model o
 * alana dokunmaz, form onu zorunlu tutar.
 */

/** @typedef {{name: string, type: 'text'|'longtext'|'date'|'enum'|'boolean'|'number'|'profile'|'stakeholder', required?: boolean, human?: boolean, values?: string[], min?: number, max?: number, about: string, label: {en: string, tr: string}}} Field */

export const PROPOSAL_TARGETS = [
  {
    key: 'obligation',
    table: 'obligations',
    label: { en: 'Obligation', tr: 'Yükümlülük' },
    what:
      'A duty that binds this project or binds somebody towards it: an order of the court, ' +
      'a clause of the trust deed, a condition a regulator set, a promise given in a meeting, ' +
      'a term of a lease or contract. Propose one for each distinct duty the document creates ' +
      'or records. A prohibition is an obligation too.',
    fields: [
      {
        name: 'titleEn',
        type: 'text',
        required: true,
        label: { en: 'What must be done', tr: 'Ne yapılması gerekiyor' },
        about: 'One line, in English, saying what is required. Not a summary of the document.',
      },
      {
        name: 'detailEn',
        type: 'longtext',
        label: { en: 'Detail', tr: 'Ayrıntı' },
        about:
          'The terms, as the document states them. Leave empty rather than paraphrasing loosely.',
      },
      {
        name: 'source',
        type: 'enum',
        required: true,
        values: [
          'lease',
          'court_order',
          'trust_deed',
          'mou',
          'statute',
          'contract',
          'personal_commitment',
        ],
        label: { en: 'Source', tr: 'Kaynak' },
        about: 'What kind of instrument creates it.',
      },
      {
        name: 'obligorName',
        type: 'text',
        required: true,
        label: { en: 'Who owes it', tr: 'Yükümlü' },
        about: 'The party bound, named as the document names them.',
      },
      {
        name: 'beneficiaryName',
        type: 'text',
        label: { en: 'Owed to', tr: 'Lehtar' },
        about: 'The party it is owed to, if the document says.',
      },
      {
        name: 'dueOn',
        type: 'date',
        label: { en: 'Due', tr: 'Vade' },
        about:
          'Only a date the document states, as YYYY-MM-DD. If it says "within 30 days" without ' +
          'a starting date you can read, leave this empty — a computed date nobody wrote is a ' +
          'fabrication.',
      },
      {
        name: 'prohibits',
        type: 'boolean',
        required: true,
        label: { en: 'Forbids rather than requires', tr: 'Yasaklıyor' },
        about: 'True when the duty is to refrain from something.',
      },
    ],
  },

  {
    key: 'chronology',
    table: 'chronology_entries',
    label: { en: 'Chronology entry', tr: 'Kronoloji kaydı' },
    what:
      'An event with a date that belongs on the project time line: a filing, a ruling, a ' +
      'transfer, a resolution, a visit, a payment, a letter sent or received. Propose one per ' +
      'event the document reports, including events in its own history, not only the one it is.',
    fields: [
      {
        name: 'occurredOn',
        type: 'date',
        required: true,
        label: { en: 'Happened on', tr: 'Tarih' },
        about:
          'YYYY-MM-DD. If the document gives only a month or a year, use the first day and say so in precision.',
      },
      {
        name: 'precision',
        type: 'enum',
        required: true,
        values: ['day', 'month', 'year'],
        label: { en: 'How exact the date is', tr: 'Tarihin kesinliği' },
        about: 'How precisely the document dates it. Never claim a day it does not give.',
      },
      {
        name: 'category',
        type: 'enum',
        required: true,
        values: [
          'founding',
          'land',
          'legal',
          'construction',
          'governance',
          'funding',
          'academic',
          'other',
        ],
        label: { en: 'Kind', tr: 'Tür' },
        about: 'Which strand of the project this belongs to.',
      },
      {
        name: 'titleEn',
        type: 'text',
        required: true,
        label: { en: 'What happened', tr: 'Ne oldu' },
        about: 'One line, in English, in the past tense.',
      },
      {
        name: 'detailEn',
        type: 'longtext',
        label: { en: 'Detail', tr: 'Ayrıntı' },
        about: 'What the document adds about it.',
      },
    ],
  },

  {
    key: 'correspondence',
    table: 'correspondence',
    label: { en: 'Correspondence entry', tr: 'Yazışma kaydı' },
    what:
      'The letter register. Propose this when the document IS a letter, a notice or a formal ' +
      'written communication — one entry for the document itself. Also propose one for each ' +
      'other letter it refers to by date and reference, if it names one.',
    fields: [
      {
        name: 'direction',
        type: 'enum',
        required: true,
        values: ['outgoing', 'incoming'],
        label: { en: 'Direction', tr: 'Yön' },
        about: 'Outgoing when this project or its trust sent it; incoming when it was received.',
      },
      {
        name: 'route',
        type: 'enum',
        required: true,
        values: ['letter', 'email', 'hand_delivery', 'courier', 'whatsapp', 'portal'],
        label: { en: 'Route', tr: 'Mecra' },
        about:
          'How it travelled, if the document shows it. Use letter when it is a letter on paper.',
      },
      {
        name: 'subjectEn',
        type: 'text',
        required: true,
        label: { en: 'Subject', tr: 'Konu' },
        about: 'The subject line if there is one, otherwise what it is about in one line.',
      },
      {
        name: 'sentOn',
        type: 'date',
        required: true,
        label: { en: 'Dated', tr: 'Tarihi' },
        about: 'The date on the letter, YYYY-MM-DD.',
      },
      {
        name: 'counterpartyName',
        type: 'text',
        required: true,
        label: { en: 'Counterparty', tr: 'Karşı taraf' },
        about: 'The other side: who it was sent to, or who sent it.',
      },
      {
        name: 'referenceNo',
        type: 'text',
        label: { en: 'Reference', tr: 'Referans no' },
        about: 'The reference the letter carries, if any.',
      },
      {
        name: 'summary',
        type: 'longtext',
        label: { en: 'What it says', tr: 'Ne diyor' },
        about:
          'What the letter actually asks for, offers, refuses or reports — in two or three ' +
          'sentences. Not its form. "A letter with a sender and a subject line" tells a reader ' +
          'nothing they could not see.',
      },
    ],
  },

  {
    key: 'action',
    table: 'action_items',
    label: { en: 'Action', tr: 'Aksiyon' },
    what:
      'Something a person must do, that this document asks for or commits to. Only propose one ' +
      'where the document names a task, not where you think one would be wise. The register ' +
      'requires an owner and a date, and the person approving supplies the owner.',
    fields: [
      {
        name: 'textEn',
        type: 'text',
        required: true,
        label: { en: 'What is to be done', tr: 'Yapılacak iş' },
        about: 'One line, in English, starting with a verb.',
      },
      {
        name: 'dueDate',
        type: 'date',
        required: true,
        human: true,
        label: { en: 'Due', tr: 'Vade' },
        about: 'A date is required by the register. The approver sets it.',
      },
      {
        name: 'priority',
        type: 'enum',
        required: true,
        values: ['low', 'normal', 'high', 'critical'],
        label: { en: 'Priority', tr: 'Öncelik' },
        about: 'How urgent the document makes it sound. Use normal when it says nothing.',
      },
      {
        name: 'ownerProfileId',
        type: 'profile',
        required: true,
        human: true,
        label: { en: 'Owner', tr: 'Sorumlu' },
        about:
          'Who will do it. A document can name a person; it cannot know which portal profile ' +
          'that is, so the approver picks.',
      },
      {
        name: 'ownerHint',
        type: 'text',
        label: { en: 'Named in the document as', tr: 'Belgede geçen adı' },
        about: 'The name the document uses, so the approver can match it. Not stored as the owner.',
      },
    ],
  },

  {
    key: 'risk',
    table: 'risks',
    label: { en: 'Risk', tr: 'Risk' },
    what:
      'A thing that has not happened and would hurt the project if it did, which this document ' +
      'warns of or implies plainly: a deadline that may be missed, a licence that may lapse, a ' +
      'party threatening to act. Not a problem already happening — that is not a risk.',
    fields: [
      {
        name: 'titleEn',
        type: 'text',
        required: true,
        label: { en: 'The risk', tr: 'Risk' },
        about: 'One line, in English, naming what could go wrong.',
      },
      {
        name: 'category',
        type: 'enum',
        required: true,
        values: [
          'legal',
          'political',
          'financial',
          'reputational',
          'site_safety',
          'construction',
          'accreditation',
          'partnership',
          'climate',
        ],
        label: { en: 'Category', tr: 'Kategori' },
        about: 'Which kind.',
      },
      {
        name: 'likelihood',
        type: 'number',
        required: true,
        min: 1,
        max: 5,
        label: { en: 'Likelihood (1-5)', tr: 'Olasılık (1-5)' },
        about: 'Your reading of how likely, 1 to 5. The approver can change it.',
      },
      {
        name: 'impact',
        type: 'number',
        required: true,
        min: 1,
        max: 5,
        label: { en: 'Impact (1-5)', tr: 'Etki (1-5)' },
        about: 'How bad it would be, 1 to 5.',
      },
      {
        name: 'triggerEn',
        type: 'text',
        label: { en: 'Trigger', tr: 'Tetikleyici' },
        about:
          'The observable event that would tell somebody this is happening. A risk without one ' +
          'cannot be checked, and the register marks it.',
      },
    ],
  },
];

export const PROPOSAL_KEYS = PROPOSAL_TARGETS.map((t) => t.key);

export const targetFor = (key) => PROPOSAL_TARGETS.find((t) => t.key === key) ?? null;

/** Modelin dolduracağı alanlar. `human` olanlar onu ilgilendirmiyor. */
export const modelFields = (target) => target.fields.filter((f) => !f.human);

/**
 * Modele gönderilen talimatın hedef kısmı.
 *
 * Alan listesini düzyazıya çevirmek yerine burada üretiliyor, çünkü bir alan
 * eklendiğinde talimatın da onu anlatması gerekiyor ve iki yerde tutulan şey
 * birinde unutulur.
 */
export function targetsBriefing() {
  return PROPOSAL_TARGETS.map((target) => {
    const fields = modelFields(target)
      .map((f) => {
        const kind =
          f.type === 'enum'
            ? `one of: ${f.values.join(', ')}`
            : f.type === 'number'
              ? `a number ${f.min}-${f.max}`
              : f.type;
        return `    - ${f.name} (${kind}${f.required ? ', required' : ''}): ${f.about}`;
      })
      .join('\n');
    return `  ${target.key} — ${target.what}\n${fields}`;
  }).join('\n\n');
}

/**
 * Modelden istenen cevabın şeması.
 *
 * Tek bir `values` nesnesi yerine hedef başına ayrı alanlar kurmak,
 * şemanın hedefe göre değişmesini gerektirirdi; tek çağrıda birden fazla
 * hedef için teklif isteniyor, o yüzden değerler serbest nesne ve
 * doğrulamayı `readProposals` yapıyor. Şema burada yalnızca iskeleti
 * zorunlu kılıyor: hangi kütük, hangi alıntı, neden.
 */
/**
 * Modelden istenen cevabın şeması: ne olduğu, ne dediği, ve teklifler.
 *
 * Değerler tek bir birleşik nesne, çünkü tek çağrıda birden fazla hedef için
 * teklif isteniyor ve şema hedefe göre değişemez. Hangi alanın hangi hedefe
 * ait olduğunu ve değerin okunabilir olup olmadığını `readProposals`
 * doğruluyor.
 */
export function answerSchema() {
  return {
    type: 'object',
    properties: {
      classifiedAs: { type: 'string' },
      why: { type: 'string' },
      aboutEn: { type: 'string' },
      proposals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            register: { type: 'string', enum: PROPOSAL_KEYS },
            why: { type: 'string' },
            quote: { type: 'string' },
            // Ad/değer çiftleri, hedefe göre değişen bir nesne değil.
            //
            // Ölçüm, 2 Ekim 2026: 23 isteğe bağlı alanı olan tek bir
            // `values` nesnesiyle model iki cümlelik bir metne 295.442
            // karakterlik bir cevap üretip `MAX_TOKENS`'a çarptı. Kısıtlı
            // üretim, doldurulacak alan kümesi büyük ve hepsi isteğe bağlı
            // olduğunda dönüyor. Çift listesi tek biçimli ve küçük.
            values: {
              type: 'array',
              items: {
                type: 'object',
                properties: { name: { type: 'string' }, value: { type: 'string' } },
                required: ['name', 'value'],
              },
            },
          },
          required: ['register', 'why', 'quote', 'values'],
        },
      },
    },
    required: ['classifiedAs', 'why', 'aboutEn', 'proposals'],
  };
}
