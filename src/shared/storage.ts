import type { Application, UserSettings } from './types';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from './constants';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

function todayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// ── Applications ────────────────────────────────────────────

export async function getApplications(): Promise<Application[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.APPLICATIONS);
  return result[STORAGE_KEYS.APPLICATIONS] ?? [];
}

export async function addApplication(
  data: Omit<Application, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Application> {
  const apps = await getApplications();
  const now = nowISO();

  const app: Application = {
    ...data,
    id: generateId(),
    dateApplied: data.dateApplied || todayDate(),
    createdAt: now,
    updatedAt: now,
  };

  apps.unshift(app); // newest first
  await chrome.storage.local.set({ [STORAGE_KEYS.APPLICATIONS]: apps });
  return app;
}

export async function updateApplication(
  id: string,
  updates: Partial<Omit<Application, 'id' | 'createdAt'>>
): Promise<Application | null> {
  const apps = await getApplications();
  const idx = apps.findIndex(a => a.id === id);
  if (idx === -1) return null;

  apps[idx] = { ...apps[idx], ...updates, updatedAt: nowISO() };
  await chrome.storage.local.set({ [STORAGE_KEYS.APPLICATIONS]: apps });
  return apps[idx];
}

export async function deleteApplication(id: string): Promise<boolean> {
  const apps = await getApplications();
  const filtered = apps.filter(a => a.id !== id);
  if (filtered.length === apps.length) return false;

  await chrome.storage.local.set({ [STORAGE_KEYS.APPLICATIONS]: filtered });
  return true;
}

/** Check if a similar application already exists (dedup for auto-detection) */
export async function isDuplicate(
  company: string,
  role: string,
  withinHours: number = 24
): Promise<boolean> {
  const apps = await getApplications();
  const cutoff = Date.now() - withinHours * 60 * 60 * 1000;

  return apps.some(app => {
    const appTime = new Date(app.createdAt).getTime();
    if (appTime < cutoff) return false;

    const companyMatch = app.company.toLowerCase().trim() === company.toLowerCase().trim();
    const roleMatch = app.role.toLowerCase().trim() === role.toLowerCase().trim();
    return companyMatch && roleMatch;
  });
}

// ── Settings ────────────────────────────────────────────────

export async function getSettings(): Promise<UserSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] ?? {}) };
}

export async function updateSettings(
  updates: Partial<UserSettings>
): Promise<UserSettings> {
  const current = await getSettings();
  const updated = { ...current, ...updates };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
  return updated;
}
