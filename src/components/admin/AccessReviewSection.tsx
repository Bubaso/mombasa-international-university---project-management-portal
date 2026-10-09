import React, { useState } from 'react';
import { UserCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import * as access from '../../api/adminHooks';
import { QueryStatus } from '../QueryStatus';
import { EmptyState } from '../EmptyState';
import {
  ActionButton,
  Field,
  Pill,
  Section,
  Select,
  TableFrame,
  Td,
  TextInput,
  Th,
  WriteError,
} from '../ui/Controls';
import { roleLabel } from '../../lib/roles';
import { formatDate } from '../../lib/site';
import type { AccessDecision, AccessReviewRow } from '../../types';

/**
 * Erişim gözden geçirme (M1-11).
 *
 * Portalda erişimin **verilmesi** kayıtlı (davet, devir) ve **süresi** kayıtlı
 * (M1-09). Kayıtlı olmayan tek şey birinin dönüp bakmış olmasıydı: süresiz bir
 * danışman hesabı kapanana kadar açık kalır ve kimse onu kapatmaya memur
 * değildir, çünkü bakması gereken bir liste yok.
 *
 * Bu panel o listeyi gösteriyor ve kararı kaydediyor — kararı **uygulamıyor**.
 * Uygulayan ekranlar bu konsolda zaten var (kişiler, kapsam, paylaşım), ve
 * ikisini birleştirmek "kaldırıldı" kaydının hesabın kapandığını ima etmesine
 * yol açardı. Ayrı durdukları için kuyruk ikisinin uyuşmadığı hâli
 * gösterebiliyor: aşağıdaki "karar uygulanmamış" bloğu tam o.
 *
 * `lastActionAt` son giriş DEĞİL ve ekran bunu söylüyor. Göç 0055 niçin
 * olmadığını anlatıyor: `auth.users` istemciye kapalı, ve Supabase'in
 * `last_sign_in_at`'i token yenilemede güncellenmiyor — yani o sayıdan
 * kurulan bir uykuda-hesap listesi en aktif kullanıcıları işaretler.
 * Ölçülebilen şey portalın kendi denetim kaydı, ve adı ona göre.
 */

const REASONS: Record<
  NonNullable<AccessReviewRow['dueReason']>,
  { tr: string; en: string; tone: string }
> = {
  never_reviewed: {
    tr: 'Hiç gözden geçirilmedi',
    en: 'Never reviewed',
    tone: 'border-amber-300 bg-amber-50 text-amber-800',
  },
  review_overdue: {
    tr: 'Son bakış altı aydan eski',
    en: 'Last looked at over six months ago',
    tone: 'border-amber-300 bg-amber-50 text-amber-800',
  },
  expiring_soon: {
    tr: 'Otuz gün içinde sona eriyor',
    en: 'Lapses within thirty days',
    tone: 'border-slate-300 bg-slate-100 text-slate-700',
  },
  expired_record_open: {
    tr: 'Süresi geçmiş, kaydı açık',
    en: 'Past its expiry, record still open',
    tone: 'border-slate-300 bg-slate-100 text-slate-700',
  },
};

const DECISIONS: Record<AccessDecision, { tr: string; en: string }> = {
  kept: { tr: 'Erişim olduğu gibi kalsın', en: 'Access stays as it is' },
  narrowed: { tr: 'Daraltıldı', en: 'Narrowed' },
  revoked: { tr: 'Kaldırıldı', en: 'Revoked' },
  extended: { tr: 'Süresi uzatıldı', en: 'Expiry extended' },
};

/**
 * Aynı iki tablo, gevşek anahtarla — `lib/calendarKinds.ts`'in kalıbı.
 *
 * `Record<AccessDecision, …>` bir `AccessDecision` ile indekslenince
 * TypeScript sonucun kesin var olduğunu söyler, ve bu bir göç canlıya
 * uygulanana kadar doğrudur: o andan sonra veritabanı yeni değeri üretmeye
 * başlıyor, paket ise bir sonraki dağıtımda öğreniyor. Aradaki satır bir
 * kusur değil, beklenen bir aşama.
 *
 * İlk yazışımda sözlüğü doğrudan indeksledim ve `/admin` TAMAMEN GİTTİ:
 * `tests/populated.mjs` dokuzuncu satıra kasten
 * `a_value_a_later_migration_adds` koyuyor. Takvim ekranını 3 Ekim'de düşüren
 * kusurun aynısı, aynı sözdizimiyle, aynı depoda.
 *
 * `dueReason` için ayrıca zorunlu: görünümde o kolon hesaplanmış bir `case`,
 * yani `text` — enum bile değil, tipi tamamen istemcinin bir iddiası.
 */
const DECISION_BY_KEY: Record<string, { tr: string; en: string }> = DECISIONS;
const REASON_BY_KEY: Record<string, { tr: string; en: string; tone: string }> = REASONS;

/**
 * Kararın adı. Tanınmayan karar kendi anahtarıyla görünür: uydurulmuş bir ad,
 * tanınmayan bir değerden kötüdür, çünkü doğru okunduğunu sandırır
 * (CLAUDE.md §2).
 */
const decisionWord = (decision: string, trLang: boolean): string =>
  (trLang ? DECISION_BY_KEY[decision]?.tr : DECISION_BY_KEY[decision]?.en) ?? decision;

export const AccessReviewSection: React.FC<{ canReview: boolean }> = ({ canReview }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const { user } = useAuth();

  const queue = access.useAccessReviewQueue();
  const record = access.useRecordAccessReview();

  const [subjectId, setSubjectId] = useState('');
  const [decision, setDecision] = useState<AccessDecision>('kept');
  const [note, setNote] = useState('');

  const rows = queue.data ?? [];
  const due = rows.filter((r) => r.dueReason !== null);
  const mismatched = rows.filter((r) => r.revokedButActive === true);

  // Kimse kendine bakmaz; veritabanı da reddediyor (0055), seçicide de yok.
  const reviewable = rows.filter((r) => r.profileId !== user?.id);

  const unknown = (text: string) => <span className="text-slate-400">{text}</span>;

  return (
    <Section
      icon={UserCheck}
      title={tr ? 'Erişim gözden geçirme' : 'Access review'}
      subtitle={
        tr
          ? 'Altı ayda bir: bu kişiler hâlâ erişmeli mi? Karar kaydedilir, erişimi değiştirmez — değiştirmek yukarıdaki bölümlerin işi.'
          : 'Every six months: should these people still have access? The decision is recorded, not enacted — changing access is what the sections above are for.'
      }
      whoMayUse={
        tr
          ? 'Listeyi iç ekip okur; kararı yönetici ve mütevelli verir. Kimse kendi erişimini onaylayamaz.'
          : 'The internal team reads the list; the ruling belongs to an administrator or a trustee. Nobody signs off on their own access.'
      }
      canUse={canReview}
      waiting={due.length}
    >
      {/* Kapının tutamağı. `/admin` ilk ekranı 1044px ve bu bölüm kıvrımın
          altında, yani T14-03'ün yoğunluk ölçüsü onu hiç görmüyor —
          render edilmemiş olsa 42 düğme yine 42 olurdu. */}
      <div data-access-review="queue">
        <QueryStatus queries={[queue]} />

        {queue.isSuccess && due.length === 0 && mismatched.length === 0 && (
          <EmptyState
            icon={UserCheck}
            title={tr ? 'Bakılacak erişim yok' : 'Nothing is due'}
            description={
              tr
                ? 'Son altı ayda herkes gözden geçirildi; yaklaşan bitiş yok.'
                : 'Everyone was reviewed in the last six months; nothing is about to lapse.'
            }
          />
        )}

        {mismatched.length > 0 && (
          <div className="mb-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2">
            <p className="text-sm font-semibold text-rose-900">
              {tr ? 'Karar uygulanmamış' : 'A decision has not been carried out'}
            </p>
            <p className="mt-0.5 text-sm text-rose-800">
              {tr
                ? 'Bu kişiler için "kaldırıldı" kaydı var ama hesap hâlâ açık.'
                : 'A revocation is recorded for these people, but the account is still open.'}
            </p>
            <ul className="mt-1 space-y-0.5 text-sm text-rose-900">
              {mismatched.map((row) => (
                <li key={row.profileId}>
                  <span className="font-medium">{row.fullName}</span> ·{' '}
                  {roleLabel(row.role, language)}
                  {row.lastReviewedAt && ` · ${formatDate(row.lastReviewedAt, language)}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {due.length > 0 && (
          <TableFrame
            head={
              <tr>
                <Th>{tr ? 'Kişi' : 'Person'}</Th>
                <Th>{tr ? 'Sebep' : 'Why'}</Th>
                <Th>{tr ? 'Portalda son işlem' : 'Last recorded action'}</Th>
                <Th>{tr ? 'Bitiş' : 'Expiry'}</Th>
                <Th>{tr ? 'Son bakış' : 'Last reviewed'}</Th>
              </tr>
            }
          >
            {due.map((row) => {
              const reason = row.dueReason ? REASON_BY_KEY[row.dueReason] : undefined;
              return (
                <tr key={row.profileId} className="border-t border-slate-100">
                  <Td>
                    <span className="font-medium text-slate-900">{row.fullName}</span>
                    <span className="block text-sm text-slate-500">
                      {roleLabel(row.role, language)}
                      {row.organization && ` · ${row.organization}`}
                    </span>
                  </Td>
                  <Td>
                    {row.dueReason && (
                      <Pill
                        className={reason?.tone ?? 'border-slate-300 bg-slate-100 text-slate-700'}
                      >
                        {(reason && (tr ? reason.tr : reason.en)) ?? row.dueReason}
                      </Pill>
                    )}
                  </Td>
                  <Td>
                    {row.lastActionAt
                      ? formatDate(row.lastActionAt, language)
                      : unknown(tr ? 'kayıtlı yazma işlemi yok' : 'no recorded write')}
                  </Td>
                  <Td>
                    {row.expiresAt
                      ? formatDate(row.expiresAt, language)
                      : unknown(tr ? 'süresiz' : 'open-ended')}
                  </Td>
                  <Td>
                    {row.lastReviewedAt ? (
                      <>
                        {formatDate(row.lastReviewedAt, language)}
                        {row.lastDecision && (
                          <span className="block text-sm text-slate-500">
                            {decisionWord(row.lastDecision, tr)}
                          </span>
                        )}
                      </>
                    ) : (
                      unknown(tr ? 'hiç' : 'never')
                    )}
                  </Td>
                </tr>
              );
            })}
          </TableFrame>
        )}

        {canReview && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              record.mutate(
                { subjectId, decision, note: note.trim() || null },
                {
                  onSuccess: () => {
                    setSubjectId('');
                    setNote('');
                    setDecision('kept');
                  },
                },
              );
            }}
            className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5"
          >
            <div className="flex flex-wrap gap-2">
              <Field label={tr ? 'Kişi' : 'Person'} className="min-w-[180px] flex-1">
                <Select required value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  <option value="">{tr ? 'Seçin' : 'Choose'}</option>
                  {reviewable.map((row) => (
                    <option key={row.profileId} value={row.profileId}>
                      {row.fullName} · {roleLabel(row.role, language)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={tr ? 'Karar' : 'Decision'} className="min-w-[160px]">
                <Select
                  value={decision}
                  onChange={(e) => setDecision(e.target.value as AccessDecision)}
                >
                  {(Object.keys(DECISIONS) as AccessDecision[]).map((key) => (
                    <option key={key} value={key}>
                      {decisionWord(key, tr)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field
              label={
                decision === 'kept'
                  ? tr
                    ? 'Not (isteğe bağlı)'
                    : 'Note (optional)'
                  : tr
                    ? 'Gerekçe (zorunlu)'
                    : 'Reason (required)'
              }
            >
              <TextInput
                required={decision !== 'kept'}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <ActionButton type="submit" tone="primary" disabled={record.isPending}>
              {tr ? 'Kararı kaydet' : 'Record the decision'}
            </ActionButton>
            <WriteError error={record.error} />
          </form>
        )}
      </div>
    </Section>
  );
};
