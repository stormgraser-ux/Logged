import {
  getApplications,
  addApplication,
  updateApplication,
  deleteApplication,
  isDuplicate,
  getSettings,
} from '../shared/storage';
import { STORAGE_KEYS } from '../shared/constants';
import type { Message, Application, CachedJobData } from '../shared/types';
import type { SubscriptionState } from '../shared/subscription';
import { DEFAULT_SUBSCRIPTION } from '../shared/subscription';
import {
  connectGmail,
  disconnectGmail,
  getGmailStatus,
  checkForApplicationEmails,
} from './gmail';

// @ts-ignore — ExtPay is a CJS module copied to dist, not bundled
import ExtPay from 'extpay';

// ── ExtensionPay setup ──────────────────────────────────

const extpay = ExtPay('logged-tracker');
extpay.startBackground();

let cachedSubscription: SubscriptionState = { ...DEFAULT_SUBSCRIPTION };

async function refreshSubscription(): Promise<SubscriptionState> {
  try {
    const user = await extpay.getUser();
    cachedSubscription = {
      isPro: user.paid,
      paidAt: user.paidAt ? new Date(user.paidAt).toISOString() : null,
      email: user.email || null,
      plan: (user.plan?.nickname as string) || null,
      subscriptionStatus: user.subscriptionStatus || null,
      lastChecked: new Date().toISOString(),
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.SUBSCRIPTION]: cachedSubscription });
  } catch (e) {
    console.error('[Logged] ExtPay getUser failed:', e);
    // Load from storage as fallback
    const stored = await chrome.storage.local.get(STORAGE_KEYS.SUBSCRIPTION);
    if (stored[STORAGE_KEYS.SUBSCRIPTION]) {
      cachedSubscription = stored[STORAGE_KEYS.SUBSCRIPTION];
    }
  }
  return cachedSubscription;
}

// Listen for payment events
extpay.onPaid.addListener((user: any) => {
  console.log('[Logged] Payment received!', user);
  refreshSubscription();
});

// Initial subscription check
refreshSubscription();

// ── In-memory job data cache (for cross-tab handoff) ─────────

let cachedJob: CachedJobData | null = null;

// ── Message handler ─────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse);
    return true; // keep channel open for async response
  }
);

async function handleMessage(message: Message): Promise<unknown> {
  switch (message.type) {
    case 'GET_APPLICATIONS':
      return await getApplications();

    case 'ADD_APPLICATION':
      return await addApplication(message.payload);

    case 'UPDATE_APPLICATION': {
      const { id, ...updates } = message.payload;
      const result = await updateApplication(id, updates);
      // Status change may affect follow-up count
      if (updates.status) await updateFollowUpBadge();
      return result;
    }

    case 'DELETE_APPLICATION':
      return await deleteApplication(message.payload.id);

    case 'APPLICATION_DETECTED': {
      // Auto-detection path — dedup before adding
      const { company, role } = message.payload;
      if (await isDuplicate(company, role)) {
        return { status: 'duplicate', skipped: true };
      }
      const app = await addApplication({
        ...message.payload,
        status: 'applied',
      });
      // Clear cached job after successful detection
      cachedJob = null;
      // Re-check follow-up badge (new app won't need follow-up, but count display may shift)
      await updateFollowUpBadge();
      return { status: 'added', application: app };
    }

    case 'CACHE_JOB_DATA': {
      cachedJob = message.payload;
      console.log(`[Logged] BG: cached job — ${cachedJob.company} / ${cachedJob.role}`);
      return { status: 'cached' };
    }

    case 'GET_CACHED_JOB': {
      console.log(`[Logged] BG: returning cached job — ${cachedJob ? cachedJob.company + ' / ' + cachedJob.role : 'null'}`);
      return cachedJob;
    }

    // ── Subscription messages ────────────────────────
    case 'GET_SUBSCRIPTION':
      return await refreshSubscription();

    case 'OPEN_PAYMENT_PAGE':
      extpay.openPaymentPage();
      return { status: 'opened' };

    case 'REFRESH_SUBSCRIPTION':
      return await refreshSubscription();

    // ── Gmail messages ───────────────────────────────
    case 'CONNECT_GMAIL':
      return await connectGmail();

    case 'DISCONNECT_GMAIL':
      return await disconnectGmail();

    case 'GET_GMAIL_STATUS':
      return await getGmailStatus();

    case 'CHECK_GMAIL_NOW': {
      const detected = await checkForApplicationEmails();
      const status = await getGmailStatus();
      return { ...status, detected };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// ── Follow-up reminder badge ──────────────────────────────

async function updateFollowUpBadge(): Promise<void> {
  try {
    const apps = await getApplications();
    const settings = await getSettings();
    const now = Date.now();
    const thresholdMs = settings.followUpDays * 24 * 60 * 60 * 1000;

    const needFollowUp = apps.filter(app => {
      if (app.status !== 'applied') return false;
      const appliedTime = new Date(app.dateApplied + 'T00:00:00').getTime();
      return (now - appliedTime) >= thresholdMs;
    });

    const count = needFollowUp.length;
    if (count > 0) {
      await chrome.action.setBadgeText({ text: String(count) });
      await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' }); // amber
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
    console.log(`[Logged] Follow-up badge: ${count} apps need follow-up`);
  } catch (e) {
    console.error('[Logged] Error updating follow-up badge:', e);
  }
}

// Check on startup
updateFollowUpBadge();

// Check every 6 hours
chrome.alarms.create('check-followups', { periodInMinutes: 60 * 6 });
// Gmail check every 30 minutes (only runs if Pro + connected)
chrome.alarms.create('check-gmail', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'check-followups') {
    await updateFollowUpBadge();
  } else if (alarm.name === 'check-gmail') {
    // Only check Gmail if user is Pro and Gmail is connected
    if (!cachedSubscription.isPro) return;
    const gmailStatus = await getGmailStatus();
    if (!gmailStatus.connected) return;
    const detected = await checkForApplicationEmails();
    if (detected > 0) {
      console.log(`[Logged] Gmail alarm: detected ${detected} new applications`);
      await updateFollowUpBadge();
    }
  }
});

console.log('[Logged] Service worker v0.5 initialized');
