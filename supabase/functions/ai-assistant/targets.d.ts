/**
 * `targets.js`'in tipleri.
 *
 * Tanım orada, düz JS olarak, çünkü aynı dosyayı Deno (edge fonksiyonu) ve
 * Node (testler) de okuyor. Bu dosya yalnızca tarayıcı tarafının onu
 * tipli görmesi için var — ikinci bir tanım değil, aynı tanımın şekli.
 */

export type FieldType =
  'text' | 'longtext' | 'date' | 'enum' | 'boolean' | 'number' | 'profile' | 'stakeholder';

export interface TargetField {
  name: string;
  type: FieldType;
  required?: boolean;
  /** Model dolduramaz; onaylayan kişi seçer. */
  human?: boolean;
  values?: string[];
  min?: number;
  max?: number;
  about: string;
  label: { en: string; tr: string };
}

export interface ProposalTarget {
  key: string;
  table: string;
  label: { en: string; tr: string };
  what: string;
  fields: TargetField[];
}

export const PROPOSAL_TARGETS: ProposalTarget[];
export const PROPOSAL_KEYS: string[];
export function targetFor(key: string): ProposalTarget | null;
export function modelFields(target: ProposalTarget): TargetField[];
export function targetsBriefing(): string;
export function answerSchema(): unknown;
