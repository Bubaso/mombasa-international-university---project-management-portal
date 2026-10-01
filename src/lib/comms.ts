/** Labels and shapes for the communication module (M11). */
import type {
  CommChannel,
  CorrespondenceRoute,
  NotificationMedium,
  NotificationTopic,
} from '../types';

export const CHANNELS: { key: CommChannel; tr: string; en: string }[] = [
  { key: 'trustee', tr: 'Mütevelli', en: 'Trustees' },
  { key: 'legal', tr: 'Hukuk', en: 'Legal' },
  { key: 'construction', tr: 'İnşaat', en: 'Construction' },
  { key: 'finance', tr: 'Mali', en: 'Finance' },
  { key: 'official_relations', tr: 'Resmî ilişkiler', en: 'Official relations' },
  { key: 'general', tr: 'Genel', en: 'General' },
];

export const channelName = (key: CommChannel, tr: boolean): string => {
  const found = CHANNELS.find((c) => c.key === key);
  return found ? (tr ? found.tr : found.en) : key;
};

export const TOPICS: { key: NotificationTopic; tr: string; en: string; critical: boolean }[] = [
  // The two the requirement names in parentheses, and the only two the
  // database refuses to switch off.
  { key: 'hearing', tr: 'Duruşma', en: 'Hearing', critical: true },
  { key: 'deadline', tr: 'Son tarih', en: 'Deadline', critical: true },
  { key: 'decision_needed', tr: 'Karar bekleyen', en: 'Awaiting a decision', critical: false },
  { key: 'announcement', tr: 'Duyuru', en: 'Announcement', critical: false },
  { key: 'thread_reply', tr: 'Konuya cevap', en: 'Reply in a thread', critical: false },
  { key: 'digest', tr: 'Haftalık özet', en: 'Weekly digest', critical: false },
  { key: 'site', tr: 'Saha', en: 'Site', critical: false },
  { key: 'money', tr: 'Para', en: 'Money', critical: false },
];

export const MEDIA: { key: NotificationMedium; tr: string; en: string }[] = [
  { key: 'in_app', tr: 'Portal içi', en: 'In the portal' },
  { key: 'email', tr: 'E-posta', en: 'E-mail' },
  { key: 'whatsapp', tr: 'WhatsApp', en: 'WhatsApp' },
  { key: 'push', tr: 'Tarayıcı bildirimi', en: 'Browser push' },
];

export const ROUTES: { key: CorrespondenceRoute; tr: string; en: string }[] = [
  { key: 'letter', tr: 'Resmî yazı', en: 'Letter' },
  { key: 'email', tr: 'E-posta', en: 'E-mail' },
  { key: 'hand_delivery', tr: 'Elden teslim', en: 'By hand' },
  { key: 'courier', tr: 'Kurye', en: 'Courier' },
  { key: 'whatsapp', tr: 'WhatsApp', en: 'WhatsApp' },
  { key: 'portal', tr: 'Portal', en: 'Portal' },
];

export const routeName = (key: CorrespondenceRoute, tr: boolean): string => {
  const found = ROUTES.find((r) => r.key === key);
  return found ? (tr ? found.tr : found.en) : key;
};

export const topicName = (key: NotificationTopic, tr: boolean): string => {
  const found = TOPICS.find((t) => t.key === key);
  return found ? (tr ? found.tr : found.en) : key;
};

export const mediumName = (key: string, tr: boolean): string => {
  const found = MEDIA.find((m) => m.key === key);
  return found ? (tr ? found.tr : found.en) : key;
};
