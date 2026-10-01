/**
 * The governance reference, cited to the trust deed (M10-13).
 *
 * This is the page that gets read out. A registrar asks where the Board's
 * power to appoint comes from and whatever is here is what somebody quotes,
 * which makes it the worst place in the portal to hold a plausible citation
 * nobody has checked.
 *
 * So it shows three things as three different things, and never the same way:
 *
 *   * the deed's own words, which cannot be recorded without the file they
 *     are quoted from;
 *   * somebody's reading of the clause, labelled as a reading — a paraphrase
 *     read out as the deed is how a misquotation gets into a court record;
 *   * whether anybody has opened the file and found the clause where the
 *     citation says it is.
 *
 * And below them, the inverse of a reference page and the reason to have one:
 * the governance rules with no clause behind them. An organ with a recorded
 * quorum and no citation is the sharpest of those, because a quorum gets
 * enforced against a sitting, and "we think it is two thirds" is not a
 * clause.
 */
import React, { useState } from 'react';
import { BookMarked, FileQuestion, Quote, ScrollText, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useAuthority } from '../../api/adminHooks';
import * as governance from '../../api/governanceHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, TextInput, WriteError } from '../ui/Controls';
import { Bilingual } from '../ui/Bilingual';
import type { CharterCitation, UncitedGovernance } from '../../types';

const SUBJECT_WORDS: Record<string, { tr: string; en: string }> = {
  organ: { tr: 'organ', en: 'organ' },
  trustee: { tr: 'mütevelli', en: 'trustee' },
  compliance: { tr: 'mevzuat şartı', en: 'compliance requirement' },
  obligation: { tr: 'yükümlülük', en: 'obligation' },
  programme: { tr: 'program', en: 'programme' },
  rule: { tr: 'kural', en: 'rule' },
};

const acts = (roles: string[] | undefined, ...wanted: string[]) =>
  roles != null && wanted.some((role) => roles.includes(role));

function subjectWords(kind: string, tr: boolean): string {
  return tr ? (SUBJECT_WORDS[kind]?.tr ?? kind) : (SUBJECT_WORDS[kind]?.en ?? kind);
}

/** The uncited rules, worst first: the ones that get enforced. */
function sortUncited(rows: UncitedGovernance[]): UncitedGovernance[] {
  return [...rows].sort((a, b) => Number(b.carriesARule) - Number(a.carriesARule));
}

