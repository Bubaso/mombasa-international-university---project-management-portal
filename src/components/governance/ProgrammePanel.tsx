/**
 * What the university intends to teach (M10-08).
 *
 * The requirement's sharpest line is about this: "Akademik hazırlık bugün
 * portalda hiç yok. Oysa projenin amacı bir üniversite; inşaat sadece aracı."
 * A portal that tracks the scaffolding in detail and has no idea what degrees
 * the institution means to offer is tracking the means and not the end.
 *
 * The staffing column is where the null matters. A programme whose academic
 * staff requirement nobody has established does not have a gap of zero; it
 * has an unknown gap, and that is a worse position to be in than a known
 * shortfall because nobody is recruiting against it.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpenCheck, CircleHelp, FileCheck2, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useProgrammes } from '../../api/governanceHooks';
import { QueryStatus } from '../QueryStatus';
import { Pill, TableFrame, Td, Th } from '../ui/Controls';
import { programmeLabel } from '../../lib/governance';

export const ProgrammePanel: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const navigate = useNavigate();
  const programmes = useProgrammes();
  const rows = programmes.data ?? [];

  const unknownStaffing = rows.filter(
    (p) => p.staffGap == null && p.state !== 'withdrawn' && p.state !== 'deferred',
  ).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr ? 'Akademik program kütüğü' : 'Academic programmes'}
            </h2>
            <p className="text-xs text-slate-500">
              {tr
                ? 'Projenin amacı bir üniversite; inşaat aracı. Onaylı bir programın müfredatı kasada olmak zorunda.'
                : 'The point of the project is a university; the construction is the means. An approved programme must have its curriculum in the vault.'}
            </p>
          </div>
        </div>
        {unknownStaffing > 0 && (
          <Pill className="border-amber-300 bg-amber-50 text-amber-900">
            {tr
              ? `${unknownStaffing} programda kadro gereksinimi belirlenmemiş`
              : `${unknownStaffing} with no staffing requirement set`}
          </Pill>
        )}
      </header>

      <QueryStatus queries={[programmes]} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {tr
            ? 'Kütükte hiç program yok. Bir üniversite projesinde en çok eksikliği hissedilen kayıt bu: hangi dereceyi vereceği yazılmadan akreditasyon da kadro da hesaplanamaz.'
            : 'No programme is on the register. For a university project this is the omission that matters most: until the degrees are written down, neither accreditation nor staffing can be reckoned.'}
        </p>
      ) : (
        <TableFrame
          head={
            <tr>
              <Th>{tr ? 'Program' : 'Programme'}</Th>
              <Th>{tr ? 'Derece' : 'Degree'}</Th>
              <Th>{tr ? 'Durum' : 'State'}</Th>
              <Th className="text-right">{tr ? 'Kadro' : 'Staff'}</Th>
              <Th>{tr ? 'Müfredat' : 'Curriculum'}</Th>
              <Th className="text-right">{tr ? 'Hedef alım' : 'Target intake'}</Th>
            </tr>
          }
        >
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <Td>
                <span className="text-sm font-medium text-slate-900">
                  {(tr ? p.nameTr : p.nameEn) ?? p.nameEn}
                </span>
                {p.faculty && <span className="block text-xs text-slate-500">{p.faculty}</span>}
              </Td>
              <Td>
                <span className="font-mono text-xs text-slate-600">{p.degree}</span>
              </Td>
              <Td>
                <Pill>{programmeLabel(p.state, language)}</Pill>
              </Td>
              <Td className="text-right">
                {p.requiredAcademicStaff == null ? (
                  <span className="flex items-center justify-end gap-1 text-xs text-amber-800">
                    <CircleHelp className="h-3 w-3" aria-hidden="true" />
                    {tr ? 'belirlenmemiş' : 'not established'}
                  </span>
                ) : (
                  <span className="font-mono text-xs text-slate-700">
                    <Users className="mr-1 inline h-3 w-3 text-slate-500" aria-hidden="true" />
                    {p.appointedAcademicStaff}/{p.requiredAcademicStaff}
                    {p.staffGap != null && p.staffGap > 0 && (
                      <span className="ml-1 font-semibold text-amber-800">−{p.staffGap}</span>
                    )}
                  </span>
                )}
              </Td>
              <Td>
                {p.curriculumDocumentId ? (
                  <button
                    type="button"
                    onClick={() => navigate('/documents')}
                    className="flex cursor-pointer items-center gap-1 text-xs text-indigo-700 hover:underline"
                  >
                    <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {tr ? 'kasada' : 'in the vault'}
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">{tr ? 'yok' : 'none'}</span>
                )}
              </Td>
              <Td className="text-right">
                <span className="font-mono text-xs text-slate-600">
                  {p.targetIntakeYear ?? (tr ? '—' : '—')}
                </span>
              </Td>
            </tr>
          ))}
        </TableFrame>
      )}
    </section>
  );
};
