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
        // Zorunlu DEĞİL, ve bu bir ölçümün sonucu. 2 Ekim 2026, gerçek bir
        // mektup: iki yükümlülük teklifi yalnızca bu alan boş geldiği için
        // düştü. "Yasaklıyor mu?" sorusunun cevabı verilmediğinde hayırdır —
        // bir yükümlülüğün tamamını bu yüzden atmak, cevabı bilinen bir soru
        // uğruna bilinen bir kaydı kaybetmektir. Alan formda görünüyor ve
        // onaylayan çevirebiliyor.
        label: { en: 'Forbids rather than requires', tr: 'Yasaklıyor' },
        about:
          'True when the duty is to refrain from something. Leave it out when the duty is to ' +
          'do something; that is the ordinary case.',
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

  // --- Hukuk -------------------------------------------------------------
  //
  // Üçü de bir davaya aittir ve hangi dava olduğunu model bilemez: belge
  // dosya numarasını yazsa bile portaldaki hangi kayıt olduğunu söyleyemez.
  // Onaylayan seçer.

  {
    key: 'hearing',
    table: 'hearings',
    label: { en: 'Hearing', tr: 'Duruşma' },
    what:
      'A court date: a mention, directions, a hearing, a ruling or a judgment, with the date it ' +
      'is set for. Propose one for each sitting the document fixes or reports.',
    fields: [
      {
        name: 'legalCaseId',
        type: 'legalCase',
        required: true,
        human: true,
        label: { en: 'Case', tr: 'Dava' },
        about: 'Which case. The approver picks it from the register.',
      },
      {
        name: 'scheduledFor',
        type: 'date',
        required: true,
        label: { en: 'Date', tr: 'Tarih' },
        about: 'The date of the sitting, YYYY-MM-DD.',
      },
      {
        name: 'kind',
        type: 'enum',
        required: true,
        values: ['mention', 'directions', 'hearing', 'ruling', 'judgment', 'application'],
        label: { en: 'Kind', tr: 'Tür' },
        about: 'What kind of sitting.',
      },
      {
        name: 'bench',
        type: 'text',
        label: { en: 'Bench', tr: 'Hâkim / heyet' },
        about: 'The judge or bench, if the document names one.',
      },
    ],
  },

  {
    key: 'filing',
    table: 'filings',
    label: { en: 'Filing', tr: 'Layiha' },
    what:
      'A document to be filed in court, or one the text records as filed: a pleading, an ' +
      'affidavit, submissions, an application, an appeal, a notice.',
    fields: [
      {
        name: 'legalCaseId',
        type: 'legalCase',
        required: true,
        human: true,
        label: { en: 'Case', tr: 'Dava' },
        about: 'Which case. The approver picks it.',
      },
      {
        name: 'kind',
        type: 'enum',
        required: true,
        values: [
          'pleading',
          'affidavit',
          'submission',
          'application',
          'appeal',
          'record_of_appeal',
          'notice',
          'other',
        ],
        label: { en: 'Kind', tr: 'Tür' },
        about: 'What kind of filing.',
      },
      {
        name: 'title',
        type: 'text',
        required: true,
        label: { en: 'Title', tr: 'Başlık' },
        about: 'What it is called, in one line.',
      },
      {
        name: 'dueOn',
        type: 'date',
        label: { en: 'Due', tr: 'Vade' },
        about: 'Only a date the document states, YYYY-MM-DD.',
      },
    ],
  },

  {
    key: 'order',
    table: 'legal_orders',
    label: { en: 'Court order', tr: 'Mahkeme kararı' },
    what:
      'An order the court has made, as the document records it. This is the order itself, as a ' +
      'legal record; the duty it creates is a separate obligation proposal.',
    fields: [
      {
        name: 'legalCaseId',
        type: 'legalCase',
        required: true,
        human: true,
        label: { en: 'Case', tr: 'Dava' },
        about: 'Which case. The approver picks it.',
      },
      {
        name: 'madeOn',
        type: 'date',
        required: true,
        label: { en: 'Made on', tr: 'Tarih' },
        about: 'The date the order was made, YYYY-MM-DD.',
      },
      {
        name: 'madeBy',
        type: 'text',
        label: { en: 'Made by', tr: 'Veren' },
        about: 'The judge or court, as named.',
      },
      {
        name: 'referenceNo',
        type: 'text',
        label: { en: 'Reference', tr: 'Referans' },
        about: 'The reference the order carries, if any.',
      },
      {
        name: 'textEn',
        type: 'longtext',
        label: { en: 'What it orders', tr: 'Hükmü' },
        about: 'The operative words, as close to the document as you can.',
      },
    ],
  },

  // --- Toplantı, karar, açık soru ----------------------------------------

  {
    key: 'meeting',
    table: 'meetings',
    label: { en: 'Meeting', tr: 'Toplantı' },
    what:
      'A meeting the document records or convenes: minutes, an invitation, a note of a visit. ' +
      'Propose one when the document is about a meeting that is not yet in the register.',
    fields: [
      {
        name: 'title',
        type: 'text',
        required: true,
        label: { en: 'Title', tr: 'Başlık' },
        about: 'What the meeting was, in one line.',
      },
      {
        name: 'heldAt',
        type: 'date',
        required: true,
        label: { en: 'Held on', tr: 'Tarih' },
        about: 'The date it was or will be held.',
      },
      {
        name: 'kind',
        type: 'enum',
        required: true,
        values: ['internal', 'trustee', 'official', 'partner', 'legal', 'site', 'community'],
        label: { en: 'Kind', tr: 'Tür' },
        about: 'Who it was with.',
      },
      {
        name: 'location',
        type: 'text',
        label: { en: 'Where', tr: 'Yer' },
        about: 'Where it was held, if the document says.',
      },
    ],
  },

  {
    key: 'decision',
    table: 'decisions',
    label: { en: 'Decision', tr: 'Karar' },
    what:
      'A decision taken by a body — the board, the trustees, a committee — as the document ' +
      'records it. Not a plan or an intention: something settled.',
    fields: [
      {
        name: 'textEn',
        type: 'longtext',
        required: true,
        label: { en: 'What was decided', tr: 'Ne karara bağlandı' },
        about: 'The decision itself, as the document words it.',
      },
      {
        name: 'decidedOn',
        type: 'date',
        required: true,
        label: { en: 'Decided on', tr: 'Karar tarihi' },
        about: 'The date, YYYY-MM-DD.',
      },
      {
        name: 'organ',
        type: 'text',
        label: { en: 'Body', tr: 'Organ' },
        about: 'Which body took it, as named.',
      },
      {
        name: 'referenceNo',
        type: 'text',
        label: { en: 'Reference', tr: 'Karar no' },
        about: 'The decision number, if it carries one.',
      },
      {
        name: 'rationaleEn',
        type: 'longtext',
        label: { en: 'Rationale', tr: 'Gerekçe' },
        about: 'Why, if the document gives a reason.',
      },
      {
        name: 'meetingId',
        type: 'meeting',
        human: true,
        label: { en: 'Meeting', tr: 'Toplantı' },
        about: 'The meeting it was taken at, if it is in the register. The approver picks it.',
      },
    ],
  },

  {
    key: 'question',
    table: 'open_questions',
    label: { en: 'Open question', tr: 'Açık soru' },
    what:
      'Something the document leaves unresolved and somebody must answer: a point referred ' +
      'back, a figure not yet agreed, a condition not yet met.',
    fields: [
      {
        name: 'questionEn',
        type: 'longtext',
        required: true,
        label: { en: 'The question', tr: 'Soru' },
        about: 'What is unresolved, as a question.',
      },
      {
        name: 'targetResolutionDate',
        type: 'date',
        label: { en: 'Answer needed by', tr: 'Cevap tarihi' },
        about: 'Only a date the document states.',
      },
      {
        name: 'meetingId',
        type: 'meeting',
        human: true,
        label: { en: 'Meeting', tr: 'Toplantı' },
        about: 'The meeting it came from, if any. The approver picks it.',
      },
    ],
  },

  // --- Paydaş ------------------------------------------------------------

  {
    key: 'stakeholder',
    table: 'stakeholders',
    label: { en: 'Stakeholder', tr: 'Paydaş' },
    what:
      'A person or body that matters to the project and is named in the document: a minister, ' +
      'an official, a contractor, a partner trust, counsel. Propose one only for somebody who ' +
      'acts in the matter, not for every name on a distribution list.',
    fields: [
      {
        name: 'fullName',
        type: 'text',
        required: true,
        label: { en: 'Name', tr: 'Ad' },
        about: 'As the document writes it.',
      },
      {
        name: 'title',
        type: 'text',
        label: { en: 'Title', tr: 'Unvan' },
        about: 'Their office or role, as given.',
      },
      {
        name: 'category',
        type: 'enum',
        required: true,
        values: [
          'government',
          'judiciary',
          'partner_trust',
          'legal',
          'contractor',
          'community',
          'academic',
          'media',
          'donor',
          'internal',
          'other',
        ],
        label: { en: 'Category', tr: 'Kategori' },
        about: 'Which kind.',
      },
      {
        name: 'email',
        type: 'text',
        label: { en: 'Email', tr: 'E-posta' },
        about: 'Only if the document prints one.',
      },
      {
        name: 'phone',
        type: 'text',
        label: { en: 'Phone', tr: 'Telefon' },
        about: 'Only if the document prints one.',
      },
      // Nüfuz ve ilgi bir mektuptan okunamaz, ve tutum kaydedilmemişse
      // `unknown`'dır — `neutral` değil (CLAUDE.md §2). Model bunlara
      // dokunmuyor; sayıları onaylayan verir.
      {
        name: 'influence',
        type: 'number',
        required: true,
        human: true,
        min: 1,
        max: 5,
        label: { en: 'Influence (1-5)', tr: 'Nüfuz (1-5)' },
        about: 'Not readable from one document. The approver sets it.',
      },
      {
        name: 'interest',
        type: 'number',
        required: true,
        human: true,
        min: 1,
        max: 5,
        label: { en: 'Interest (1-5)', tr: 'İlgi (1-5)' },
        about: 'Not readable from one document. The approver sets it.',
      },
    ],
  },

  {
    key: 'interaction',
    table: 'stakeholder_interactions',
    label: { en: 'Contact log entry', tr: 'Temas kaydı' },
    what:
      'A recorded contact with a stakeholder: a meeting, a call, a letter sent or received. ' +
      'Propose one when the document reports somebody speaking to somebody.',
    fields: [
      {
        name: 'stakeholderId',
        type: 'stakeholder',
        required: true,
        human: true,
        label: { en: 'Stakeholder', tr: 'Paydaş' },
        about: 'Who was contacted. The approver picks them from the register.',
      },
      {
        name: 'occurredAt',
        type: 'date',
        required: true,
        label: { en: 'When', tr: 'Tarih' },
        about: 'The date of the contact, YYYY-MM-DD.',
      },
      {
        name: 'channel',
        type: 'enum',
        required: true,
        values: ['in_person', 'phone', 'message', 'email', 'formal_letter', 'other'],
        label: { en: 'Channel', tr: 'Mecra' },
        about: 'How the contact happened.',
      },
      {
        name: 'summary',
        type: 'longtext',
        required: true,
        label: { en: 'What was said', tr: 'Ne konuşuldu' },
        about: 'What passed between them, in two or three sentences.',
      },
      {
        name: 'outcome',
        type: 'text',
        label: { en: 'Outcome', tr: 'Sonuç' },
        about: 'What came of it, if the document says.',
      },
    ],
  },

  // --- Plan, sorun, varsayım ---------------------------------------------

  {
    key: 'milestone',
    table: 'milestones',
    label: { en: 'Milestone', tr: 'Kilometre taşı' },
    what:
      'A dated point the project must reach, which the document sets or reports: a licence, an ' +
      'approval, a handover, an opening.',
    fields: [
      {
        name: 'titleEn',
        type: 'text',
        required: true,
        label: { en: 'What is to be reached', tr: 'Hedef' },
        about: 'One line, in English.',
      },
      {
        name: 'targetOn',
        type: 'date',
        label: { en: 'Target date', tr: 'Hedef tarih' },
        about: 'Only a date the document states.',
      },
      {
        name: 'critical',
        type: 'boolean',
        label: { en: 'On the critical path', tr: 'Kritik yolda' },
        about: 'True only where the document says other work waits on it.',
      },
      {
        name: 'detailEn',
        type: 'longtext',
        label: { en: 'Detail', tr: 'Ayrıntı' },
        about: 'What the document adds.',
      },
    ],
  },

  {
    key: 'issue',
    table: 'issues',
    label: { en: 'Issue', tr: 'Sorun' },
    what:
      'Something that has already gone wrong and is being dealt with. A thing that MIGHT go ' +
      'wrong is a risk, not an issue, and the two are different records.',
    fields: [
      {
        name: 'titleEn',
        type: 'text',
        required: true,
        label: { en: 'The issue', tr: 'Sorun' },
        about: 'What has gone wrong, in one line.',
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
        name: 'severity',
        type: 'number',
        required: true,
        min: 1,
        max: 5,
        label: { en: 'Severity (1-5)', tr: 'Şiddet (1-5)' },
        about: 'How bad it is, 1 to 5, as the document makes it sound.',
      },
    ],
  },

  {
    key: 'assumption',
    table: 'assumptions',
    label: { en: 'Assumption', tr: 'Varsayım' },
    what:
      'Something the document takes for granted and the project depends on: that a permission ' +
      'will be granted, that a party will agree, that a rate will hold. Worth recording because ' +
      'a collapsed assumption opens a risk by itself.',
    fields: [
      {
        name: 'statementEn',
        type: 'longtext',
        required: true,
        label: { en: 'The assumption', tr: 'Varsayım' },
        about: 'Written as a statement that could turn out false.',
      },
      {
        name: 'riskCategory',
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
        label: { en: 'If it fails, the risk is', tr: 'Çökerse riski' },
        about: 'Which kind of risk its failure would be.',
      },
    ],
  },

  // --- Hukukî görüş ve delil ---------------------------------------------

  {
    key: 'legal_opinion',
    table: 'legal_opinions',
    label: { en: 'Legal opinion', tr: 'Hukukî görüş' },
    what:
      'Advice from counsel, as the document records it: a question put to a lawyer and the ' +
      'conclusion they reached. A letter from an advocate advising a course of action is one.',
    fields: [
      {
        name: 'question',
        type: 'longtext',
        required: true,
        label: { en: 'The question put', tr: 'Sorulan soru' },
        about: 'What counsel was asked, as a question.',
      },
      {
        name: 'conclusion',
        type: 'longtext',
        label: { en: 'The conclusion', tr: 'Vardığı sonuç' },
        about: 'What they advised, in their own terms where you can.',
      },
      {
        name: 'givenByName',
        type: 'text',
        label: { en: 'Given by', tr: 'Veren' },
        about: 'The lawyer or firm, as the document names them.',
      },
      {
        name: 'givenOn',
        type: 'date',
        label: { en: 'Dated', tr: 'Tarihi' },
        about: 'Only a date the document states, YYYY-MM-DD.',
      },
      {
        name: 'legalCaseId',
        type: 'legalCase',
        human: true,
        label: { en: 'Case', tr: 'Dava' },
        about: 'The case it concerns, if it concerns one. The approver picks it.',
      },
    ],
  },

  {
    key: 'exhibit',
    table: 'exhibits',
    label: { en: 'Exhibit', tr: 'Delil' },
    what:
      'A document or thing produced as evidence in a case, with the mark it carries. Propose ' +
      'one for each exhibit the text lists or refers to by mark.',
    fields: [
      {
        name: 'legalCaseId',
        type: 'legalCase',
        required: true,
        human: true,
        label: { en: 'Case', tr: 'Dava' },
        about: 'Which case. The approver picks it.',
      },
      {
        name: 'mark',
        type: 'text',
        required: true,
        label: { en: 'Mark', tr: 'İşaret' },
        about: 'The exhibit mark, such as "TAH-1", exactly as written.',
      },
      {
        name: 'description',
        type: 'text',
        required: true,
        label: { en: 'What it is', tr: 'Ne olduğu' },
        about: 'What the exhibit is, in one line.',
      },
      {
        name: 'source',
        type: 'text',
        label: { en: 'Where it came from', tr: 'Kaynağı' },
        about: 'Who produced it or where it was obtained, if said.',
      },
      {
        name: 'relevance',
        type: 'text',
        label: { en: 'Why it matters', tr: 'Neden önemli' },
        about: 'What it is said to prove.',
      },
    ],
  },

  // --- Para ---------------------------------------------------------------

  {
    key: 'transaction',
    table: 'financial_transactions',
    label: { en: 'Financial transaction', tr: 'Malî işlem' },
    what:
      'A payment the document records: an invoice, a receipt, a fee note, a bank advice. One ' +
      'per amount paid or demanded, with who it went to.',
    fields: [
      {
        name: 'referenceNo',
        type: 'text',
        required: true,
        label: { en: 'Reference', tr: 'Referans no' },
        about: 'The invoice or voucher number, as printed.',
      },
      {
        name: 'date',
        type: 'date',
        required: true,
        label: { en: 'Date', tr: 'Tarih' },
        about: 'The date on the document, YYYY-MM-DD.',
      },
      {
        name: 'category',
        type: 'enum',
        required: true,
        values: [
          'civil_construction',
          'architectural_qs',
          'legal_defence',
          'site_security',
          'land_administration',
          'statutory_compliance',
        ],
        label: { en: 'Category', tr: 'Kategori' },
        about: 'What the money was for.',
      },
      {
        name: 'description',
        type: 'text',
        required: true,
        label: { en: 'What for', tr: 'Ne için' },
        about: 'What was paid for, in one line.',
      },
      {
        name: 'payee',
        type: 'text',
        required: true,
        label: { en: 'Paid to', tr: 'Ödenen' },
        about: 'Who received it, as named.',
      },
      {
        name: 'amount',
        type: 'number',
        required: true,
        min: 0,
        max: 1000000000,
        label: { en: 'Amount', tr: 'Tutar' },
        about: 'The figure as printed, in the currency it is printed in. Do not convert it.',
      },
      {
        name: 'currency',
        type: 'enum',
        required: true,
        values: ['KES', 'USD', 'TRY'],
        label: { en: 'Currency', tr: 'Para birimi' },
        about: 'The currency the amount is written in.',
      },
      {
        // Kur belgede yazmaz ve uydurulması, geçmişi sessizce yeniden yazmak
        // olur (M8-03: kur satırın üzerinde durur). Onaylayan girer.
        name: 'fxRateToKes',
        type: 'number',
        required: true,
        human: true,
        min: 0,
        max: 10000,
        label: { en: 'Rate used to KES', tr: 'Kullanılan kur (KES)' },
        about:
          'The rate this amount was converted at. It is not in the document and is never ' +
          'guessed: the approver enters the rate that was actually used.',
      },
    ],
  },

  // --- Saha ---------------------------------------------------------------

  {
    key: 'inspection',
    table: 'site_inspections',
    label: { en: 'Site inspection', tr: 'Saha denetimi' },
    what:
      'A visit to a block that was inspected and reported. Propose one when the document is, ' +
      'or reports, an inspection of construction work.',
    fields: [
      {
        name: 'constructionBlockId',
        type: 'constructionBlock',
        required: true,
        human: true,
        label: { en: 'Block', tr: 'Blok' },
        about: 'Which block was inspected. The approver picks it.',
      },
      {
        name: 'inspectedOn',
        type: 'date',
        required: true,
        label: { en: 'Inspected on', tr: 'Denetim tarihi' },
        about: 'The date of the visit, YYYY-MM-DD.',
      },
      {
        name: 'summaryEn',
        type: 'longtext',
        label: { en: 'What was found', tr: 'Ne bulundu' },
        about: 'What the inspection reports, in two or three sentences.',
      },
    ],
  },

  // --- Tedarik, bütçe, hakediş ------------------------------------------

  {
    key: 'procurement_request',
    table: 'procurement_requests',
    label: { en: 'Procurement request', tr: 'Tedarik talebi' },
    what:
      'A need for somebody to be engaged or something bought, which the document states: ' +
      'counsel to be instructed, a contractor to be appointed, an auditor, a consultant, a ' +
      'supplier. Only where the document asks for it, not where it would be sensible.',
    fields: [
      {
        name: 'kind',
        type: 'enum',
        required: true,
        values: ['legal_counsel', 'contractor', 'auditor', 'consultant', 'supplier', 'other'],
        label: { en: 'What is needed', tr: 'Ne gerekiyor' },
        about: 'Which kind of engagement.',
      },
      {
        name: 'needEn',
        type: 'text',
        required: true,
        label: { en: 'The need', tr: 'İhtiyaç' },
        about: 'What is required, in one line.',
      },
      {
        name: 'justificationEn',
        type: 'longtext',
        required: true,
        label: { en: 'Why', tr: 'Gerekçe' },
        about: 'The reason the document gives. If it gives none, this is not a request yet.',
      },
      {
        name: 'estimatedAmount',
        type: 'number',
        required: true,
        min: 0,
        max: 1000000000,
        label: { en: 'Estimated amount', tr: 'Tahminî tutar' },
        about: 'The figure the document states. Do not estimate one it does not give.',
      },
      {
        name: 'estimatedCurrency',
        type: 'enum',
        required: true,
        values: ['KES', 'USD', 'TRY'],
        label: { en: 'Currency', tr: 'Para birimi' },
        about: 'The currency that figure is written in.',
      },
      {
        name: 'referenceNo',
        type: 'text',
        label: { en: 'Reference', tr: 'Referans' },
        about: 'The reference it carries, if any.',
      },
      {
        name: 'neededBy',
        type: 'date',
        label: { en: 'Needed by', tr: 'Ne zamana kadar' },
        about: 'Only a date the document states, YYYY-MM-DD.',
      },
    ],
  },

  {
    key: 'budget_line',
    table: 'budget_lines',
    label: { en: 'Budget line', tr: 'Bütçe kalemi' },
    what:
      'A sum set aside for something, as a budget or a board paper records it. Not a payment ' +
      'already made — that is a transaction.',
    fields: [
      {
        name: 'budgetCategoryId',
        type: 'budgetCategory',
        required: true,
        human: true,
        label: { en: 'Category', tr: 'Kategori' },
        about: 'Which budget category it belongs under. The approver picks it.',
      },
      {
        name: 'titleEn',
        type: 'text',
        required: true,
        label: { en: 'What it is for', tr: 'Ne için' },
        about: 'What the line covers, in one line.',
      },
      {
        name: 'amount',
        type: 'number',
        required: true,
        min: 0,
        max: 1000000000,
        label: { en: 'Amount', tr: 'Tutar' },
        about: 'The figure as written, in the currency it is written in.',
      },
      {
        name: 'currency',
        type: 'enum',
        required: true,
        values: ['KES', 'USD', 'TRY'],
        label: { en: 'Currency', tr: 'Para birimi' },
        about: 'The currency of that figure.',
      },
      {
        // Aynı kural: kur belgede yazmaz, uydurulmaz (M8-03).
        name: 'fxRateToKes',
        type: 'number',
        required: true,
        human: true,
        min: 0,
        max: 10000,
        label: { en: 'Rate used to KES', tr: 'Kullanılan kur (KES)' },
        about: 'Not in the document and never guessed: the approver enters the rate used.',
      },
    ],
  },

  {
    key: 'valuation',
    table: 'valuations',
    label: { en: 'Valuation', tr: 'Hakediş' },
    what:
      'A measured claim for work done in a period, as a valuation certificate or a QS report ' +
      'states it. The portal requires two separate signatures afterwards; this only records it.',
    fields: [
      {
        name: 'constructionBlockId',
        type: 'constructionBlock',
        required: true,
        human: true,
        label: { en: 'Block', tr: 'Blok' },
        about: 'Which block the work was on. The approver picks it.',
      },
      {
        name: 'periodStart',
        type: 'date',
        required: true,
        label: { en: 'Period from', tr: 'Dönem başı' },
        about: 'The first day of the period valued, YYYY-MM-DD.',
      },
      {
        name: 'periodEnd',
        type: 'date',
        required: true,
        label: { en: 'Period to', tr: 'Dönem sonu' },
        about: 'The last day of the period valued, YYYY-MM-DD.',
      },
      {
        name: 'amount',
        type: 'number',
        required: true,
        min: 0,
        max: 1000000000,
        label: { en: 'Amount', tr: 'Tutar' },
        about: 'The figure claimed, as written.',
      },
      {
        name: 'currency',
        type: 'enum',
        required: true,
        values: ['KES', 'USD', 'TRY'],
        label: { en: 'Currency', tr: 'Para birimi' },
        about: 'The currency of that figure.',
      },
      {
        name: 'summary',
        type: 'longtext',
        label: { en: 'What it covers', tr: 'Neyi kapsıyor' },
        about: 'What work the valuation is for.',
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
