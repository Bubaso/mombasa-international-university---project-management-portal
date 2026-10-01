/**
 * The register, out to a phone or a spreadsheet and back (M4-15).
 *
 * Two decisions are on the screen rather than buried in the code, because both
 * are the kind somebody should make knowingly.
 *
 * WHAT LEAVES. The register holds contact facts and the trust's reading of a
 * person — their stance, their influence, our notes. A vCard syncs to a phone
 * and gets forwarded; "stance: opponent, influence 5" reaching the person it
 * describes is a different class of harm from a leaked telephone number. So
 * the vCard carries contact facts only and there is no option to add the rest,
 * while the CSV asks, with the question naming what it is asking about.
 *
 * WHAT COMES IN. Nothing is written until somebody has read what the file is
 * about to do. The preview counts the rows that match somebody already in the
 * register, and the rows that say nothing about influence or interest — those
 * land in the middle of the power/interest grid on a NOT NULL default of 3,
 * which is a position nobody assessed. Forty contacts quietly claiming
 * "influence 3" would redraw the project's map without anybody drawing it.
 */
import React, { useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Info, TriangleAlert, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useCreateStakeholder } from '../../api/stakeholderHooks';
import { parseContacts, toCsv, toVCard } from '../../lib/contacts';
import type { ParsedContacts } from '../../lib/contacts';
import { ActionButton, Pill, WriteError } from '../ui/Controls';
import type { Stakeholder } from '../../types';

