/**
 * Lever ATS detector
 *
 * Detection strategy:
 * Lever does NOT redirect after submission. The page content swaps in-place
 * to a success/thank-you state on the same URL. Must use MutationObserver.
 *
 * Flow:
 * 1. Extract + cache job data from listing page
 * 2. Listen for form submit events → set pendingSubmission flag
 * 3. MutationObserver on body → check added nodes for confirmation signals
 * 4. On confirmation + pending flag → report detection
 *
 * all_frames: true in manifest — Lever can appear in iframes on company sites.
 */

import { reportDetection, observeDOM, cleanText } from '../detector-base';
import { extractSalaryFromPage } from '../../shared/salary';

const PLATFORM = 'lever';
let reported = false;
let pendingSubmission = false;

// ── Job data extraction ─────────────────────────────────

function extractJobData(): { company: string; role: string } | null {
  // Try structured selectors
  const role =
    cleanText(document.querySelector('.posting-headline h2')?.textContent) ||
    cleanText(document.querySelector('[data-qa="posting-name"]')?.textContent) ||
    cleanText(document.querySelector('h2')?.textContent) ||
    '';

  // Company from URL path: jobs.lever.co/{company-slug}/{posting-id}
  let company = '';
  const pathMatch = location.pathname.match(/^\/([^/]+)\//);
  if (pathMatch) {
    // Convert slug to readable name: "acme-corp" → "acme corp"
    company = pathMatch[1].replace(/[-_]/g, ' ');
  }

  // Try document.title — pattern: "Company - Job Title"
  const titleMatch = document.title.match(/^(.+?)\s*[-–—]\s*(.+?)$/);
  if (titleMatch) {
    const titleCompany = titleMatch[1].trim();
    const titleRole = titleMatch[2].trim();
    // Lever typically does "Company - Job Title"
    if (!titleCompany.toLowerCase().includes('lever')) {
      return {
        company: titleCompany || company,
        role: titleRole || role,
      };
    }
  }

  if (role && company) return { company, role };
  if (role) return { company: 'Unknown', role };

  return null;
}

function getJobUrl(): string {
  return location.href;
}

// ── Confirmation detection ──────────────────────────────

const CONFIRMATION_SELECTORS = [
  '.application-confirmation',
  '[data-qa="msg-submit-success"]',
  '[data-qa="application-confirmation"]',
  '.posting-apply-confirmation',
];

const CONFIRMATION_TEXT = [
  'application has been submitted',
  'thanks for applying',
  'thank you for your application',
  'thank you for applying',
  'your application has been received',
  'successfully submitted',
  'application received',
];

function isConfirmationNode(node: HTMLElement): boolean {
  // Check selectors
  for (const sel of CONFIRMATION_SELECTORS) {
    if (node.matches?.(sel) || node.querySelector?.(sel)) return true;
  }

  // Check text content
  const text = cleanText(node.textContent).toLowerCase();
  if (text.length > 2000) return false;
  return CONFIRMATION_TEXT.some(phrase => text.includes(phrase));
}

function handleConfirmation(): void {
  if (reported) return;
  reported = true;

  const jobData = extractJobData();
  if (!jobData) {
    // Try getting cached data from background
    chrome.runtime.sendMessage({ type: 'GET_CACHED_JOB' })
      .then((cached: any) => {
        if (cached?.company && cached?.role) {
          console.log(`[Logged] Lever: got cached job — ${cached.company} / ${cached.role}`);
          reportDetection({
            company: cached.company,
            role: cached.role,
            sourceUrl: cached.url || getJobUrl(),
            sourcePlatform: PLATFORM,
            notes: '',
            detectedBy: 'auto',
            salary: extractSalaryFromPage(),
          });
        } else {
          console.log('[Logged] Lever: confirmation detected but no job data available');
        }
      })
      .catch(() => {
        console.log('[Logged] Lever: confirmation detected but could not get cached job');
      });
    return;
  }

  reportDetection({
    company: jobData.company,
    role: jobData.role,
    sourceUrl: getJobUrl(),
    sourcePlatform: PLATFORM,
    notes: '',
    detectedBy: 'auto',
    salary: extractSalaryFromPage(),
  });
}

// ── Init ─────────────────────────────────────────────────

function init(): void {
  console.warn('[Logged] Lever detector v0.4 initialized');

  // Cache job data immediately
  const jobData = extractJobData();
  if (jobData) {
    console.log(`[Logged] Lever: cached job data — ${jobData.company} / ${jobData.role}`);
    chrome.runtime.sendMessage({
      type: 'CACHE_JOB_DATA',
      payload: {
        company: jobData.company,
        role: jobData.role,
        url: getJobUrl(),
        jk: `lever-${location.pathname.replace(/\//g, '-')}`,
        timestamp: Date.now(),
      },
    }).catch(() => {});
  }

  // Check if confirmation content is already on the page (e.g. page restored from bfcache)
  for (const sel of CONFIRMATION_SELECTORS) {
    if (document.querySelector(sel)) {
      console.log('[Logged] Lever: confirmation content already present');
      handleConfirmation();
      return;
    }
  }

  // Listen for form submissions (capture phase to catch before Lever's handlers)
  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement;
    // Lever's apply form is typically the main/only form on the page
    if (form && form.tagName === 'FORM') {
      console.log('[Logged] Lever: form submitted');
      pendingSubmission = true;
      // Re-cache in case data loaded late
      const data = extractJobData();
      if (data) {
        chrome.runtime.sendMessage({
          type: 'CACHE_JOB_DATA',
          payload: {
            company: data.company,
            role: data.role,
            url: getJobUrl(),
            jk: `lever-${location.pathname.replace(/\//g, '-')}`,
            timestamp: Date.now(),
          },
        }).catch(() => {});
      }
    }
  }, true);

  // Also catch click on submit/apply buttons (some forms use JS submission)
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target) return;

    const btn = target.closest(
      'button[type="submit"], [data-qa="btn-submit"], .postings-btn-submit, ' +
      'a.postings-btn, button.postings-btn'
    );
    if (btn) {
      const text = cleanText(btn.textContent).toLowerCase();
      if (text.includes('submit') || text.includes('apply')) {
        console.log('[Logged] Lever: submit/apply button clicked');
        pendingSubmission = true;
      }
    }
  }, true);

  // MutationObserver — watch for confirmation DOM swap
  observeDOM(document.body, (mutations) => {
    if (reported) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        if (isConfirmationNode(node)) {
          if (pendingSubmission) {
            console.log('[Logged] Lever: confirmation detected after form submit');
            handleConfirmation();
            return;
          }
          // Even without pending flag, a confirmation node is strong enough signal
          console.log('[Logged] Lever: confirmation detected (no pending flag)');
          handleConfirmation();
          return;
        }
      }
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
