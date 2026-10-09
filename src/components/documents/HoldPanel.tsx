import React, { useState } from 'react';
import { Lock, LockOpen, ShieldAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as vault from '../../api/documentHooks';
import { useLegalCases } from '../../api/hooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';

/**
 * Bir belgeyi donduran karar (M9-11).
 *
 * MUHAFAZA KALDIRILMAZ, KALDIRILDIĞI KAYDEDİLİR. Bu yüzden burada bir
 * "sil" düğmesi yok ve olmaması bir eksiklik değil: veritabanında da silme
 * politikası yok. Kalkmış bir muhafaza listede durmaya devam ediyor, çünkü
 * bir belgenin bir zamanlar dondurulmuş olması o belge hakkında bilinmesi
 * gereken bir şey — ve ekranın söylediği bir şey daha var: silme, muhafaza
 * kalktıktan sonra da reddediliyor.
 *
 * Kaldırmak sebep istiyor ve sebebi veritabanı istiyor (bir kısıt), istemci
 * değil. Buradaki alan o kısıtın cevabını topluyor; kısıtı tekrar etmiyor.
 */
export const HoldPanel: React.FC<{ documentId: string; canHold: boolean }> = ({
  documentId,
  canHold,
}) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const holds = vault.useHolds(documentId);
  const cases = useLegalCases();
  const place = vault.usePlaceHold();
  const release = vault.useReleaseHold();

  const [reason, setReason] = useState('');
  const [caseId, setCaseId] = useState('');
  const [releasing, setReleasing] = useState<string | null>(null);
  const [releaseReason, setReleaseReason] = useState('');

  const rows = holds.data ?? [];
  const live = rows.filter((h) => h.releasedAt == null);

  return (
    <section data-hold-panel={live.length} className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-violet-700" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-slate-900">
          {tr ? 'Hukukî muhafaza' : 'Legal hold'}
        </h3>
        {live.length > 0 && (
          <Pill className="border-violet-300 bg-violet-50 text-violet-900">
            {tr ? 'Donduruldu' : 'Frozen'}
          </Pill>
        )}
      </div>

      <QueryStatus queries={[holds]} />

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          {tr
            ? 'Bu belgede muhafaza kaydı yok. Yani saklama politikası onu arşivleyebilir ve silinmesi reddedilmez.'
            : 'No hold is recorded on this document, so the retention policy may archive it and deletion is not refused.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((hold) => (
            <li
              key={hold.id}
              className={`rounded-xl border p-3 text-sm ${
                hold.releasedAt == null
                  ? 'border-violet-200 bg-violet-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                {hold.releasedAt == null ? (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-violet-700" aria-hidden="true" />
                ) : (
                  <LockOpen className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                )}
                <span className="font-medium text-slate-900">
                  {hold.releasedAt == null
                    ? tr
                      ? 'Yürürlükte'
                      : 'In force'
                    : tr
                      ? 'Kaldırıldı'
                      : 'Released'}
                </span>
                <span className="text-slate-500">{hold.placedAt.slice(0, 10)}</span>
                {hold.caseNumber && <Pill>{hold.caseNumber}</Pill>}
                {hold.placedByName && <span className="text-slate-500">{hold.placedByName}</span>}
              </div>
              <p className="text-sm text-slate-700">{hold.reason}</p>
              {hold.releasedAt != null && (
                <p className="mt-1 text-sm text-slate-500">
                  {hold.releasedAt.slice(0, 10)}
                  {hold.releasedByName ? ` · ${hold.releasedByName}` : ''} · {hold.releasedReason}
                </p>
              )}
              {canHold && hold.releasedAt == null && releasing !== hold.id && (
                <ActionButton className="mt-2" onClick={() => setReleasing(hold.id)}>
                  <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tr ? 'Kaldır' : 'Release'}</span>
                </ActionButton>
              )}
              {releasing === hold.id && (
                <div className="mt-2 space-y-2">
                  <Field label={tr ? 'Neden kaldırılıyor?' : 'Why is it being released?'}>
                    <TextInput
                      value={releaseReason}
                      onChange={(e) => setReleaseReason(e.target.value)}
                      placeholder={
                        tr
                          ? 'Dosya kapandı, karar kesinleşti…'
                          : 'The file closed, the order is final…'
                      }
                    />
                  </Field>
                  <WriteError error={release.error} />
                  <div className="flex gap-1.5">
                    <ActionButton
                      tone="primary"
                      disabled={releaseReason.trim() === '' || release.isPending}
                      onClick={() =>
                        release.mutate(
                          { id: hold.id, reason: releaseReason.trim() },
                          {
                            onSuccess: () => {
                              setReleasing(null);
                              setReleaseReason('');
                            },
                          },
                        )
                      }
                    >
                      <span>{tr ? 'Kaldır' : 'Release'}</span>
                    </ActionButton>
                    <ActionButton onClick={() => setReleasing(null)}>
                      <span>{tr ? 'Vazgeç' : 'Cancel'}</span>
                    </ActionButton>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canHold && live.length === 0 && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <Field label={tr ? 'Neden donduruluyor?' : 'Why is it being frozen?'}>
            <TextInput
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={tr ? 'ELC dosyasında ibraz edildi…' : 'Produced in the ELC matter…'}
            />
          </Field>
          <Field label={tr ? 'Dosya (varsa)' : 'Case, if there is one'}>
            <Select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              <option value="">{tr ? 'Dosyasız' : 'No case'}</option>
              {(cases.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.caseNumber} · {c.title}
                </option>
              ))}
            </Select>
          </Field>
          <WriteError error={place.error} />
          <ActionButton
            tone="primary"
            disabled={reason.trim() === '' || place.isPending}
            onClick={() =>
              place.mutate(
                { documentId, legalCaseId: caseId === '' ? null : caseId, reason: reason.trim() },
                {
                  onSuccess: () => {
                    setReason('');
                    setCaseId('');
                  },
                },
              )
            }
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr ? 'Muhafazaya al' : 'Place a hold'}</span>
          </ActionButton>
        </div>
      )}
    </section>
  );
};
