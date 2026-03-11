/**
 * Base utilities shared by all platform detectors.
 *
 * Each detector is a self-contained content script that:
 * 1. Watches for application submission events on its platform
 * 2. Extracts company, role, URL from the page
 * 3. Sends APPLICATION_DETECTED to the background service worker
 */

export interface DetectedApplication {
  company: string;
  role: string;
  sourceUrl: string;
  sourcePlatform: string;
  notes: string;
  detectedBy: 'auto';
  salary?: string | null;
}

/** Send a detected application to the background service worker (retries once on failure) */
export function reportDetection(data: DetectedApplication): void {
  const msg = { type: 'APPLICATION_DETECTED', payload: data };
  console.log(`[Logged] Detected application: ${data.company} — ${data.role}`);
  chrome.runtime.sendMessage(msg).catch(() => {
    // Service worker may have been idle — retry once to wake it
    setTimeout(() => {
      chrome.runtime.sendMessage(msg)
        .catch((err) => console.warn('[Logged] Detection report failed:', err));
    }, 500);
  });
}

/** Observe DOM mutations, calling `callback` when new nodes are added */
export function observeDOM(
  target: Node,
  callback: (mutations: MutationRecord[]) => void,
  options?: MutationObserverInit,
): MutationObserver {
  const observer = new MutationObserver(callback);
  observer.observe(target, {
    childList: true,
    subtree: true,
    ...options,
  });
  return observer;
}

/** Wait for an element matching a selector to appear in the DOM */
export function waitForElement(
  selector: string,
  timeout = 10000,
  root: Element | Document = document,
): Promise<Element | null> {
  const existing = root.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);

    const observer = new MutationObserver(() => {
      const el = root.querySelector(selector);
      if (el) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(root, { childList: true, subtree: true });
  });
}

/** Clean and trim extracted text, collapsing whitespace */
export function cleanText(str: string | null | undefined): string {
  return (str ?? '').replace(/\s+/g, ' ').trim();
}
