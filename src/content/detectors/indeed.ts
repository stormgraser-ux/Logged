/**
 * Indeed Apply detector
 *
 * Detection strategy:
 * 1. Cache job data when viewing a listing (multiple triggers)
 * 2. Detect Apply button click → set pendingApplication in storage
 * 3. Detect completion via:
 *    a) Applied indicators on main page (.ia-HasApplied, .applied-snippet, etc.)
 *    b) Wizard completion signals on smartapply/m5.apply domains
 *    c) Pending application + page navigation (user left the apply flow)
 *
 * Indeed Apply opens in new tab on smartapply.indeed.com or m5.apply.indeed.com,
 * BUT some flows (AI interviews, quick apply) stay on indeed.com.
 * ~40% of listings redirect to external ATS (not detectable here).
 */

import { reportDetection, observeDOM, cleanText } from '../detector-base';
import { parseSalary, extractSalaryFromPage } from '../../shared/salary';

const PLATFORM = 'indeed';
let lastDetectedJobKey = '';

// ── Job data extraction ─────────────────────────────────

function extractJobData(): { company: string; role: string } | null {
  const company =
    cleanText(document.querySelector('[data-testid="inlineHeader-companyName"]')?.textContent) ||
    cleanText(document.querySelector('[data-testid="company-name"]')?.textContent) ||
    cleanText(document.querySelector('[data-company-name]')?.textContent) ||
    cleanText(document.querySelector('.jobsearch-InlineCompanyRating-companyHeader a')?.textContent) ||
    cleanText(document.querySelector('.jobsearch-InlineCompanyRating-companyHeader')?.textContent) ||
    cleanText(document.querySelector('.jobsearch-CompanyInfoContainer a')?.textContent) ||
    cleanText(document.querySelector('span.companyName')?.textContent) ||
    // Right pane company name (search results with split view)
    cleanText(document.querySelector('.jobsearch-RightPane [data-testid="company-name"]')?.textContent) ||
    cleanText(document.querySelector('.jobsearch-RightPane [data-company-name]')?.textContent);

  const role =
    cleanText(document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]')?.textContent) ||
    cleanText(document.querySelector('.jobsearch-JobInfoHeader-title')?.textContent) ||
    cleanText(document.querySelector('h1[class*="jobTitle"]')?.textContent) ||
    cleanText(document.querySelector('h2.jobTitle a span')?.textContent) ||
    cleanText(document.querySelector('h2.jobTitle span')?.textContent) ||
    cleanText(document.querySelector('.jcs-JobTitle')?.textContent) ||
    // Right pane title
    cleanText(document.querySelector('.jobsearch-RightPane h2[class*="jobTitle"]')?.textContent);

  if (company && role) return { company, role };

  // Fallback: parse document.title
  // Indeed formats: "Job Title - Company Name | Indeed.com"
  //            or: "Job Title - Company - Location | Indeed.com"
  const titleMatch = document.title.match(/^(.+?)\s*[-–—]\s*(.+?)(?:\s*[-–—]\s*.+?)?\s*\|/);
  if (titleMatch) {
    const parsedRole = titleMatch[1].trim();
    const parsedCompany = titleMatch[2].trim();
    // Sanity check: don't return generic Indeed page titles
    if (parsedRole && parsedCompany &&
        !parsedCompany.toLowerCase().includes('indeed') &&
        !parsedRole.toLowerCase().includes('job search')) {
      console.log(`[Logged] Indeed: extracted from document.title - ${parsedCompany} / ${parsedRole}`);
      return { company: parsedCompany, role: parsedRole };
    }
  }

  return null;
}

function getJobKey(): string {
  const url = new URL(window.location.href);
  // Try URL params first
  const fromUrl = url.searchParams.get('jk') || url.searchParams.get('vjk');
  if (fromUrl) return fromUrl;
  // Try data-jk attribute on job cards
  const card = document.querySelector('[data-jk]');
  if (card) return card.getAttribute('data-jk') || '';
  return '';
}

function getJobUrl(): string {
  const jk = getJobKey();
  if (jk) return `https://www.indeed.com/viewjob?jk=${jk}`;
  return window.location.href;
}

interface CachedJob {
  company: string;
  role: string;
  url: string;
  jk: string;
}

interface PendingApplication extends CachedJob {
  timestamp: number;
}

