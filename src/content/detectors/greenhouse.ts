/**
 * Greenhouse ATS detector
 *
 * Detection strategy:
 * Greenhouse redirects to a /confirmation URL after submission. This is the
 * single most reliable signal — no DOM mutation watching needed for the primary path.
 *
 * Secondary signal: MutationObserver for "thank you" / "application received" text
 * (covers edge cases where Greenhouse behaves as an SPA).
 *
 * all_frames: true in manifest — Greenhouse is commonly embedded as an iframe
 * on company career pages.
 */

import { reportDetection, observeDOM, cleanText } from '../detector-base';
import { extractSalaryFromPage } from '../../shared/salary';

const PLATFORM = 'greenhouse';
let reported = false;

// ── Job data extraction ─────────────────────────────────

function extractJobData(): { company: string; role: string } | null {
  // Try DOM selectors first
  const role =
    cleanText(document.querySelector('.app-title')?.textContent) ||
    cleanText(document.querySelector('h1.app-title')?.textContent) ||
    cleanText(document.querySelector('h1')?.textContent) ||
    '';

  const company =
    cleanText(document.querySelector('.company-name')?.textContent) ||
    cleanText(document.querySelector('span.company-name')?.textContent) ||
    '';

  if (role && company) return { company, role };

  // Fallback: parse document.title — pattern: "Job Title at Company" or "Company - Job Title"
  const atMatch = document.title.match(/^(.+?)\s+at\s+(.+?)$/);
  if (atMatch) {
    return { role: atMatch[1].trim(), company: atMatch[2].trim() };
  }
  const dashMatch = document.title.match(/^(.+?)\s*[-–—]\s*(.+?)$/);
  if (dashMatch) {
    // Could be "Company - Job Title" or "Job Title - Company"
    // Greenhouse typically does "Company - Job Title"
    return { role: dashMatch[2].trim(), company: dashMatch[1].trim() };
  }

  // Fallback: URL path — boards.greenhouse.io/{company-slug}/jobs/{id}
  const pathMatch = location.pathname.match(/^\/([^/]+)\/jobs\//);
  if (pathMatch && role) {
    const slug = pathMatch[1].replace(/[-_]/g, ' ');
    return { company: slug, role };
  }

  if (role) return { company: 'Unknown', role };

  return null;
}

function getJobUrl(): string {
  // Strip /confirmation from URL to get the original job URL
  return location.href.replace(/\/(confirmation|embed\/job_app\/confirmation).*$/, '');
}

// ── Confirmation detection ──────────────────────────────

function isConfirmationPage(): boolean {
  const path = location.pathname.toLowerCase();
  return path.includes('/confirmation') || path.includes('/embed/job_app/confirmation');
}

const CONFIRMATION_TEXT = [
  'application has been submitted',
  'thank you for applying',
  'thanks for applying',
  'application received',
  'your application has been received',
  'successfully submitted',
  'application complete',
];

function hasConfirmationText(node: HTMLElement): boolean {
  const text = cleanText(node.textContent).toLowerCase();
  if (text.length > 2000) return false; // Skip huge containers
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
          console.log(`[Logged] Greenhouse: got cached job — ${cached.company} / ${cached.role}`);
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
          console.log('[Logged] Greenhouse: confirmation detected but no job data available');
        }
      })
      .catch(() => {
        console.log('[Logged] Greenhouse: confirmation detected but could not get cached job');
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
  console.warn('[Logged] Greenhouse detector v0.4 initialized');

  // PRIMARY: Check if we're already on a confirmation page
  if (isConfirmationPage()) {
    console.log('[Logged] Greenhouse: on confirmation page');
    handleConfirmation();
    return;
  }

  // Not on confirmation page — cache job data for cross-tab handoff
  const jobData = extractJobData();
  if (jobData) {
    console.log(`[Logged] Greenhouse: cached job data — ${jobData.company} / ${jobData.role}`);
    chrome.runtime.sendMessage({
      type: 'CACHE_JOB_DATA',
      payload: {
        company: jobData.company,
        role: jobData.role,
        url: getJobUrl(),
        jk: `gh-${location.pathname.replace(/\//g, '-')}`,
        timestamp: Date.now(),
      },
    }).catch(() => {});
  }

  // Watch for SPA-like URL changes (Greenhouse can navigate without reload)
  let lastUrl = location.href;
  const urlCheck = setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (isConfirmationPage()) {
        console.log('[Logged] Greenhouse: navigated to confirmation page');
        clearInterval(urlCheck);
        handleConfirmation();
      } else {
        // Re-cache job data on navigation
        const data = extractJobData();
        if (data) {
          chrome.runtime.sendMessage({
            type: 'CACHE_JOB_DATA',
            payload: {
              company: data.company,
              role: data.role,
              url: getJobUrl(),
              jk: `gh-${location.pathname.replace(/\//g, '-')}`,
              timestamp: Date.now(),
            },
          }).catch(() => {});
        }
      }
    }
  }, 1000);
  setTimeout(() => clearInterval(urlCheck), 15 * 60 * 1000);

  // SECONDARY: MutationObserver for confirmation text (covers iframe / SPA edge cases)
  observeDOM(document.body, (mutations) => {
    if (reported) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (hasConfirmationText(node)) {
          console.log('[Logged] Greenhouse: confirmation text detected via DOM mutation');
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
