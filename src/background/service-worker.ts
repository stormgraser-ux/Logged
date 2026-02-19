import {
  getApplications,
  addApplication,
  updateApplication,
  deleteApplication,
  isDuplicate,
} from '../shared/storage';
import type { Message, Application } from '../shared/types';

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
      return await updateApplication(id, updates);
    }

    case 'DELETE_APPLICATION':
      return await deleteApplication(message.payload.id);

    case 'APPLICATION_DETECTED': {
      // Auto-detection path (Week 2+) — dedup before adding
      const { company, role } = message.payload;
      if (await isDuplicate(company, role)) {
        return { status: 'duplicate', skipped: true };
      }
      const app = await addApplication({
        ...message.payload,
        status: 'applied',
      });
      return { status: 'added', application: app };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// ── Follow-up reminder alarm (stub for Week 1) ─────────────

chrome.alarms.create('check-followups', { periodInMinutes: 60 * 6 }); // every 6 hours

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'check-followups') return;
  // Week 3: Check for apps where dateApplied + followUpDays < now
  // and badge the extension icon with count
});

console.log('[Logged] Service worker initialized');
