import { supabase } from '../lib/supabase';
import { type LegalCase, type CommunicationThread, type DeadlineNotification } from '../types';

// Utility for converting case
const toCamel = (s: string) =>
  s.replace(/([-_][a-z])/gi, ($1) => $1.toUpperCase().replace('-', '').replace('_', ''));
const toSnake = (s: string) => s.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

const keysToCamel = (o: any): any => {
  if (o === Object(o) && !Array.isArray(o) && typeof o !== 'function') {
    const n: any = {};
    Object.keys(o).forEach((k) => {
      n[toCamel(k)] = keysToCamel(o[k]);
    });
    return n;
  } else if (Array.isArray(o)) {
    return o.map((i) => keysToCamel(i));
  }
  return o;
};

const keysToSnake = (o: any): any => {
  if (o === Object(o) && !Array.isArray(o) && typeof o !== 'function') {
    const n: any = {};
    Object.keys(o).forEach((k) => {
      n[toSnake(k)] = keysToSnake(o[k]);
    });
    return n;
  } else if (Array.isArray(o)) {
    return o.map((i) => keysToSnake(i));
  }
  return o;
};

/**
 * The columns, named.
 *
 * `select('*')` would also fetch the three generated search columns 0019
 * adds — the concatenated text of the record and its two stemmed tsvectors.
 * Those exist so the database can match a query without tokenising on every
 * read; sending them to a browser roughly triples the size of a case and
 * tells it nothing it does not already have.
 */
const CASE_COLUMNS = [
  'id',
  'case_number',
  'title',
  'court',
  'case_type',
  'current_status',
  'priority',
  'risk_level',
  'filing_date',
  'next_hearing_date',
  'description_en',
  'description_tr',
  'key_issues',
  'documents_count',
  'lead_counsel_stakeholder_id',
  'confidentiality',
  'source_system',
  'source_id',
  'source_url',
  'created_by',
  'created_at',
  'updated_by',
  'updated_at',
].join(', ');

// Fetchers
export const fetchLegalCases = async (): Promise<LegalCase[]> => {
  const { data, error } = await supabase
    .from('legal_cases')
    .select(CASE_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return keysToCamel(data);
};

export const fetchCommunicationThreads = async (): Promise<CommunicationThread[]> => {
  const { data, error } = await supabase
    .from('communication_threads')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return keysToCamel(data);
};

export const fetchDeadlines = async (): Promise<DeadlineNotification[]> => {
  const { data, error } = await supabase
    .from('deadline_notifications')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return keysToCamel(data);
};

// Mutations
export const addLegalCase = async (data: Partial<LegalCase>) => {
  const payload = keysToSnake(data);
  const { data: inserted, error } = await supabase
    .from('legal_cases')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return keysToCamel(inserted);
};

export const createThread = async (thread: Partial<CommunicationThread>) => {
  const payload = keysToSnake(thread);
  const { data: inserted, error } = await supabase
    .from('communication_threads')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return keysToCamel(inserted);
};

export const addThreadMessage = async ({ threadId, text }: { threadId: string; text: string }) => {
  // We need to fetch the existing thread, append the message, and update it.
  const { data: thread, error: fetchError } = await supabase
    .from('communication_threads')
    .select('messages')
    .eq('id', threadId)
    .single();
  if (fetchError) throw fetchError;

  const existingMessages = thread.messages || [];
  const newMessage = {
    id: Date.now().toString(),
    text,
    sender: 'Current User', // TODO: use actual user
    role: 'executive',
    timestamp: new Date().toISOString(),
  };

  const { data: updated, error } = await supabase
    .from('communication_threads')
    .update({ messages: [...existingMessages, newMessage] })
    .eq('id', threadId)
    .select()
    .single();

  if (error) throw error;
  return keysToCamel(updated);
};
