/**
 * Sending a capture to the record (M3-11).
 *
 * Three writes, in order, each of them safe to repeat:
 *
 *   the meeting   — inserted under the id the device generated, so a second
 *                   attempt collides with the primary key and that collision
 *                   means "already there", not "make another one"
 *   the minute    — upserted on (meeting, section, language), which is the
 *                   key the table already has
 *   the lines     — inserted on conflict do nothing against the unique
 *                   (meeting, sequence)
 *
 * That matters because the interesting failure is the partial one: the
 * meeting goes, the connection drops, the lines do not. Nothing may be lost
 * and nothing may be doubled, so the capture stays in the queue until all
 * three have gone, and the next attempt completes only what is missing.
 *
 * The action lines become CANDIDATES, never actions. In a meeting with no
 * signal nobody is going to look up a stakeholder id, and an action here
 * needs an owner and a date — so the sentence is kept and the decision is
 * left for the triage queue, which is the same answer the Notion archive got.
 */
import { supabase } from '../lib/supabase';
import type { CaptureStage, OfflineCapture } from '../lib/offlineQueue';

const DUPLICATE = '23505';

/** An error that remembers which of the three writes refused. */
export class SyncFailure extends Error {
  readonly stage: CaptureStage;
  constructor(stage: CaptureStage, message: string) {
    super(message);
    this.name = 'SyncFailure';
    this.stage = stage;
  }
}

export interface SyncResult {
  meetingId: string;
  /** How many lines are now in the triage queue for this meeting. */
  lines: number;
}

export async function syncCapture(capture: OfflineCapture): Promise<SyncResult> {
  const { error: meetingError } = await supabase.from('meetings').insert({
    id: capture.id,
    title: capture.title,
    held_at: capture.heldAt,
    location: capture.location,
    kind: capture.kind,
    priority: 'normal',
    // It was held — that is why there is a minute. The minute itself is a
    // draft until somebody finalises it, which is a separate act.
    status: 'completed',
    minutes_status: 'draft',
    confidentiality: capture.confidentiality,
  });
  if (meetingError && meetingError.code !== DUPLICATE) {
    throw new SyncFailure('meeting', meetingError.message);
  }

  if (capture.minute.trim() !== '') {
    const { error: noteError } = await supabase.from('meeting_notes').upsert(
      {
        meeting_id: capture.id,
        section: 'discussed',
        language: capture.language,
        body: capture.minute,
        is_machine_translation: false,
      },
      { onConflict: 'meeting_id,section,language' },
    );
    if (noteError) throw new SyncFailure('minute', noteError.message);
  }

  if (capture.actionLines.length > 0) {
    const rows = capture.actionLines.map((text, index) => ({
      meeting_id: capture.id,
      sequence: index + 1,
      text_en: capture.language === 'en' ? text : null,
      text_tr: capture.language === 'tr' ? text : null,
      confidentiality: capture.confidentiality,
    }));
    const { error: lineError } = await supabase
      .from('action_candidates')
      .upsert(rows, { onConflict: 'meeting_id,sequence', ignoreDuplicates: true });
    if (lineError) throw new SyncFailure('actions', lineError.message);
  }

  return { meetingId: capture.id, lines: capture.actionLines.length };
}