async function getStorage(key: string): Promise<Record<string, unknown>> {
  // Try session first, but only use it if the key actually exists in the result
  // (session.get() returns {} when key is missing, and {} is truthy in JS)
  try {
    const sessionResult = await chrome.storage.session?.get?.(key);
    if (sessionResult && key in sessionResult) return sessionResult;
  } catch { /* session may not be available */ }
  return await chrome.storage.local.get(key);
}

async function setStorage(data: Record<string, unknown>): Promise<void> {
  try {
    await chrome.storage.session?.set?.(data);
  } catch {
    // Fall back to local
  }
  // Always write to local as backup
  await chrome.storage.local.set(data);
}

function cacheJobData(data: { company: string; role: string }, jk: string): void {
  const jobData: CachedJob = { ...data, url: getJobUrl(), jk };
  console.log(`[Logged] Indeed: cached job data - ${data.company} / ${data.role}`);
  // Primary: send to background service worker (in-memory, no storage issues)
  chrome.runtime.sendMessage({
    type: 'CACHE_JOB_DATA',
    payload: { ...jobData, timestamp: Date.now() },
  }).catch(() => { /* extension context may not be available */ });
  // Backup: also write to local storage
  setStorage({ lastViewedJob: jobData });
}

// Track what we last cached to avoid spamming logs
let lastCachedJk = '';

function tryCacheCurrentJob(): boolean {
  const data = extractJobData();
  if (!data) return false;

  // Use jk if available, otherwise generate a key from company+role
  const jk = getJobKey() || `${data.company}-${data.role}`.replace(/\s+/g, '-').toLowerCase();

  // Only log when the job actually changes
  if (jk !== lastCachedJk) {
    cacheJobData(data, jk);
    lastCachedJk = jk;
  } else {
    // Silently update in case data improved
    const jobData = { ...data, url: getJobUrl(), jk };
    setStorage({ lastViewedJob: jobData });
    chrome.runtime.sendMessage({
      type: 'CACHE_JOB_DATA',
      payload: { ...jobData, timestamp: Date.now() },
    }).catch(() => {});
  }
  return true;
}

// ── Pending application management ───────────────────────

async function setPendingApplication(): Promise<void> {
  // Get cached job data
  const result = await getStorage('lastViewedJob');
  const cached = result.lastViewedJob as CachedJob | undefined;
  if (!cached) {
    console.warn('[Logged] Indeed: Apply clicked but no cached job data');
    return;
  }

  const pending: PendingApplication = {
    ...cached,
    timestamp: Date.now(),
  };
  await setStorage({ pendingIndeedApp: pending });
  console.log(`[Logged] Indeed: pending application set - ${cached.company} / ${cached.role}`);
}

async function checkAndResolvePending(): Promise<void> {
  const result = await getStorage('pendingIndeedApp');
  const pending = result.pendingIndeedApp as PendingApplication | undefined;
  if (!pending) return;

  // Expire after 10 minutes
  const age = Date.now() - pending.timestamp;
  if (age > 10 * 60 * 1000) {
    console.log('[Logged] Indeed: pending application expired (>10 min)');
    await setStorage({ pendingIndeedApp: null as unknown });
    return;
  }

  // We have a pending app and we're on a different page now (home, search, etc.)
  // This means the user went through the apply flow and came back
  const currentJk = getJobKey();
  const isOnSameJob = currentJk === pending.jk && currentJk !== '';
  const isOnJobPage = !!document.querySelector('#jobDescriptionText, .jobsearch-JobInfoHeader-title');

  // If we're NOT on the same job listing anymore, the user likely completed the flow
  if (!isOnSameJob && !isOnJobPage) {
    console.log('[Logged] Indeed: user navigated away after Apply click - confirming application');
    await reportPending(pending);
    return;
  }

  // If we ARE on the same job, check for applied indicators
  if (isOnSameJob) {
    const hasApplied =
      !!document.querySelector('.ia-HasApplied-bodyTop') ||
      !!document.querySelector('[data-testid="applied-snippet"]') ||
      !!document.querySelector('.applied-snippet') ||
      !!document.querySelector('.jobsearch-AppliedContainer');

    if (hasApplied) {
      console.log('[Logged] Indeed: applied indicator found on job page');
      await reportPending(pending);
    }
  }
}

