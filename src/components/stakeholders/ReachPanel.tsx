import React, { useMemo, useState } from 'react';
import { ArrowRight, CornerDownLeft, Route as RouteIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import * as register from '../../api/stakeholderHooks';
import { QueryStatus } from '../QueryStatus';
import { Field, Pill, Select } from '../ui/Controls';
import { stanceLabel, stanceStyle } from '../../lib/stakeholders';
import { reachNetwork, routesTo, type Entry, type NoRoute } from '../../lib/reachPath';
import type { Stakeholder } from '../../types';

/**
 * "Bakana ulaşmak için en kısa yol kim?" (M4-10)
 *
 * NE ÇİZİLDİ, NE ÇİZİLMEDİ
 *
 * M4-10 "ağ grafiği" diyor ve burada 134 paydaşın kuvvet-yönlü bir serpme
 * çizimi YOK. Sebebi iki tane ve ikisi de kayıtla ilgili:
 *
 *   Böyle bir çizimde düğümlerin yeri hiçbir kayıttan gelmiyor — algoritmanın
 *   başlangıç rastgeleliğinden geliyor. Yakın duran iki isim yakın
 *   OLDUĞU İÇİN değil, çizici onları oraya attığı için yakın durur. Bu
 *   portalın ekrandan kaldırdığı şey tam olarak budur: kaynağı olmayan bir
 *   şeyin kesin görünmesi.
 *
 *   Ve satırın kendi sorusu bir serpme çizimiyle cevaplanmıyor. "En kısa yol
 *   kim" sorusunun cevabı bir zincirdir; 134 düğümlü bir bulutta o zinciri
 *   gözle bulmak, zinciri hesaplayıp yazmaktan zordur.
 *
 * Çizilen şey ağın SORUYU CEVAPLAYAN alt grafiği: hedefe giden zincirler,
 * her halkada bağın türü ve gücü, her düğümde nüfuz ve tutum rengi. Ağın
 * geri kalanı hakkında söylenen şey sayı: kaç kenar, kaç hasım bağı yolda
 * kullanılmadı, kaç paydaşın hiç geçilebilir bağı yok.
 *
 * YOL YOKSA SEBEBİ YAZILI, ve "ulaşılamaz" demiyoruz — göremediğimiz bir
 * kayıt yüzünden de yol görünmüyor olabilir.
 */

const ENTRY_WORDS: Record<Entry, { tr: string; en: string }> = {
  spoken: { tr: 'görüşme kaydı var', en: 'a logged conversation' },
  owner_assigned: { tr: 'sorumlu atanmış, görüşme kaydı yok', en: 'an owner, no conversation' },
};

const TIE_WORDS: Record<string, { tr: string; en: string }> = {
  influences: { tr: 'etkiler', en: 'influences' },
  advises: { tr: 'danışmanı', en: 'advises' },
  reports_to: { tr: 'bağlı', en: 'reports to' },
  works_with: { tr: 'birlikte çalışır', en: 'works with' },
  related_to: { tr: 'akraba', en: 'related to' },
  opposes: { tr: 'karşı', en: 'opposes' },
};

const WHY_WORDS: Record<NoRoute, { tr: string; en: string }> = {
  unknown_target: {
    tr: 'Bu kişi görebildiğiniz kütükte yok.',
    en: 'This person is not in the register you can see.',
  },
  no_entry_recorded: {
    tr: 'Hiç kimseyle görüşme kaydı yok ve kimseye ilişki sorumlusu atanmamış. Zincir bir yerden başlamak zorunda; eksik olan ağ değil, başlangıç.',
    en: 'No conversation is logged with anyone and no relationship owner is assigned. A chain has to start somewhere; what is missing is the start, not the network.',
  },
  no_tie_recorded: {
    tr: 'Görebildiğiniz kayıtlarda bu kişiye giden bir bağ zinciri yok. Bu "ulaşılamaz" demek değil — bağ kaydedilmemiş de olabilir, ya da zincir göremediğiniz birinden geçiyor olabilir.',
    en: 'In the records you can see, no chain of ties reaches this person. That is not the same as unreachable — the tie may never have been recorded, or the chain may run through somebody you cannot see.',
  },
};

export const ReachPanel: React.FC<{
  stakeholders: Stakeholder[];
  onOpen: (id: string) => void;
}> = ({ stakeholders, onOpen }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const ties = register.useRelationships();
  const spoken = register.useSpokenToIds();
  const [targetId, setTargetId] = useState('');

  const nameOf = useMemo(
    () => new Map(stakeholders.map((s) => [s.id, s.fullName])),
    [stakeholders],
  );
  const personOf = useMemo(() => new Map(stakeholders.map((s) => [s.id, s])), [stakeholders]);

  const input = useMemo(
    () => ({
      people: stakeholders.map((s) => ({ id: s.id, relationshipOwnerId: s.relationshipOwner })),
      ties: (ties.data ?? []).map((t) => ({
        id: t.id,
        fromId: t.fromStakeholderId,
        toId: t.toStakeholderId,
        kind: t.kind as string,
        strength: t.strength,
      })),
      spokenTo: spoken.data ?? [],
    }),
    [stakeholders, ties.data, spoken.data],
  );

  const net = useMemo(() => reachNetwork(input), [input]);
  const reach = useMemo(() => (targetId ? routesTo(input, targetId) : null), [input, targetId]);

  const tie = (kind: string) =>
    TIE_WORDS[kind]?.[language] ?? (tr ? `tür tanınmıyor: ${kind}` : `unrecognised kind: ${kind}`);

  const node = (id: string) => {
    const person = personOf.get(id);
    return (
      <button
        type="button"
        onClick={() => onOpen(id)}
        className="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-left text-sm hover:bg-slate-50"
      >
        <span className="min-w-0 truncate font-medium text-slate-900">
          {nameOf.get(id) ?? (tr ? 'adı yok' : 'no name')}
        </span>
        {person && (
          <Pill className={stanceStyle(person.stance)}>
            {stanceLabel(person.stance, language)} · {person.influence}
          </Pill>
        )}
      </button>
    );
  };

  return (
    <section data-reach-panel className="space-y-3">
      <QueryStatus queries={[ties, spoken]} />

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
        <Field label={tr ? 'Kime ulaşmak istiyorsunuz?' : 'Who do you want to reach?'}>
          <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">{tr ? 'Seçin…' : 'Pick someone…'}</option>
            {stakeholders.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </Select>
        </Field>
        <p className="mt-2 text-sm text-slate-500">
          {tr
            ? 'Sıra: en az aracı, sonra görüşme kaydına dayanan başlangıç, sonra en zayıf halka.'
            : 'Ranked by fewest intermediaries, then a start resting on a logged conversation, then the weakest tie.'}
        </p>
      </div>

      {reach && reach.why !== null && (
        <p
          data-reach-why={reach.why}
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {WHY_WORDS[reach.why][language]}
        </p>
      )}

      {reach && reach.routes.length > 0 && (
        <ol data-reach-routes={reach.routes.length} className="space-y-2">
          {reach.routes.map((route, i) => (
            <li
              key={`${route.entryId}-${i}`}
              data-reach-length={route.length}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs"
            >
              <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                <RouteIcon className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                <span className="font-medium text-slate-700">
                  {route.length === 0
                    ? tr
                      ? 'Aracı gerekmiyor'
                      : 'No intermediary needed'
                    : tr
                      ? `${route.length} aracı`
                      : `${route.length} step${route.length === 1 ? '' : 's'}`}
                </span>
                <span>·</span>
                <span>
                  {tr ? 'başlangıç: ' : 'start: '}
                  {ENTRY_WORDS[route.entry][language]}
                </span>
                {route.weakestLink !== null && (
                  <>
                    <span>·</span>
                    <span>
                      {tr ? 'en zayıf halka ' : 'weakest tie '}
                      {route.weakestLink}/5
                    </span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {node(route.entryId)}
                {route.hops.map((hop) => (
                  <React.Fragment key={hop.tieId}>
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm text-slate-500">
                      {hop.reversed ? (
                        <CornerDownLeft className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      )}
                      <span>
                        {tie(hop.kind)} · {hop.strength}/5
                        {hop.reversed &&
                          (tr ? ' · ters yönde kayıtlı' : ' · recorded the other way')}
                      </span>
                    </span>
                    {node(hop.toId)}
                  </React.Fragment>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}

      {reach?.truncated && (
        <p className="text-sm text-slate-500">
          {tr
            ? 'Aynı uzunlukta daha fazla yol var; gösterilen hepsi değil.'
            : 'More routes of the same length exist; these are not all of them.'}
        </p>
      )}

      {/* Ağın geri kalanı: çizilmeyen şey hakkında söylenen sayı. Bir ağ
          grafiği yerine sayı vermek, ağın olmadığını değil, ağın bu ekranda
          bir resim olarak değil bir ölçü olarak durduğunu söylüyor. */}
      <dl
        data-reach-network
        className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-3"
      >
        {[
          { k: tr ? 'Geçilebilir bağ' : 'Ties usable as a route', v: net.edges },
          { k: tr ? 'Görüşme kaydı olan' : 'People spoken to', v: net.spokenTo },
          { k: tr ? 'Yalnızca sorumlu atanmış' : 'Owner only', v: net.ownerOnly },
          {
            k: tr ? 'Yolda kullanılmayan hasım bağı' : 'Hostile ties not used',
            v: net.hostileTiesIgnored,
          },
          { k: tr ? 'Geçilebilir bağı olmayan' : 'Nobody connected to them', v: net.withoutATie },
          { k: tr ? 'Türü tanınmayan bağ' : 'Ties of unrecognised kind', v: net.unrecognisedTies },
        ].map((cell) => (
          <div key={cell.k}>
            <dt className="text-slate-500">{cell.k}</dt>
            <dd className="font-semibold text-slate-900">{cell.v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-slate-500">
        {tr
          ? 'Hasım bağı ağda duruyor ama zincirde kullanılmıyor: bir hasmın mesajı ileteceğini kimse kaydetmedi.'
          : 'A hostile tie is kept in the network but never used as a route: nobody recorded that an opponent would pass a message on.'}
      </p>
    </section>
  );
};
