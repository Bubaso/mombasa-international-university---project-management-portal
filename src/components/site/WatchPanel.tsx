/**
 * The watch book (M7-18, M7-12, M6-11).
 *
 * The screen is built around one refusal: nowhere does it say a person is on
 * site, and nowhere does it say an incident went unanswered. A gate entry
 * with no exit reads "çıkışı kayıtlı değil", and where its watch has already
 * closed it says so and calls that what it almost certainly is — a departure
 * nobody wrote down. An incident with no response reads "müdahale kayıtlı
 * değil". Both are the same rule: the book knows what was written in it, and
 * not one thing more.
 *
 * What the book does not say goes at the top, before the entries, because a
 * watch register's failure mode is looking complete.
 */
import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  DoorOpen,
  FileWarning,
  Footprints,
  ShieldQuestion,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import * as watchApi from '../../api/watchHooks';
import { QueryStatus } from '../QueryStatus';
import { ActionButton, Field, Pill, Select, TextInput, WriteError } from '../ui/Controls';
import { Bilingual } from '../ui/Bilingual';
import {
  INCIDENT_LABELS,
  POST_LABELS,
  isSerious,
  lagWords,
  noticeWords,
  openEntryWords,
  roundVerdict,
  roundWords,
} from '../../lib/watch';
import type { IncidentKind, WatchHealth } from '../../types';

const when = (iso: string | null): string =>
  iso == null
    ? '—'
    : new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

/** The unfinished jobs, in the reader's words, and only the ones above zero. */
function gaps(health: WatchHealth, tr: boolean): string[] {
  const out: string[] = [];
  if (health.watchesNeverClosed > 0)
    out.push(
      tr
        ? `${health.watchesNeverClosed} nöbet kapatılmamış`
        : `${health.watchesNeverClosed} watch(es) never closed`,
    );
  if (health.entriesOutlastingTheirWatch > 0)
    out.push(
      tr
        ? `${health.entriesOutlastingTheirWatch} giriş, nöbeti bittiği hâlde açık`
        : `${health.entriesOutlastingTheirWatch} entry(ies) still open after their watch ended`,
    );
  if (health.watchesWithoutAnExpectedCount > 0)
    out.push(
      tr
        ? `${health.watchesWithoutAnExpectedCount} nöbette beklenen tur sayısı kayıtlı değil`
        : `${health.watchesWithoutAnExpectedCount} watch(es) with no expected round count`,
    );
  if (health.watchesShortOfTheirRounds > 0)
    out.push(
      tr
        ? `${health.watchesShortOfTheirRounds} nöbet, verilen tur sayısının altında`
        : `${health.watchesShortOfTheirRounds} watch(es) short of their rounds`,
    );
  if (health.seriousIncidentsWithNoNotificationDecision > 0)
    out.push(
      tr
        ? `${health.seriousIncidentsWithNoNotificationDecision} ciddi olayda resmî bildirim kararı kayıtlı değil`
        : `${health.seriousIncidentsWithNoNotificationDecision} serious incident(s) with no notification decision`,
    );
  if (health.incidentsWithoutEvidence > 0)
    out.push(
      tr
        ? `${health.incidentsWithoutEvidence} olayda kanıt kayıtlı değil`
        : `${health.incidentsWithoutEvidence} incident(s) with no evidence filed`,
    );
  if (health.incidentsWithoutAResponse > 0)
    out.push(
      tr
        ? `${health.incidentsWithoutAResponse} olayda müdahale kayıtlı değil`
        : `${health.incidentsWithoutAResponse} incident(s) with no response recorded`,
    );
  return out;
}