async function reportPending(pending: PendingApplication): Promise<void> {
  if (pending.jk === lastDetectedJobKey) return;
  lastDetectedJobKey = pending.jk;

  // Clear pending
  await setStorage({ pendingIndeedApp: null as unknown });

  reportDetection({
    company: pending.company,
    role: pending.role,
    sourceUrl: pending.url,
    sourcePlatform: PLATFORM,
    notes: '',
    detectedBy: 'auto',
    salary: extractIndeedSalary(),
  });
}

// ── Applied indicator checks ─────────────────────────────

function checkAppliedIndicator(node: HTMLElement): boolean {
  if (node.matches?.('.ia-HasApplied-bodyTop') || node.querySelector?.('.ia-HasApplied-bodyTop')) return true;
  if (node.matches?.('[data-testid="applied-snippet"]') || node.querySelector?.('[data-testid="applied-snippet"]')) return true;
  if (node.matches?.('.applied-snippet') || node.querySelector?.('.applied-snippet')) return true;
  if (node.matches?.('.jobsearch-AppliedContainer') || node.querySelector?.('.jobsearch-AppliedContainer')) return true;
  return false;
}

function checkWizardCompletion(node: HTMLElement): boolean {
  if (node.matches?.('.ia-HasApplied-bodyTop') || node.querySelector?.('.ia-HasApplied-bodyTop')) return true;
  if (node.matches?.('.ia-ThankYou') || node.querySelector?.('.ia-ThankYou')) return true;
  if (node.matches?.('.ia-PostApply') || node.querySelector?.('.ia-PostApply')) return true;
  if (node.matches?.('[data-testid="ia-success"]') || node.querySelector?.('[data-testid="ia-success"]')) return true;
  if (node.matches?.('.ia-success') || node.querySelector?.('.ia-success')) return true;

  const heading = node.matches?.('.ia-BasePage-heading') ? node : node.querySelector?.('.ia-BasePage-heading');
  if (heading) {
    const text = cleanText(heading.textContent).toLowerCase();
    if (text.includes('application submitted') || text.includes("you've applied") ||
        text.includes('thank you for applying') || text.includes('application complete') ||
        text.includes('successfully applied')) {
      return true;
    }
  }

  // Text scan for smaller containers
  if (node.children && node.children.length > 0) {
    const text = cleanText(node.textContent).toLowerCase();
    if ((text.includes('application submitted') || text.includes("you've applied to this job") ||
         text.includes('thank you for applying')) && text.length < 500) {
      return true;
    }
  }

  return false;
}

function extractIndeedSalary(): string | null {
  // Indeed-specific salary selectors
  const salaryEl = document.querySelector('#salaryInfoAndJobType') ||
    document.querySelector('[data-testid="attribute_snippet_testid"]') ||
    document.querySelector('[data-testid="jobsearch-SalaryInfoAndJobType"]') ||
    document.querySelector('.jobsearch-JobMetadataHeader-item');
  if (salaryEl) {
    const salary = parseSalary(salaryEl.textContent || '');
    if (salary) return salary;
  }
  return extractSalaryFromPage();
}

// ── Apply button click listener ──────────────────────────

function watchApplyButton(): void {
  // Use event delegation on the body — catches dynamically added buttons
  document.body.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target) return;

    // Check if click was on or inside an Apply button (broad matching)
    const applyButton = target.closest(
      '#indeedApplyButton, .ia-IndeedApplyButton, .jobsearch-IndeedApplyButton, ' +
      'button[data-indeed-apply-button], button[id*="indeedApply"], ' +
      '[data-testid="indeedApply-button"], [data-testid="applyButton"], ' +
      // Broader: any button whose text says "Apply" on a job page
      'button.jobsearch-ApplyButton, [class*="ApplyButton"], [class*="applyButton"]'
    );

    if (applyButton) {
      console.log('[Logged] Indeed: Apply button clicked!');
      tryCacheCurrentJob();
      setPendingApplication();
      return;
    }

    // Extra broad: any button/link with "apply" in its text on a job detail page
    const clickedButton = target.closest('button, a[role="button"], a[href*="apply"]');
    if (clickedButton) {
      const text = cleanText(clickedButton.textContent).toLowerCase();
      if ((text === 'apply' || text === 'apply now' || text.startsWith('apply on') ||
           text.includes('indeed apply') || text === 'submit application' ||
           text === 'continue applying') && text.length < 40) {
        console.log(`[Logged] Indeed: Apply-like button clicked ("${text}")`);
        tryCacheCurrentJob();
        setPendingApplication();
      }
    }
  }, true); // capture phase to catch before Indeed's own handlers
}

