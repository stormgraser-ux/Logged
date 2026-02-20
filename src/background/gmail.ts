/**
 * Gmail confirmation email parser (Pro feature).
 *
 * Uses chrome.identity for OAuth and Gmail API to scan for
 * "application received" confirmation emails.
 */

import { addApplication, isDuplicate } from '../shared/storage';
import { STORAGE_KEYS } from '../shared/constants';

export interface GmailStatus {
  connected: boolean;
  lastCheck: string | null;
  error: string | null;
}

// ── OAuth ──────────────────────────────────────────────

export async function connectGmail(): Promise<GmailStatus> {
  try {
    const token = await chrome.identity.getAuthToken({ interactive: true });
    if (!token?.token) {
      return { connected: false, lastCheck: null, error: 'No token returned' };
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.GMAIL_CONNECTED]: true });
    return { connected: true, lastCheck: null, error: null };
  } catch (e: any) {
    console.error('[Logged] Gmail connect failed:', e);
    return { connected: false, lastCheck: null, error: e.message || 'Authentication failed' };
  }
}

export async function disconnectGmail(): Promise<GmailStatus> {
  try {
    const tokenResult = await chrome.identity.getAuthToken({ interactive: false });
    if (tokenResult?.token) {
      await chrome.identity.removeCachedAuthToken({ token: tokenResult.token });
    }
  } catch { /* token may not exist */ }
  await chrome.storage.local.set({
    [STORAGE_KEYS.GMAIL_CONNECTED]: false,
    [STORAGE_KEYS.GMAIL_LAST_CHECK]: null,
  });
  return { connected: false, lastCheck: null, error: null };
}

export async function getGmailStatus(): Promise<GmailStatus> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.GMAIL_CONNECTED,
    STORAGE_KEYS.GMAIL_LAST_CHECK,
  ]);
  return {
    connected: result[STORAGE_KEYS.GMAIL_CONNECTED] === true,
    lastCheck: result[STORAGE_KEYS.GMAIL_LAST_CHECK] || null,
    error: null,
  };
}

// ── Email checking ─────────────────────────────────────

const EMAIL_PATTERNS = [
  /thank you for applying (?:to|for) (?:the )?(.+?) (?:position |role )?at (.+)/i,
  /your application (?:for|to) (.+?) at (.+?) (?:has been|was) received/i,
  /application received[:\s]*(.+?)(?:\s*[-–—|]\s*)(.+)/i,
  /we (?:have )?received your application for (.+?) at (.+)/i,
  /(.+?) [-–—] application received.*?(.+)/i,
];

interface ParsedEmail {
  role: string;
  company: string;
  date: string;
}

function parseApplicationEmail(subject: string, from: string, date: string): ParsedEmail | null {
  // Try subject line patterns
  for (const pattern of EMAIL_PATTERNS) {
    const match = subject.match(pattern);
    if (match) {
      return {
        role: match[1].trim(),
        company: match[2].trim().replace(/[.!]$/, ''),
        date,
      };
    }
  }

  // Try extracting company from sender display name
  // e.g., "Acme Corp <no-reply@acme.com>" → company = "Acme Corp"
  const senderMatch = from.match(/^"?([^"<]+)"?\s*</);
  const senderDomainMatch = from.match(/@([^.]+)\./);
  const senderName = senderMatch?.[1]?.trim();
  const senderDomain = senderDomainMatch?.[1];

  // Check if subject mentions application/applied
  const subjectLower = subject.toLowerCase();
  if (subjectLower.includes('application') || subjectLower.includes('applied') ||
      subjectLower.includes('thank you for your interest')) {
    const company = senderName || senderDomain || null;
    if (company && !['no-reply', 'noreply', 'notifications', 'careers', 'jobs', 'talent'].includes(company.toLowerCase())) {
      return {
        role: 'Unknown Position',
        company,
        date,
      };
    }
  }

  return null;
}

export async function checkForApplicationEmails(): Promise<number> {
  let token: string;
  try {
    const tokenResult = await chrome.identity.getAuthToken({ interactive: false });
    if (!tokenResult?.token) {
      console.log('[Logged] Gmail: no auth token available');
      return 0;
    }
    token = tokenResult.token;
  } catch {
    console.log('[Logged] Gmail: token retrieval failed');
    return 0;
  }

  const query = 'subject:(application OR applied OR received OR confirmation) newer_than:1d -from:me';
  const apiUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`;

  try {
    const listRes = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!listRes.ok) {
      if (listRes.status === 401) {
        // Token expired, clear it
        await chrome.identity.removeCachedAuthToken({ token });
      }
      console.error(`[Logged] Gmail API list error: ${listRes.status}`);
      return 0;
    }

    const listData = await listRes.json();
    const messages = listData.messages || [];

    if (messages.length === 0) {
      console.log('[Logged] Gmail: no matching emails found');
      await updateLastCheck();
      return 0;
    }

    let detected = 0;

    for (const msg of messages) {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!detailRes.ok) continue;

      const detail = await detailRes.json();
      const headers = detail.payload?.headers || [];

      const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
      const from = headers.find((h: any) => h.name === 'From')?.value || '';
      const dateStr = headers.find((h: any) => h.name === 'Date')?.value || '';

      const parsed = parseApplicationEmail(subject, from, dateStr);
      if (!parsed) continue;

      // Dedup with 48h window (emails arrive hours after application)
      if (await isDuplicate(parsed.company, parsed.role, 48)) {
        console.log(`[Logged] Gmail: duplicate — ${parsed.company} / ${parsed.role}`);
        continue;
      }

      const dateApplied = parseEmailDate(parsed.date);

      await addApplication({
        company: parsed.company,
        role: parsed.role,
        status: 'applied',
        dateApplied,
        sourceUrl: '',
        sourcePlatform: 'gmail',
        notes: `Detected from email: "${subject}"`,
        detectedBy: 'auto',
      });

      console.log(`[Logged] Gmail: detected application — ${parsed.company} / ${parsed.role}`);
      detected++;
    }

    await updateLastCheck();
    return detected;
  } catch (e) {
    console.error('[Logged] Gmail check error:', e);
    return 0;
  }
}

function parseEmailDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch { /* ignore */ }
  return new Date().toISOString().split('T')[0];
}

async function updateLastCheck(): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.GMAIL_LAST_CHECK]: new Date().toISOString(),
  });
}