function save(text: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export const ContactsExchange: React.FC<{ people: Stakeholder[] }> = ({ people }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const create = useCreateStakeholder();
  const fileInput = useRef<HTMLInputElement>(null);

  const [includeClosed, setIncludeClosed] = useState(false);
  const [includeAssessment, setIncludeAssessment] = useState(false);
  const [parsed, setParsed] = useState<ParsedContacts | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [imported, setImported] = useState<{ added: number; failed: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const withheld = useMemo(
    () =>
      includeClosed
        ? 0
        : people.filter((p) => p.confidentiality !== 'public' && p.confidentiality !== 'internal')
            .length,
    [people, includeClosed],
  );

  const read = async (file: File) => {
    const text = await file.text();
    setParsed(parseContacts(text, people));
    setFileName(file.name);
    setImported(null);
  };

  const apply = async () => {
    if (!parsed) return;
    setBusy(true);
    let added = 0;
    let failed = 0;
    for (const contact of parsed.contacts) {
      try {
        await create.mutateAsync({
          fullName: contact.fullName,
          title: contact.title,
          organizationId: null,
          category: contact.category,
          email: contact.email,
          phone: contact.phone,
          location: contact.location,
          interestTopic: contact.interestTopic,
          // An unexamined relationship is not a neutral one.
          stance: 'unknown',
          influence: 3,
          interest: 3,
          relationshipOwner: null,
          // A contact arriving from a spreadsheet nobody has classified is
          // kept closed rather than open.
          confidentiality: 'confidential',
        });
        added += 1;
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    setImported({ added, failed });
    setParsed(null);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 print:hidden">
      <header className="mb-3 flex items-start gap-2.5">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            {tr ? 'Kütüğü dışa ve içe aktar' : 'Take the register out, or bring contacts in'}
          </h2>
          <p className="max-w-2xl text-[11px] text-slate-500">
            {tr
              ? 'vCard telefon rehberi için, CSV hesap tablosu için. İçe aktarmada hiçbir şey, dosyanın ne yapacağını görmeden yazılmaz.'
              : 'vCard for an address book, CSV for a spreadsheet. On the way in, nothing is written before somebody has seen what the file would do.'}
          </p>
        </div>
      </header>

      {/* --- out --- */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
          <ArrowDownToLine className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
          {tr ? 'Dışa' : 'Out'}
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-700">
            <input
              type="checkbox"
              checked={includeClosed}
              onChange={(e) => setIncludeClosed(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300"
            />
            {tr ? 'Gizli ve kısıtlı kişileri de koy' : 'Include confidential and restricted people'}
          </label>
          <ActionButton
            onClick={() => {
              const result = toVCard(people, { includeClosed });
              save(result.text, `miu-kisiler-${today}.vcf`, 'text/vcard;charset=utf-8');
            }}
            disabled={people.length === 0}
          >
            {tr ? 'vCard indir' : 'Download vCard'}
          </ActionButton>
          <ActionButton
            onClick={() => {
              const result = toCsv(people, { includeClosed, includeAssessment });
              save(result.text, `miu-kisiler-${today}.csv`, 'text/csv;charset=utf-8');
            }}
            disabled={people.length === 0}
          >
            {tr ? 'CSV indir' : 'Download CSV'}
          </ActionButton>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-700">
            <input
              type="checkbox"
              checked={includeAssessment}
              onChange={(e) => setIncludeAssessment(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300"
            />
            {tr
              ? 'CSV’ye değerlendirmeyi de koy (tutum, nüfuz, ilgi, notlar)'
              : 'Put the assessment in the CSV (stance, influence, interest, notes)'}
          </label>
          {withheld > 0 && (
            <Pill className="border-amber-300 bg-amber-50 text-amber-900">
              {tr ? `${withheld} kişi dışarıda` : `${withheld} left out`}
            </Pill>
          )}
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-800">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {tr
            ? 'vCard yalnızca iletişim bilgisi taşır; tutum, nüfuz, ilgi ve notlar portalda kalır — bu bilgiler kişinin kendisi hakkındaki değerlendirmemizdir ve bir telefon rehberine girmez. CSV’ye koymayı seçerseniz o değerlendirme dosyayla birlikte portalın erişim denetiminin dışına çıkar.'
            : 'A vCard carries contact facts only: stance, influence, interest and notes stay in the portal, because they are our reading of that person and an address book is not the place for them. Choosing to put them in the CSV takes them outside the portal’s access control with the file.'}
        </p>
      </div>

      {/* --- in --- */}
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
          <ArrowUpFromLine className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
          {tr ? 'İçe' : 'In'}
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void read(file);
            }}
            className="text-[11px] text-slate-700"
            aria-label={tr ? 'CSV dosyası' : 'CSV file'}
          />
          {fileName && <span className="font-mono text-[11px] text-slate-500">{fileName}</span>}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          {tr
            ? 'Beklenen kolonlar: full_name (zorunlu), title, organization, category, email, phone, whatsapp, location, preferred_language, interest_topic.'
            : 'Expected columns: full_name (required), title, organization, category, email, phone, whatsapp, location, preferred_language, interest_topic.'}
        </p>

        {parsed && (
          <div className="mt-2 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill className="border-sky-300 bg-sky-50 text-sky-900">
                {tr
                  ? `${parsed.contacts.length} kişi okunabildi`
                  : `${parsed.contacts.length} rows read`}
              </Pill>
              {parsed.refused.length > 0 && (
                <Pill className="border-rose-300 bg-rose-50 text-rose-900">
                  {tr
                    ? `${parsed.refused.length} satır reddedildi`
                    : `${parsed.refused.length} refused`}
                </Pill>
              )}
              {parsed.contacts.some((c) => c.matches.length > 0) && (
                <Pill className="border-amber-300 bg-amber-50 text-amber-900">
                  {tr
                    ? `${parsed.contacts.filter((c) => c.matches.length > 0).length} tanesi kütükte zaten var gibi`
                    : `${parsed.contacts.filter((c) => c.matches.length > 0).length} look like somebody already here`}
                </Pill>
              )}
            </div>

            {parsed.ignoredColumns.length > 0 && (
              <p className="text-[11px] text-slate-600">
                {tr ? 'Karşılığı olmayan kolonlar: ' : 'Columns with no field here: '}
                <span className="font-mono">{parsed.ignoredColumns.join(', ')}</span>
              </p>
            )}

            {parsed.contacts.filter((c) => c.takesDefaultGrid).length > 0 && (
              <p className="flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                {tr
                  ? `${parsed.contacts.filter((c) => c.takesDefaultGrid).length} satır nüfuz ve ilgi vermiyor. Kütük bu alanları boş bırakamıyor, varsayılan olarak 3 yazıyor — yani bu kişiler nüfuz/ilgi ızgarasının tam ortasına, kimsenin koymadığı bir yere düşer. Tutumları ise 'bilinmiyor' kalır, 'nötr' değil.`
                  : `${parsed.contacts.filter((c) => c.takesDefaultGrid).length} rows say nothing about influence or interest. The register cannot leave those empty and defaults them to 3, so those people land in the middle of the grid in a position nobody assessed. Their stance stays 'unknown' rather than 'neutral'.`}
              </p>
            )}

            {parsed.refused.length > 0 && (
              <ul className="space-y-0.5">
                {parsed.refused.map((r) => (
                  <li key={r.line} className="text-[11px] text-rose-800">
                    {tr ? `satır ${r.line}: ` : `line ${r.line}: `}
                    {r.reason}
                  </li>
                ))}
              </ul>
            )}

            {parsed.contacts.filter((c) => c.matches.length > 0).length > 0 && (
              <ul className="space-y-0.5">
                {parsed.contacts
                  .filter((c) => c.matches.length > 0)
                  .map((c) => (
                    <li key={c.line} className="text-[11px] text-amber-900">
                      {tr ? `satır ${c.line}: ` : `line ${c.line}: `}
                      <span className="font-semibold">{c.fullName}</span>
                      {tr ? ' — kütükteki ' : ' — matches '}
                      {c.matches.map((m) => `${m.fullName} (${m.on})`).join(', ')}
                      {tr
                        ? ' kaydına benziyor; içe aktarma yine de ikinci bir kayıt açar.'
                        : ' already here; importing will still make a second record.'}
                    </li>
                  ))}
              </ul>
            )}

            {parsed.contacts.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <ActionButton tone="primary" onClick={() => void apply()} disabled={busy}>
                  {tr
                    ? `${parsed.contacts.length} kişiyi kütüğe ekle`
                    : `Add ${parsed.contacts.length} to the register`}
                </ActionButton>
                <button
                  type="button"
                  onClick={() => {
                    setParsed(null);
                    setFileName(null);
                    if (fileInput.current) fileInput.current.value = '';
                  }}
                  className="cursor-pointer text-[11px] text-slate-500 underline"
                >
                  {tr ? 'vazgeç' : 'cancel'}
                </button>
                <span className="text-[11px] text-slate-500">
                  {tr
                    ? 'Gizlilik seviyesi gizli olarak açılır — kimsenin sınıflandırmadığı bir kişi açık tarafta durmaz.'
                    : 'Each is opened as confidential: somebody nobody has classified does not sit on the open side.'}
                </span>
              </div>
            )}
          </div>
        )}

        {imported && (
          <p
            className={`mt-2 rounded px-2 py-1.5 text-[11px] ${
              imported.failed > 0
                ? 'border border-amber-200 bg-amber-50 text-amber-900'
                : 'border border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            {tr
              ? `${imported.added} kişi eklendi` +
                (imported.failed > 0 ? `, ${imported.failed} tanesi reddedildi.` : '.')
              : `${imported.added} added` +
                (imported.failed > 0 ? `, ${imported.failed} refused.` : '.')}
          </p>
        )}

        <WriteError error={create.error} />
      </div>
    </section>
  );
};
