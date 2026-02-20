/**
 * Workday ATS detector (best-effort)
 *
 * Detection strategy:
 * Workday uses React with dynamically generated class names — CSS selectors
 * are unreliable. We use data-automation-id attributes (Workday's most stable
 * pattern) and text matching.
 *
 * Expected catch rate: ~40-50%. Users can use manual add for the rest.
 * This is intentionally conservative to avoid false positives.
 */

import { reportDetection, observeDOM, cleanText } from '../detector-base';
import { extractSalaryFromPage } from '../../shared/salary';

const PLATFORM = 'workday';
let reported = false;
let pendingSubmission = false;

// ── Job data extraction ─────────────────────────────────

function extractJobData(): { company: string; role: string } | null {
  // data-automation-id attributes are Workday's most stable pattern
  const role =
    cleanText(document.querySelector('[data-automation-id="jobPostingHeader"]')?.textContent) ||
    cleanText(document.querySelector('[data-automation-id="jobTitle"]')?.textContent) ||
    cleanText(document.querySelector('h2[data-automation-id]')?.textContent) ||
    '';

  // Company from subdomain: {company}.wd{1-5}.myworkdayjobs.com
  let company = '';
  const hostMatch = location.hostname.match(/^([^.]+)\.wd\d+\.myworkdayjobs\.com$/);
  if (hostMatch) {
    company = hostMatch[1].replace(/[-_]/g, ' ');
  }

  // Try document.title — often "Job Title - Company" or "Company - Job Title"
  const titleMatch = document.title.match(/^(.+?)\s*[-–—]\s*(.+?)$/);
  if (titleMatch) {
    const part1 = titleMatch[1].trim();
    const part2 = titleMatch[2].trim();
    // If we have company from URL, use title for role
    if (company && !role) {
      return { company, role: part1 || part2 };
    }
    // Otherwise try to figure out which is which
    if (!company && !role) {
      return { company: part2, role: part1 };
    }
  }

  // URL path: /job/{job-slug}/{id} → role from slug
  if (!role) {
    const pathMatch = location.pathname.match(/\/job\/([^/]+)/);
    if (pathMatch) {
      const slug = pathMatch[1].replace(/[-_]/g, ' ');
      if (company) return { company, role: slug };
    }
  }

  if (role && company) return { company, role };
  if (role) return { company: company || 'Unknown', role };

  return null;
}

function getJobUrl(): string {
  return location.href;
}

// ── Completion signals ──────────────────────────────────

const COMPLETION_TEXT = [
  'application has been submitted',
  'successfully submitted',
  'thank you for your application',
  'application was submitted successfully',
  'application complete',
  'your application has been received',
  'thanks for applying',
];

function hasCompletionText(node: HTMLElement): boolean {
  const text = cleanText(node.textContent).toLowerCase();
  // Only check reasonably sized text containers to avoid false positives
  if (text.length > 2000 || text.length < 10) return false;
  return COMPLETION_TEXT.some(phrase => text.includes(phrase));
}

function handleCompletion(): void {
  if (reported) return;
  reported = true;

  const jobData = extractJobData();
  if (!jobData) {
    // Try getting cached data from background
    chrome.runtime.sendMessage({ type: 'GET_CACHED_JOB' })
      .then((cached: any) => {
        if (cached?.company && cached?.role) {
          console.log(`[Logged] Workday: got cached job — ${cached.company} / ${cached.role}`);
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
          console.log('[Logged] Workday: completion detected but no job data available');
        }
      })
      .catch(() => {
        console.log('[Logged] Workday: completion detected but could not get cached job');
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
  console.warn('[Logged] Workday detector v0.4 initialized');

  // Cache job data immediately
  const cacheData = () => {
    const jobData = extractJobData();
    if (jobData) {
      console.log(`[Logged] Workday: cached job data — ${jobData.company} / ${jobData.role}`);
      chrome.runtime.sendMessage({
        type: 'CACHE_JOB_DATA',
        payload: {
          company: jobData.company,
          role: jobData.role,
          url: getJobUrl(),
          jk: `wd-${location.pathname.replace(/\//g, '-')}`,
          timestamp: Date.now(),
        },
      }).catch(() => {});
    }
  };

  // Try immediately, then again after a delay (Workday renders async)
  cacheData();
  setTimeout(cacheData, 2000);

  // Watch for submit button clicks
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target) return;

    const submitBtn = target.closest(
      '[data-automation-id="submit"], [data-automation-id="bottom-navigation-next-button"]'
    );
    if (submitBtn) {
      const text = cleanText(submitBtn.textContent).toLowerCase();
      if (text.includes('submit') || text.includes('apply')) {
        console.log('[Logged] Workday: submit button clicked');
        pendingSubmission = true;
        cacheData(); // Re-cache in case data loaded late
      }
    }

    // Broader: any button with "submit application" text
    const btn = target.closest('button');
    if (btn) {
      const text = cleanText(btn.textContent).toLowerCase();
      if (text.includes('submit application') || text === 'submit') {
        console.log(`[Logged] Workday: submit-like button clicked ("${text}")`);
        pendingSubmission = true;
        cacheData();
      }
    }
  }, true);

  // MutationObserver — scan for completion text
  observeDOM(document.body, (mutations) => {
    if (reported) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Check data-automation-id for success indicators
        const automationId = node.getAttribute?.('data-automation-id');
        if (automationId && (
          automationId.includes('success') ||
          automationId.includes('confirmation') ||
          automationId.includes('thankYou')
        )) {
          console.log(`[Logged] Workday: success automation-id detected: ${automationId}`);
          handleCompletion();
          return;
        }

        // Also check children with success automation IDs
        const successChild = node.querySelector?.(
          '[data-automation-id*="success"], [data-automation-id*="confirmation"], [data-automation-id*="thankYou"]'
        );
        if (successChild) {
          console.log('[Logged] Workday: success automation-id found in child');
          handleCompletion();
          return;
        }

        // Text-based detection (requires pending flag for safety)
        if (pendingSubmission && hasCompletionText(node)) {
          console.log('[Logged] Workday: completion text detected after submit');
          handleCompletion();
          return;
        }
      }
    }
  });

  // Poll URL changes (Workday is an SPA)
  let lastUrl = location.href;
  const urlCheck = setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.log('[Logged] Workday: URL changed');
      cacheData();
      // Check if the new URL suggests completion
      const path = location.pathname.toLowerCase();
      if (path.includes('confirmation') || path.includes('thank-you') || path.includes('success')) {
        console.log('[Logged] Workday: completion URL detected');
        handleCompletion();
      }
    }
  }, 1000);
  setTimeout(() => clearInterval(urlCheck), 15 * 60 * 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