export const WatchPanel: React.FC<{ canKeep: boolean }> = ({ canKeep }) => {
  const { language } = useApp();
  const tr = language === 'tr';
  const { user } = useAuth();

  const watches = watchApi.useWatches();
  const entries = watchApi.useOpenEntries();
  const incidents = watchApi.useIncidents();
  const health = watchApi.useWatchHealth();

  const recordExit = watchApi.useRecordExit();
  const confirm = watchApi.useConfirmIncident();

  const [kind, setKind] = useState<IncidentKind>('security_breach');
  const [narrative, setNarrative] = useState('');
  const [occurred, setOccurred] = useState('');
  const record = watchApi.useRecordIncident();

  const watchRows = watches.data ?? [];
  const entryRows = entries.data ?? [];
  const incidentRows = incidents.data ?? [];
  const unfinished = health.data ? gaps(health.data, tr) : [];

  return (
    <div className="space-y-3">
      <QueryStatus queries={[watches, entries, incidents, health]} />

      {/* What the book does not say, first. */}
      {unfinished.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2.5">
            <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">
                {tr ? 'Nöbet defterinin söylemediği şeyler' : 'What the watch book does not say'}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-900/80">
                {tr
                  ? 'Bunların hiçbiri portalın kusuru değil; her biri birinin gidip öğrenmesi gereken bir şey. Bir nöbet defteri tam görünerek bozulur.'
                  : 'None of these is a defect in the portal; each is something somebody has to go and find out. A watch register fails by looking complete.'}
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-amber-900">
                {unfinished.map((line) => (
                  <li key={line}>· {line}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* The gate. Never a list of people on site. */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <header className="mb-2 flex items-start gap-2">
          <DoorOpen className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">
              {tr ? 'Çıkışı kayıtlı olmayan girişler' : 'Entries with no exit recorded'}
            </h3>
            <p className="text-xs leading-relaxed text-slate-500">
              {tr
                ? 'Bu bir "sahadaki kişiler" listesi değil. Defter yalnızca çıkışın yazılmadığını biliyor; kişinin sahada olup olmadığını bilmiyor.'
                : 'This is not a list of people on site. The book knows only that no exit was written down.'}
            </p>
          </div>
        </header>
        {entryRows.length === 0 ? (
          <p className="text-xs text-slate-500">
            {tr
              ? 'Açık giriş yok — ya da hiç giriş kaydedilmemiş. İkisi bu ekrandan ayırt edilemez.'
              : 'No open entries — or none were ever recorded. This screen cannot tell those apart.'}
          </p>
        ) : (
          <ul
            className="space-y-1.5"
            // Labelled so a test can read the rows themselves rather than the
            // whole page: the paragraph above has to use the word "sahada" to
            // say the book does not know it, and a check that banned the word
            // outright would fail on the sentence that makes the point.
            aria-label={tr ? 'Çıkışı kayıtlı olmayan girişler' : 'Entries with no exit recorded'}
          >
            {entryRows.map((entry) => (
              <li
                key={entry.gateVisitId}
                className={`rounded-lg border px-2.5 py-2 ${
                  entry.outlastedItsWatch
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">
                    {entry.personName}
                    {entry.organisation != null && (
                      <span className="font-normal text-slate-500"> · {entry.organisation}</span>
                    )}
                  </p>
                  {canKeep && (
                    <ActionButton
                      onClick={() =>
                        recordExit.mutate({
                          id: entry.gateVisitId,
                          exitedAt: new Date().toISOString(),
                        })
                      }
                      disabled={recordExit.isPending}
                    >
                      {tr ? 'Çıkışı yaz' : 'Write the exit'}
                    </ActionButton>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-600">
                  {openEntryWords(entry.openHours, entry.outlastedItsWatch)}
                </p>
                {entry.purpose != null && <p className="text-xs text-slate-500">{entry.purpose}</p>}
                {!entry.idDocumentSeen && (
                  <p className="text-xs text-slate-500">
                    {tr
                      ? 'Kimlik görüldüğü kayıtlı değil'
                      : 'No record that identification was seen'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <WriteError error={recordExit.error} />
      </div>

      {/* Incidents. */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <header className="mb-2 flex items-start gap-2">
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">
              {tr ? 'Olay kaydı' : 'Incident record'}
            </h3>
            <p className="text-xs leading-relaxed text-slate-500">
              {tr
                ? 'Bu kayıt mahkemede okunabilir. Teyit edilen bir olayın anlatısı donar; sonradan yapılan müdahale eklenebilir, çünkü sonraki cevap olayın yeniden yazılması değildir.'
                : 'This record may be read in court. A confirmed narrative is frozen; a later response can still be added, because answering afterwards is not rewriting the event.'}
            </p>
          </div>
        </header>

        {canKeep && (
          <form
            className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 sm:grid-cols-4"
            aria-label={tr ? 'Olay kaydı' : 'Incident record'}
            onSubmit={(event) => {
              event.preventDefault();
              if (narrative.trim() === '' || occurred === '' || user == null) return;
              record.mutate(
                {
                  watchShiftId: null,
                  constructionBlockId: null,
                  kind,
                  occurredAt: new Date(occurred).toISOString(),
                  descriptionEn: narrative.trim(),
                  interventionEn: null,
                  injuredCount: null,
                  severity: null,
                  policeObNumber: null,
                  profileId: user.id,
                },
                {
                  onSuccess: () => {
                    setNarrative('');
                    setOccurred('');
                  },
                },
              );
            }}
          >
            <Field label={tr ? 'Tür' : 'Kind'}>
              <Select
                value={kind}
                onChange={(event) => setKind(event.target.value as IncidentKind)}
              >
                {(Object.keys(INCIDENT_LABELS) as IncidentKind[]).map((option) => (
                  <option key={option} value={option}>
                    {tr ? INCIDENT_LABELS[option].tr : INCIDENT_LABELS[option].en}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr ? 'Ne zaman oldu' : 'When it happened'}>
              <TextInput
                type="datetime-local"
                value={occurred}
                onChange={(event) => setOccurred(event.target.value)}
                required
              />
            </Field>
            <Field label={tr ? 'Ne oldu' : 'What happened'} className="sm:col-span-2">
              <TextInput
                value={narrative}
                onChange={(event) => setNarrative(event.target.value)}
                placeholder={tr ? 'Yazanın kendi cümlesiyle' : "In the writer's own words"}
                required
              />
            </Field>
            <div className="sm:col-span-4">
              <ActionButton type="submit" disabled={record.isPending}>
                {tr ? 'Olayı kaydet' : 'Record the incident'}
              </ActionButton>
              <p className="mt-1 text-xs text-slate-500">
                {tr
                  ? 'Resmî bildirim bu formda yok: "bildirildi" demek yazının kendisini ister, ve olay ilk yazıldığında kimsenin elinde yazı olmaz.'
                  : 'Notification is not on this form: claiming an authority was told requires the letter, and nobody has one when the incident is first written down.'}
              </p>
              <WriteError error={record.error} />
            </div>
          </form>
        )}

        {incidentRows.length === 0 ? (
          <p className="text-xs text-slate-500">
            {tr ? 'Kayıtlı olay yok.' : 'No incidents recorded.'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {incidentRows.map((incident) => {
              const notice = noticeWords(incident.authorityNotice);
              const lag = lagWords(incident.loggedHoursAfter);
              const noDecision = incident.authorityNotice === 'unknown' && isSerious(incident.kind);
              return (
                <li
                  key={incident.siteIncidentId}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill className="border-slate-300 bg-white text-slate-700">
                      {tr ? INCIDENT_LABELS[incident.kind].tr : INCIDENT_LABELS[incident.kind].en}
                    </Pill>
                    <span className="text-xs text-slate-500">{when(incident.occurredAt)}</span>
                    {incident.blockCode != null && (
                      <span className="text-xs text-slate-500">· {incident.blockCode}</span>
                    )}
                    {incident.confirmed ? (
                      <Pill className="border-emerald-200 bg-emerald-50 text-emerald-800">
                        {tr ? 'Teyit edildi — donmuş' : 'Confirmed — frozen'}
                      </Pill>
                    ) : (
                      canKeep && (
                        <ActionButton
                          onClick={() => confirm.mutate(incident.siteIncidentId)}
                          disabled={confirm.isPending}
                        >
                          {tr ? 'Teyit et ve dondur' : 'Confirm and freeze'}
                        </ActionButton>
                      )
                    )}
                  </div>

                  <p className="mt-1 text-sm text-slate-800">
                    <Bilingual
                      table="site_incidents"
                      id={incident.siteIncidentId}
                      base="description"
                      en={incident.descriptionEn}
                      tr={incident.descriptionTr}
                    />
                  </p>

                  <p className="mt-0.5 text-xs text-slate-600">
                    {incident.interventionUnrecorded ? (
                      <span className="text-amber-800">
                        {tr ? 'Müdahale kayıtlı değil' : 'No response recorded'}
                      </span>
                    ) : (
                      <Bilingual
                        table="site_incidents"
                        id={incident.siteIncidentId}
                        base="intervention"
                        en={incident.interventionEn}
                        tr={incident.interventionTr}
                      />
                    )}
                  </p>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
                    <span className={noDecision ? 'font-medium text-amber-800' : 'text-slate-500'}>
                      {tr ? notice.tr : notice.en}
                    </span>
                    {incident.policeObNumber != null && (
                      <span className="text-slate-500">OB {incident.policeObNumber}</span>
                    )}
                    <span
                      className={incident.evidenceCount === 0 ? 'text-amber-800' : 'text-slate-500'}
                    >
                      {incident.evidenceCount === 0
                        ? tr
                          ? 'Kanıt kayıtlı değil'
                          : 'No evidence filed'
                        : tr
                          ? `${incident.evidenceCount} kanıt`
                          : `${incident.evidenceCount} piece(s) of evidence`}
                    </span>
                    {incident.injuredCount != null && incident.injuredCount > 0 && (
                      <span className="font-medium text-rose-700">
                        {tr
                          ? `${incident.injuredCount} yaralı`
                          : `${incident.injuredCount} injured`}
                      </span>
                    )}
                    {lag != null && <span className="text-slate-500">{lag}</span>}
                  </div>
                  <WriteError error={confirm.error} />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Watches and their rounds. */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <header className="mb-2 flex items-start gap-2">
          <Footprints className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">
              {tr ? 'Nöbetler ve turlar' : 'Watches and rounds'}
            </h3>
            <p className="text-xs leading-relaxed text-slate-500">
              {tr
                ? 'Bir tur, yürüdüğü kaydedildiği için vardır. Yürünmemiş bir turu işaretleyecek bir kutu yok; eksik, hesaplanır.'
                : 'A round exists because somebody recorded walking it. There is no box to tick for one nobody walked; the shortfall is computed.'}
            </p>
          </div>
        </header>
        {watchRows.length === 0 ? (
          <p className="text-xs text-slate-500">
            {tr ? 'Kayıtlı nöbet yok.' : 'No watches recorded.'}
          </p>
        ) : (
          <ul
            className="space-y-1"
            // Labelled for the same reason as the gate list: the summary strip
            // at the top of this panel repeats "beklenen tur sayısı kayıtlı
            // değil", so a check read off the whole page would pass even if a
            // row printed a shortfall against a figure nobody gave.
            aria-label={tr ? 'Nöbetler ve turlar' : 'Watches and rounds'}
          >
            {watchRows.map((shift) => {
              const verdict = roundVerdict(shift.roundsExpected, shift.roundsMissing);
              return (
                <li
                  key={shift.watchShiftId}
                  className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
                >
                  <span className="font-medium text-slate-900">
                    {tr ? POST_LABELS[shift.post].tr : POST_LABELS[shift.post].en}
                    {shift.blockCode != null && ` ${shift.blockCode}`}
                  </span>
                  <span className="text-slate-600">{shift.onWatch}</span>
                  <span className="text-slate-500">{when(shift.beganAt)}</span>
                  {shift.neverClosed ? (
                    <span className="flex items-center gap-1 font-medium text-amber-800">
                      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {tr ? 'Kapatılmamış' : 'Never closed'}
                    </span>
                  ) : shift.endedAt == null ? (
                    <span className="text-slate-500">{tr ? 'Sürüyor' : 'Still running'}</span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-500">
                      <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {when(shift.endedAt)}
                    </span>
                  )}
                  <span
                    className={
                      verdict === 'met'
                        ? 'text-slate-600'
                        : verdict === 'short'
                          ? 'text-amber-800'
                          : 'text-slate-500 italic'
                    }
                  >
                    {roundWords(shift.roundsExpected, shift.roundsRecorded, shift.roundsMissing)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
