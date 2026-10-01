import { supabase } from '../lib/supabase';
import { type LegalCase } from '../types';

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
