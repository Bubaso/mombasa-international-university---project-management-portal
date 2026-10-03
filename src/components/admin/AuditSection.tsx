import React, { useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as access from '../../api/adminHooks';
import { Pill, Section, Select, TableFrame, Td, Th } from '../ui/Controls';
import { MoreRows } from '../ui/MoreRows';

const ACTION_STYLES: Record<string, string> = {
  INSERT: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  UPDATE: 'border-amber-200 bg-amber-50 text-amber-800',
  DELETE: 'border-rose-200 bg-rose-50 text-rose-800',
};

const ACTION_LABELS: Record<string, { tr: string; en: string }> = {
  INSERT: { tr: 'Eklendi', en: 'Created' },
  UPDATE: { tr: 'Değişti', en: 'Changed' },
  DELETE: { tr: 'Silindi', en: 'Deleted' },
};

/**
 * What has been done, by whom, and when.
 *
 * Written by triggers, never by the application, and append-only: no policy
 * grants insert, update or delete to anyone, and two triggers refuse the last
 * two outright. A row here cannot be tidied up after the fact, which is the
 * only property that makes it worth reading.
 */
export const AuditSection: React.FC = () => {
  const { language } = useApp();
  const tr = language === 'tr';
  const PAGE = 50;
  const [limit, setLimit] = useState(PAGE);
  const [entityType, setEntityType] = useState('');
  const log = access.useAuditLog(limit, entityType);

  const shown = log.data?.rows ?? [];
  const total = log.data?.total ?? 0;

  // Açılır listedeki türler görülen dilimden çıkıyor, bütün kütükten değil —
  // ve etiket bunu söylüyor. Bütün kütükten çıkarmak için her satırın
  // `entity_type`'ını çekmek gerekir, ki o da tam olarak kaçındığımız şey.
  // Süzgecin kendisi sunucuda, yani seçilen tür bütün kütükte aranıyor.
  const types = useMemo(() => Array.from(new Set(shown.map((e) => e.entityType))).sort(), [shown]);

  return (
    <Section
      icon={ScrollText}
      title={tr ? 'Denetim kaydı' : 'Audit trail'}
      subtitle={
        tr
          ? 'Kayıtlar yalnızca veritabanı tarafından yazılır; hiç kimse silemez veya değiştiremez. Liste en yenisinden başlıyor ve kaç kaydın olduğunu altında yazıyor.'
          : 'Only the database appends to this, and nobody can edit or delete a row. The list starts with the newest and says underneath how many there are.'
      }
      whoMayUse={tr ? 'Salt okunur' : 'Read-only for everyone'}
      canUse
    >
      <div className="mb-2.5 flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">
            {tr ? 'Kayıt türü (görülenlerden)' : 'Record type (of those shown)'}
          </span>
          <Select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="w-auto"
          >
            <option value="">{tr ? 'Hepsi' : 'Everything'}</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </label>
        <span className="pb-1.5 text-xs text-slate-500">
          {entityType
            ? tr
              ? `bu türde ${total} kayıt`
              : `${total} of this type`
            : tr
              ? `kütükte ${total} kayıt`
              : `${total} in the log`}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="text-xs text-slate-500">
          {tr ? 'Gösterilecek kayıt yok.' : 'Nothing to show.'}
        </p>
      ) : (
        <TableFrame
          head={
            <tr>
              <Th>{tr ? 'Ne zaman' : 'When'}</Th>
              <Th>{tr ? 'Kim' : 'Who'}</Th>
              <Th>{tr ? 'İşlem' : 'Action'}</Th>
              <Th>{tr ? 'Kayıt' : 'Record'}</Th>
            </tr>
          }
        >
          {shown.map((entry) => (
            <tr key={entry.id}>
              <Td className="whitespace-nowrap font-mono text-xs text-slate-500">
                {entry.at.slice(0, 16).replace('T', ' ')}
              </Td>
              <Td className="font-medium text-slate-900">
                {entry.actorName ?? (
                  <span className="font-normal text-slate-500">{tr ? 'sistem' : 'the system'}</span>
                )}
              </Td>
              <Td>
                <Pill className={ACTION_STYLES[entry.action] ?? 'border-slate-300 bg-slate-100'}>
                  {ACTION_LABELS[entry.action]?.[language] ?? entry.action}
                </Pill>
              </Td>
              <Td>
                <span className="font-mono text-xs">{entry.entityType}</span>
                {entry.entityId && (
                  <span className="ml-1.5 font-mono text-xs text-slate-500">
                    {entry.entityId.slice(0, 8)}…
                  </span>
                )}
              </Td>
            </tr>
          ))}
        </TableFrame>
      )}

      {/* Kesilen neyse söylenecek. Bu ekran "son 200 işlem" diyordu ve 200'ün
          kaçtan geldiğini söylemiyordu. */}
      <MoreRows
        shown={shown.length}
        total={total}
        onMore={() => setLimit(limit + PAGE)}
        busy={log.isFetching}
      />
    </Section>
  );
};
