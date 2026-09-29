import { supabase } from '../lib/supabase';
import {
  LegalCase,
  ConstructionBlock,
  DocumentItem,
  FinancialTransaction,
  CommunicationThread,
  TrusteeMember,
  DeadlineNotification
} from '../types';

// Utility for converting case
const toCamel = (s: string) => s.replace(/([-_][a-z])/ig, ($1) => $1.toUpperCase().replace('-', '').replace('_', ''));
const toSnake = (s: string) => s.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

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

// Fetchers
export const fetchLegalCases = async (): Promise<LegalCase[]> => {
  const { data, error } = await supabase.from('legal_cases').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return keysToCamel(data);
};

export const fetchConstructionBlocks = async (): Promise<ConstructionBlock[]> => {
  const { data, error } = await supabase.from('construction_blocks').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return keysToCamel(data);
};

export const fetchDocumentVault = async (): Promise<DocumentItem[]> => {
  const { data, error } = await supabase.from('document_vault').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return keysToCamel(data);
};

export const fetchTransactions = async (): Promise<FinancialTransaction[]> => {
  const { data, error } = await supabase.from('financial_transactions').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return keysToCamel(data);
};

export const fetchCommunicationThreads = async (): Promise<CommunicationThread[]> => {
  const { data, error } = await supabase.from('communication_threads').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return keysToCamel(data);
};

export const fetchTrustees = async (): Promise<TrusteeMember[]> => {
  const { data, error } = await supabase.from('trustee_members').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return keysToCamel(data);
};

export const fetchDeadlines = async (): Promise<DeadlineNotification[]> => {
  const { data, error } = await supabase.from('deadline_notifications').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return keysToCamel(data);
};

// Mutations
export const addLegalCase = async (data: Partial<LegalCase>) => {
  const payload = keysToSnake(data);
  const { data: inserted, error } = await supabase.from('legal_cases').insert(payload).select().single();
  if (error) throw error;
  return keysToCamel(inserted);
};

export const updateConstructionBlock = async ({ id, updates }: { id: string, updates: Partial<ConstructionBlock> }) => {
  const payload = keysToSnake(updates);
  const { data: updated, error } = await supabase.from('construction_blocks').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return keysToCamel(updated);
};

export const addDocument = async (doc: Partial<DocumentItem>) => {
  const payload = keysToSnake(doc);
  const { data: inserted, error } = await supabase.from('document_vault').insert(payload).select().single();
  if (error) throw error;
  return keysToCamel(inserted);
};

export const addTransaction = async (tx: Partial<FinancialTransaction>) => {
  const payload = keysToSnake(tx);
  const { data: inserted, error } = await supabase.from('financial_transactions').insert(payload).select().single();
  if (error) throw error;
  return keysToCamel(inserted);
};

export const createThread = async (thread: Partial<CommunicationThread>) => {
  const payload = keysToSnake(thread);
  const { data: inserted, error } = await supabase.from('communication_threads').insert(payload).select().single();
  if (error) throw error;
  return keysToCamel(inserted);
};

export const addThreadMessage = async ({ threadId, text }: { threadId: string, text: string }) => {
  // We need to fetch the existing thread, append the message, and update it.
  const { data: thread, error: fetchError } = await supabase.from('communication_threads').select('messages').eq('id', threadId).single();
  if (fetchError) throw fetchError;
  
  const existingMessages = thread.messages || [];
  const newMessage = {
    id: Date.now().toString(),
    text,
    sender: 'Current User', // TODO: use actual user
    role: 'executive',
    timestamp: new Date().toISOString()
  };
  
  const { data: updated, error } = await supabase.from('communication_threads')
    .update({ messages: [...existingMessages, newMessage] })
    .eq('id', threadId)
    .select()
    .single();
    
  if (error) throw error;
  return keysToCamel(updated);
};

export const dismissDeadline = async (id: string) => {
  const { data: deleted, error } = await supabase.from('deadline_notifications').delete().eq('id', id).select().single();
  if (error) throw error;
  return keysToCamel(deleted);
};
