import type { Language, UserRole } from '../types';
import { wordFor } from './labels';

/**
 * Display names for the thirteen roles. The roles themselves are defined in
 * the database (app_role); this is only how they are read out to a person.
 */
const ROLE_LABELS: Record<UserRole, { tr: string; en: string }> = {
  admin: { tr: 'Sistem Yöneticisi', en: 'System Administrator' },
  project_director: { tr: 'Proje Direktörü', en: 'Project Director' },
  field_team: { tr: 'Saha Ekibi', en: 'Field Team' },
  trustee: { tr: 'Mütevelli', en: 'Trustee' },
  board_director: { tr: 'Yönetim Kurulu Üyesi', en: 'Board Director' },
  audit_committee: { tr: 'Denetim Komitesi', en: 'Audit Committee' },
  legal_counsel: { tr: 'Hukuk Müşaviri', en: 'Legal Counsel' },
  contractor: { tr: 'Müteahhit', en: 'Contractor' },
  quantity_surveyor: { tr: 'Metraj Uzmanı', en: 'Quantity Surveyor' },
  external_auditor: { tr: 'Bağımsız Denetçi', en: 'External Auditor' },
  donor: { tr: 'Bağışçı', en: 'Donor' },
  observer: { tr: 'Gözlemci', en: 'Observer' },
  consultant: { tr: 'Danışman', en: 'Consultant' },
};

export function roleLabel(role: UserRole, language: Language): string {
  return wordFor(ROLE_LABELS, role, language);
}
