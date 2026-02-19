/**
 * Indeed Apply detector
 *
 * Detection strategy (from analysis of 5 open-source Indeed automation tools):
 *
 * Indeed has two apply paths:
 * A) "Indeed Apply" — inline wizard, opens on smartapply.indeed.com
 *    - Detectable via `[data-testid="indeedApply"]` badge on job card
 *    - Wizard uses `.ia-BasePage-heading` for step titles
 *    - Success: `.ia-HasApplied-bodyTop` with "You've applied to this job"
 *    - Or URL containing "confirmation" / "submitted"
 *
 * B) External redirect — sends user to employer ATS (Workday, Greenhouse, etc.)
 *    - NOT detectable from Indeed's domain (need separate ATS detectors)
 *    - ~40% of listings use this path
 *
 * This detector handles BOTH:
 * - The main indeed.com page (extracts job data, detects apply click)
 * - The smartapply.indeed.com wizard (detects completion)
 *
 * Stable selectors (priority order):
 * 1. data-testid attributes (most stable)
 * 2. ia-* prefix classes (moderately stable)
 * 3. css-* generated classes (brittle, avoided)
 */

import { reportDetection, observeDOM, cleanText } from '../detector-base';

const PLATFORM = 'indeed';
let lastDetectedJobKey = '';

// ── Job data extraction ─────────────────────────────────

function extractJobData(): { company: string; role: string } | null {
  // data-testid selectors are most stable (confirmed by Oxylabs, Bright Data, meteor314)
  const company =
    cleanText(document.querySelector('[data-testid="company-name"]')?.textContent) ||
    cleanText(document.querySelector('[data-testid="inlineHeader-companyName"]')?.textContent) ||
    cleanText(document.querySelector('[data-company-name="true"]')?.textContent) ||
    cleanText(document.querySelector('.jobsearch-InlineCompanyRating-companyHeader')?.textContent);

  const role =
    cleanText(document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]')?.textContent) ||
    cleanText(document.querySelector('h1[class*="jobTitle"]')?.textContent) ||
    cleanText(document.querySelector('h2.jobTitle span')?.textContent) ||
    cleanText(document.querySelector('.jobsearch-JobInfoHeader-title')?.textContent);

  if (!company || !role) return null;
  return { company, role };
}

function getJobKey(): string {
  const url = new URL(window.location.href);
  return url.searchParams.get('jk') || '';
}

function getJobUrl(): string {
  const jk = getJobKey();
  if (jk) return `https://www.indeed.com/viewjob?jk=${jk}`;
  return window.location.href;
}

// ── Main page detector (indeed.com) ─────────────────────

function initMainPage(): void {
  console.log('[Logged] Indeed detector initialized (main page)');

  // Store job data when the user views a job (before they click Apply)
  // so we have it available when the wizard completes in a new window
  let currentJobData: { company: string; role: string; url: string; jk: string } | null = null;

  // Watch for job detail panel loading (skeleton removal = content ready)
  observeDOM(document.body, (mutations) => {
    for (const mutation of mutations) {
      // Watch for skeleton removal (job detail loaded)
      for (const node of mutation.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.getAttribute?.('data-testid') === 'viewJob-skeleton') {
          // Job detail panel just loaded — extract and cache data
          setTimeout(() => {
            const data = extractJobData();
            const jk = getJobKey();
            if (data && jk) {
              currentJobData = { ...data, url: getJobUrl(), jk };
              // Store in session for the wizard window to pick up
              chrome.storage.session?.set?.({ lastViewedJob: currentJobData }).catch(() => {
                // session storage may not be available, use local
                chrome.storage.local.set({ lastViewedJob: currentJobData });
              });
            }
          }, 200);
        }
      }

      // Watch for "Applied" badge appearing on the page after wizard closes
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Check for the applied indicator
        const appliedEl =
          node.matches?.('.ia-HasApplied-bodyTop') ? node :
          node.querySelector?.('.ia-HasApplied-bodyTop');

        if (appliedEl) {
          console.log('[Logged] Indeed "already applied" indicator detected');
          handleSubmission();
        }

        // Also check for applied snippet on job cards
        const appliedSnippet =
          node.matches?.('[data-testid="applied-snippet"]') ? node :
          node.querySelector?.('[data-testid="applied-snippet"]');

        if (appliedSnippet) {
          console.log('[Logged] Indeed applied snippet detected');
          handleSubmission();
        }
      }
    }
  });

  function handleSubmission(): void {
    const data = extractJobData() || (currentJobData ? { company: currentJobData.company, role: currentJobData.role } : null);
    if (!data) {
      console.log('[Logged] Indeed submission detected but no job data available');
      return;
    }

    const jk = getJobKey() || currentJobData?.jk || '';
    if (jk === lastDetectedJobKey && jk !== '') return;
    if (jk) lastDetectedJobKey = jk;

    reportDetection({
      company: data.company,
      role: data.role,
      sourceUrl: currentJobData?.url || getJobUrl(),
      sourcePlatform: PLATFORM,
      notes: '',
      detectedBy: 'auto',
    });
  }
}

// ── Wizard detector (smartapply.indeed.com) ─────────────

function initWizard(): void {
  console.log('[Logged] Indeed Apply wizard detector initialized');

  // Watch for completion signals in the wizard
  observeDOM(document.body, (mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Signal 1: "You've applied" indicator
        const appliedEl =
          node.matches?.('.ia-HasApplied-bodyTop') ? node :
          node.querySelector?.('.ia-HasApplied-bodyTop');

        if (appliedEl) {
          console.log('[Logged] Wizard: application submitted');
          handleWizardCompletion();
          return;
        }

        // Signal 2: Heading says review/submitted
        const heading =
          node.matches?.('.ia-BasePage-heading') ? node :
          node.querySelector?.('.ia-BasePage-heading');

        if (heading) {
          const text = cleanText(heading.textContent).toLowerCase();
          if (text.includes('application submitted') || text.includes("you've applied")) {
            console.log('[Logged] Wizard: submission heading detected');
            handleWizardCompletion();
            return;
          }
        }
      }
    }
  });

  // Signal 3: URL contains confirmation
  const checkUrl = (): void => {
    const url = window.location.href.toLowerCase();
    if (url.includes('confirmation') || url.includes('submitted')) {
      console.log('[Logged] Wizard: confirmation URL detected');
      handleWizardCompletion();
    }
  };

  // Check URL periodically (wizard may redirect)
  const interval = setInterval(checkUrl, 2000);
  setTimeout(() => clearInterval(interval), 5 * 60 * 1000); // stop after 5 min
}

async function handleWizardCompletion(): Promise<void> {
  // Try to get the job data from storage (set by the main page before wizard opened)
  let jobData: { company: string; role: string; url: string; jk: string } | null = null;

  try {
    const result = await chrome.storage.session?.get?.('lastViewedJob') ||
                   await chrome.storage.local.get('lastViewedJob');
    jobData = result.lastViewedJob || null;
  } catch {
    // Storage access may fail in some contexts
  }

  if (!jobData) {
    console.log('[Logged] Wizard completed but no cached job data');
    return;
  }

  if (jobData.jk === lastDetectedJobKey) return;
  lastDetectedJobKey = jobData.jk;

  reportDetection({
    company: jobData.company,
    role: jobData.role,
    sourceUrl: jobData.url,
    sourcePlatform: PLATFORM,
    notes: '',
    detectedBy: 'auto',
  });
}

// ── Init ─────────────────────────────────────────────────

function init(): void {
  const isWizard = window.location.hostname.includes('smartapply.indeed.com');

  if (isWizard) {
    initWizard();
  } else {
    initMainPage();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