// ── Main page detector (indeed.com) ─────────────────────

function initMainPage(): void {
  console.warn('[Logged] Indeed detector v0.3 initialized (main page)');

  // Check for pending application from a previous page/tab
  setTimeout(() => checkAndResolvePending(), 1000);

  // Try to extract job data immediately
  setTimeout(() => {
    if (tryCacheCurrentJob()) {
      console.log('[Logged] Indeed: extracted job data on init');
    } else {
      console.log('[Logged] Indeed: no job data on init (may be search/home page)');
    }
  }, 500);

  // Watch for Apply button clicks
  watchApplyButton();

  // Poll for job data changes every 3 seconds
  // Indeed is an SPA — the job panel updates without full page navigations
  // This ensures we always have the LATEST viewed job cached
  const dataPoller = setInterval(() => tryCacheCurrentJob(), 3000);
  setTimeout(() => clearInterval(dataPoller), 30 * 60 * 1000);

  // Track URL changes (Indeed is an SPA)
  let lastUrl = location.href;
  const urlCheck = setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.log('[Logged] Indeed: URL changed');
      // Immediate + delayed extraction to catch content that renders after navigation
      tryCacheCurrentJob();
      setTimeout(() => tryCacheCurrentJob(), 500);
      setTimeout(() => tryCacheCurrentJob(), 1500);
      // Also check pending on navigation
      setTimeout(() => checkAndResolvePending(), 2000);
    }
  }, 1000);
  setTimeout(() => clearInterval(urlCheck), 30 * 60 * 1000);

  // Watch for DOM changes
  observeDOM(document.body, (mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.getAttribute?.('data-testid') === 'viewJob-skeleton') {
          setTimeout(() => tryCacheCurrentJob(), 300);
        }
      }

      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        if (node.id === 'jobDescriptionText' || node.querySelector?.('#jobDescriptionText')) {
          setTimeout(() => tryCacheCurrentJob(), 200);
        }

        if (checkAppliedIndicator(node)) {
          console.log('[Logged] Indeed: applied indicator detected on main page');
          handleDirectDetection();
        }
      }
    }
  });

  async function handleDirectDetection(): Promise<void> {
    // Try pending first
    const result = await getStorage('pendingIndeedApp');
    const pending = result.pendingIndeedApp as PendingApplication | undefined;
    if (pending) {
      await reportPending(pending);
      return;
    }

    // Fall back to extracting from page
    const data = extractJobData();
    const cachedResult = await getStorage('lastViewedJob');
    const cached = cachedResult.lastViewedJob as CachedJob | undefined;

    const finalData = data || (cached ? { company: cached.company, role: cached.role } : null);
    if (!finalData) {
      console.log('[Logged] Indeed: applied indicator found but no job data');
      return;
    }

    const jk = getJobKey() || cached?.jk || '';
    if (jk === lastDetectedJobKey && jk !== '') return;
    if (jk) lastDetectedJobKey = jk;

    reportDetection({
      company: finalData.company,
      role: finalData.role,
      sourceUrl: cached?.url || getJobUrl(),
      sourcePlatform: PLATFORM,
      notes: '',
      detectedBy: 'auto',
      salary: extractIndeedSalary(),
    });
  }
}

// ── Wizard detector (smartapply.indeed.com / m5.apply.indeed.com) ────

function initWizard(): void {
  console.warn('[Logged] Indeed Apply wizard detector v0.3 initialized');

  let detected = false;

  observeDOM(document.body, (mutations) => {
    if (detected) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (checkWizardCompletion(node)) {
          console.log('[Logged] Wizard: completion signal detected');
          detected = true;
          handleWizardCompletion();
          return;
        }
      }
    }
  });

  let lastCheckedUrl = '';
  const checkUrl = (): void => {
    const url = window.location.href.toLowerCase();
    if (url === lastCheckedUrl) return;
    lastCheckedUrl = url;
    if (url.includes('post-apply') || url.includes('confirmation') || url.includes('submitted')) {
      if (!detected) {
        console.log('[Logged] Wizard: completion URL detected');
        detected = true;
        handleWizardCompletion();
      }
    }
  };

  const interval = setInterval(checkUrl, 1000);
  setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
}

