/**
 * The unified calendar (M15-03, M15-04).
 *
 * One read over six registers. The filtering is the database's: the view is
 * declared security_invoker, so every row came out through the policy of the
 * table it belongs to. An advocate gets their own court dates and nothing
 * else without this file doing anything about it.
 */
import { supabase } from '../lib/supabase';
import type { CalendarEntry, CalendarKind, Confidentiality } from '../types';

interface CalendarRow {
  kind: CalendarKind;
  id: string;
  title_en: string | null;
  title_tr: string | null;
  due_on: string | null;
  due_at: string | null;
  detail: string | null;
  legal_case_id: string | null;
  meeting_id: string | null;
  state: string | null;
  needs_attention: boolean;
  confidentiality: Confidentiality;
}

/**
 * Takvim: her kütükten doğan tarihler bir arada.
 *
 * **Bu okuma kasıtlı olarak sınırsız, ve bir satır sayısıyla sınırlanamaz.**
 * Takvim zamanla gezilen bir şey: ekran ayları ve türleri kendi içinde
 * grupluyor. Satır sayısıyla kesilirse ekim ayı on iki kayıt taşıdığı hâlde
 * üç kayıt gösterir — yani yavaş olmak yerine **ayın hakkında yanlış** bir şey
 * söylemiş olurduk. `fetchCurrentVersions` ile aynı aile: dilimlemek,
 * dilimlenmemiş hâlinden daha yanlış.
 *
 * Doğru sınır burada satır değil **tarih penceresi** (`due_on` aralığı), ve o
 * dört ekranın kendi süzme mantığına dokunmayı gerektiriyor. Takvim o kadar
 * büyüdüğünde yapılacak iş bu; bugün 19 ekranın hiçbirinde kırılmıyor.
 */
export async function fetchCalendar(): Promise<CalendarEntry[]> {
  const { data, error } = await supabase
    .from('project_calendar')
    .select('*')
    .order('due_on', { nullsFirst: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CalendarRow[]).map((row) => ({
    kind: row.kind,
    id: row.id,
    titleEn: row.title_en,
    titleTr: row.title_tr,
    dueOn: row.due_on,
    dueAt: row.due_at,
    detail: row.detail,
    legalCaseId: row.legal_case_id,
    meetingId: row.meeting_id,
    state: row.state,
    needsAttention: row.needs_attention,
    confidentiality: row.confidentiality,
  }));
}
