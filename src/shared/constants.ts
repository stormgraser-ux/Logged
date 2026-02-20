import type { ApplicationStatus, UserSettings } from './types';

export const STATUS_ORDER: ApplicationStatus[] = [
  'applied',
  'interviewing',
  'offer',
  'closed',
];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  closed: 'Closed',
};

export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  applied: '#3b82f6',      // blue
  interviewing: '#f59e0b',  // amber
  offer: '#10b981',         // emerald
  closed: '#6b7280',        // gray
};

export const DEFAULT_SETTINGS: UserSettings = {
  followUpDays: 7,
  theme: 'system',
};

export const STORAGE_KEYS = {
  APPLICATIONS: 'logged_applications',
  SETTINGS: 'logged_settings',
  SUBSCRIPTION: 'logged_subscription',
  GMAIL_CONNECTED: 'logged_gmail_connected',
  GMAIL_LAST_CHECK: 'logged_gmail_last_check',
} as const;