export const CharterReference: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const { user } = useAuth();
  const authority = useAuthority();
  const canCite = acts(
    authority.data?.roles,
    'admin',
    'project_director',
    'trustee',
    'board_director',
    'legal_counsel',
  );

  const clauses = governance.useCharterClauses();
  const citations = governance.useCharterCitations();
  const uncited = governance.useUncitedGovernance();
  const record = governance.useRecordCharterClause();
  const check = governance.useMarkClauseChecked();
  const withdraw = governance.useWithdrawClauseCheck();

  const [reference, setReference] = useState('');
  const [headingEn, setHeadingEn] = useState('');
  const [summaryEn, setSummaryEn] = useState('');

  const rows = clauses.data ?? [];
  const byClause = new Map<string, CharterCitation[]>();
  for (const citation of citations.data ?? []) {
    const list = byClause.get(citation.clauseId) ?? [];
    list.push(citation);
    byClause.set(citation.clauseId, list);
  }
  const gaps = sortUncited(uncited.data ?? []);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">
              {tr ? 'Vakıf senedi referansı' : 'Trust deed reference'}
            </h2>
            <p className="max-w-3xl text-[11px] leading-relaxed text-slate-500">
              {tr
                ? 'Bu sayfa okunur: bir sicil memuru "bu yetki hangi maddeden geliyor" diye sorduğunda buradaki şey alıntılanır. Bu yüzden senedin kendi sözleri, birinin okuması, ve maddenin dosyada bulunup bulunmadığı üç ayrı şey olarak durur — portal senedi okumuyor, dosya olarak tutuyor.'
                : 'This page gets read out: when a registrar asks which clause a power comes from, what is here is what gets quoted. So the deed’s own words, somebody’s reading of them, and whether the clause has been found in the file are three separate things — the portal does not read the deed, it holds it as a file.'}
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-3 p-4">
        <QueryStatus queries={[clauses, citations, uncited]} />

        {canCite && (
          <form
            className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 sm:grid-cols-3"
            aria-label={tr ? 'Madde kaydet' : 'Record a clause'}
            onSubmit={(event) => {
              event.preventDefault();
              if (reference.trim() === '') return;
              record.mutate(
                {
                  reference: reference.trim(),
                  headingEn: headingEn.trim() === '' ? null : headingEn.trim(),
                  summaryEn: summaryEn.trim() === '' ? null : summaryEn.trim(),
                  documentId: null,
                  quotedText: null,
                  locatedAt: null,
                },
                {
                  onSuccess: () => {
                    setReference('');
                    setHeadingEn('');
                    setSummaryEn('');
                  },
                },
              );
            }}
          >
            <Field label={tr ? 'Madde' : 'Clause'}>
              <TextInput
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Madde 14(a)"
                required
              />
            </Field>
            <Field label={tr ? 'Başlık' : 'Heading'}>
              <TextInput value={headingEn} onChange={(event) => setHeadingEn(event.target.value)} />
            </Field>
            <Field label={tr ? 'Okuma (özet)' : 'Reading (summary)'}>
              <TextInput value={summaryEn} onChange={(event) => setSummaryEn(event.target.value)} />
            </Field>
            <div className="sm:col-span-3">
              <ActionButton type="submit" disabled={record.isPending}>
                {tr ? 'Maddeyi kaydet' : 'Record the clause'}
              </ActionButton>
              <p className="mt-1 text-[11px] text-slate-500">
                {tr
                  ? 'Buraya girilen özet bir okumadır, senedin sözü değil. Senedin kendi sözünü kaydetmek senedin kendisini ister — dosya kasada olmadan alıntı girilemez.'
                  : 'A summary entered here is a reading, not the deed’s words. Recording the deed’s own words requires the deed: no quotation can be entered without the file in the vault.'}
              </p>
              <WriteError error={record.error} />
            </div>
          </form>
        )}

        {rows.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            {tr
              ? 'Kayıtlı madde yok. Bu, yönetişim kurallarının senede dayanmadığı anlamına gelmez — hangi maddeye dayandığının hiç yazılmadığı anlamına gelir.'
              : 'No clause is recorded. That does not mean the governance rules have no basis in the deed — it means nobody has written down which clause each rests on.'}
          </p>
        ) : (
          <ul className="space-y-2" aria-label={tr ? 'Senet maddeleri' : 'Deed clauses'}>
            {rows.map((clause) => {
              const cited = byClause.get(clause.clauseId) ?? [];
              return (
                <li
                  key={clause.clauseId}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <BookMarked
                      className="h-3.5 w-3.5 shrink-0 text-indigo-600"
                      aria-hidden="true"
                    />
                    <span className="font-mono text-xs font-semibold text-slate-900">
                      {clause.reference}
                    </span>
                    {(clause.headingEn != null || clause.headingTr != null) && (
                      <span className="text-xs text-slate-700">
                        <Bilingual
                          table="charter_clauses"
                          id={clause.clauseId}
                          base="heading"
                          en={clause.headingEn}
                          tr={clause.headingTr}
                        />
                      </span>
                    )}
                    {clause.checkedAgainstTheDeed ? (
                      <Pill className="border-emerald-200 bg-emerald-50 text-emerald-800">
                        <ShieldCheck className="mr-1 inline h-3 w-3" aria-hidden="true" />
                        {tr ? 'senette bulundu' : 'found in the deed'}
                      </Pill>
                    ) : (
                      <Pill className="border-amber-200 bg-amber-50 text-amber-900">
                        {tr ? 'senetle karşılaştırılmadı' : 'not checked against the deed'}
                      </Pill>
                    )}
                    {clause.deedNotAttached && (
                      <Pill className="border-amber-200 bg-amber-50 text-amber-900">
                        {tr ? 'senet ekli değil' : 'the deed is not attached'}
                      </Pill>
                    )}
                    {canCite &&
                      !clause.deedNotAttached &&
                      (clause.checkedAgainstTheDeed ? (
                        <ActionButton
                          onClick={() => withdraw.mutate(clause.clauseId)}
                          disabled={withdraw.isPending}
                        >
                          {tr ? 'bulamadım, işareti kaldır' : 'could not find it — withdraw'}
                        </ActionButton>
                      ) : (
                        user != null && (
                          <ActionButton
                            onClick={() =>
                              check.mutate({ id: clause.clauseId, profileId: user.id })
                            }
                            disabled={check.isPending}
                          >
                            {tr ? 'senette buldum' : 'found it in the deed'}
                          </ActionButton>
                        )
                      ))}
                  </div>

                  {/* The deed's words, marked as a quotation. */}
                  {clause.quotedText != null ? (
                    <p className="mt-1 flex items-start gap-1.5 border-l-2 border-indigo-300 pl-2 text-[11px] leading-relaxed text-slate-800">
                      <Quote
                        className="mt-0.5 h-3 w-3 shrink-0 text-indigo-500"
                        aria-hidden="true"
                      />
                      <span>
                        {clause.quotedText}
                        <span className="ml-1 text-slate-500">
                          {tr ? '— senedin sözü' : '— the deed’s words'}
                          {clause.locatedAt != null && ` · ${clause.locatedAt}`}
                        </span>
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {tr
                        ? 'Senedin kendi sözü kayıtlı değil.'
                        : 'The deed’s own words are not recorded.'}
                    </p>
                  )}

                  {/* Somebody's reading, labelled as one. */}
                  {(clause.summaryEn != null || clause.summaryTr != null) && (
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      <span className="font-medium">
                        {tr ? 'Birinin okuması: ' : "Somebody's reading: "}
                      </span>
                      <Bilingual
                        table="charter_clauses"
                        id={clause.clauseId}
                        base="summary"
                        en={clause.summaryEn}
                        tr={clause.summaryTr}
                      />
                    </p>
                  )}

                  {cited.length > 0 ? (
                    <p className="mt-1 text-[11px] text-slate-600">
                      {tr ? 'Dayandırılan: ' : 'Cited for: '}
                      {cited
                        .map(
                          (citation) =>
                            `${citation.subjectLabel ?? '—'} (${subjectWords(citation.subjectKind, tr)})`,
                        )
                        .join(' · ')}
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {tr
                        ? 'Bu maddeye hiçbir şey dayandırılmamış.'
                        : 'Nothing is cited to this clause.'}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* The inverse, and the reason to have the page. */}
        <div className="border-t border-slate-200 pt-2">
          <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
            {tr ? 'Senede dayandırılmamış kurallar' : 'Rules with no clause behind them'}
          </p>
          {gaps.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              {tr
                ? 'Her yönetişim kaydının arkasında bir madde var.'
                : 'Every governance record has a clause behind it.'}
            </p>
          ) : (
            <ul
              className="space-y-1"
              aria-label={
                tr ? 'Senede dayandırılmamış kurallar' : 'Rules with no clause behind them'
              }
            >
              {gaps.map((gap) => (
                <li
                  key={`${gap.subjectKind}-${gap.subjectId}`}
                  className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                    gap.carriesARule
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                >
                  <FileQuestion className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="font-medium">{gap.subjectLabel}</span>
                  <span>({subjectWords(gap.subjectKind, tr)})</span>
                  {gap.carriesARule && (
                    <span className="font-medium">
                      {tr
                        ? '· kayıtlı bir kural taşıyor, ve bu kural birine karşı uygulanacak'
                        : '· carries a recorded rule, and that rule will be enforced against somebody'}
                    </span>
                  )}
                  {gap.typedClauseIsNotInTheRegister && (
                    <span>
                      {tr
                        ? `· "${gap.clauseTypedInFreeText}" yazılmış ama bu madde kütükte yok`
                        : `· "${gap.clauseTypedInFreeText}" is typed on it, but no such clause is in the register`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};