function extractWizardJobData(): { company: string; role: string } | null {
  // The wizard/submission page often shows the job title and company
  // Try common wizard selectors
  const role =
    cleanText(document.querySelector('.ia-PostApply-header h1')?.textContent) ||
    cleanText(document.querySelector('.ia-HasApplied-jobTitle')?.textContent) ||
    cleanText(document.querySelector('[data-testid="job-title"]')?.textContent);

  const company =
    cleanText(document.querySelector('.ia-PostApply-header .company')?.textContent) ||
    cleanText(document.querySelector('.ia-HasApplied-companyName')?.textContent) ||
    cleanText(document.querySelector('[data-testid="company-name"]')?.textContent);

  if (role && company) return { company, role };

  // Try document.title on wizard page
  // Format might be: "Apply for Job Title at Company | Indeed"
  // or: "Job Title - Company | Indeed Apply"
  const title = document.title;
  const applyMatch = title.match(/Apply\s+(?:for\s+)?(.+?)\s+at\s+(.+?)(?:\s*\||\s*$)/i);
  if (applyMatch) {
    return { role: applyMatch[1].trim(), company: applyMatch[2].trim() };
  }
  const dashMatch = title.match(/^(.+?)\s*[-–—]\s*(.+?)(?:\s*\||\s*$)/);
  if (dashMatch && !dashMatch[2].toLowerCase().includes('indeed')) {
    return { role: dashMatch[1].trim(), company: dashMatch[2].trim() };
  }

  // Scan page text for job/company info near "submitted" or "applied"
  const bodyText = cleanText(document.body.textContent).slice(0, 2000);
  // Look for pattern: "applied to [Role] at [Company]" or "applied for [Role] at [Company]"
  const appliedMatch = bodyText.match(/applied\s+(?:to|for)\s+(.+?)\s+at\s+(.+?)(?:\.|!|\s{2})/i);
  if (appliedMatch) {
    return { role: appliedMatch[1].trim(), company: appliedMatch[2].trim() };
  }

  return null;
}

async function handleWizardCompletion(): Promise<void> {
  let jobData: CachedJob | null = null;

  // PRIMARY: Ask background service worker (in-memory, most reliable)
  try {
    const bgResult = await chrome.runtime.sendMessage({ type: 'GET_CACHED_JOB' });
    if (bgResult && bgResult.company && bgResult.role) {
      jobData = bgResult as CachedJob;
      console.log(`[Logged] Wizard: got job data from background — ${jobData.company} / ${jobData.role}`);
    }
  } catch (e) {
    console.log('[Logged] Wizard: background messaging failed', e);
  }

  // FALLBACK 1: Try chrome.storage.local
  if (!jobData) {
    try {
      const result = await getStorage('lastViewedJob');
      jobData = (result.lastViewedJob as CachedJob) || null;
      if (jobData) console.log(`[Logged] Wizard: got job data from storage — ${jobData.company} / ${jobData.role}`);
    } catch { /* ignore */ }
  }

  // FALLBACK 2: Try pending application
  if (!jobData) {
    try {
      const result = await getStorage('pendingIndeedApp');
      const pending = result.pendingIndeedApp as PendingApplication | undefined;
      if (pending) {
        jobData = pending;
        console.log(`[Logged] Wizard: got job data from pending — ${jobData.company} / ${jobData.role}`);
      }
    } catch { /* ignore */ }
  }

  // FALLBACK 3: Extract from the wizard/submission page itself
  if (!jobData) {
    const wizardData = extractWizardJobData();
    if (wizardData) {
      console.log(`[Logged] Wizard: extracted from wizard page — ${wizardData.company} / ${wizardData.role}`);
      jobData = { ...wizardData, url: window.location.href, jk: `wizard-${Date.now()}` };
    }
  }

  if (!jobData) {
    console.warn('[Logged] Wizard: no job data from any source (background, storage, pending, or page)');
    return;
  }

  if (jobData.jk === lastDetectedJobKey) return;
  lastDetectedJobKey = jobData.jk;

  // Clear any pending
  await setStorage({ pendingIndeedApp: null as unknown });

  reportDetection({
    company: jobData.company,
    role: jobData.role,
    sourceUrl: jobData.url,
    sourcePlatform: PLATFORM,
    notes: '',
    detectedBy: 'auto',
    salary: extractSalaryFromPage(),
  });
}

// ── Init ─────────────────────────────────────────────────

function init(): void {
  const host = window.location.hostname;
  const isWizard = host.includes('smartapply.indeed.com') || host.includes('m5.apply.indeed.com');

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
