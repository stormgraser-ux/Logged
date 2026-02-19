/**
 * LinkedIn Easy Apply detector
 *
 * Detection strategy (from analysis of 6 open-source LinkedIn automation tools):
 *
 * Primary signal: `h2#post-apply-modal` — a stable heading element that appears
 * when LinkedIn shows the "Application sent" confirmation. This is the most
 * reliable single selector across all implementations analyzed.
 *
 * Secondary signal: `.artdeco-toast-item` containing "application" + "sent/submitted"
 *
 * Job data extraction priority:
 * 1. Job detail top card selectors (multiple fallbacks for version changes)
 * 2. document.title — LinkedIn sets it to "[Title] at [Company] | LinkedIn"
 *
 * Known challenges:
 * - SPA: No page reloads on navigation (handled via MutationObserver on URL)
 * - CSS classes use `artdeco-` design system (relatively stable) + `jobs-` prefixed
 * - LinkedIn uses Ember.js — elements can be re-rendered on state changes
 * - No Shadow DOM used (confirmed across all implementations)
 */

import { reportDetection, observeDOM, cleanText } from '../detector-base';

const PLATFORM = 'linkedin';
let lastDetectedUrl = '';
let lastUrl = location.href;

// ── Job data extraction ─────────────────────────────────

/** Try multiple selectors in priority order (LinkedIn renames classes across versions) */
function trySelectors(selectors: string[]): string {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const text = cleanText(el?.textContent);
    if (text) return text;
  }
  return '';
}

function extractJobData(): { company: string; role: string } | null {
  // Try structured selectors first
  const role = trySelectors([
    '.job-details-jobs-unified-top-card__job-title a',
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title a',
    '.jobs-unified-top-card__job-title',
    '.job-card-list__title--link',
    '.job-card-list__title',
    '.artdeco-entity-lockup__title',
    'h1.t-24',
    'h1.t-20',
  ]);

  const company = trySelectors([
    '.job-details-jobs-unified-top-card__company-name a',
    '.job-details-jobs-unified-top-card__company-name',
    '.jobs-unified-top-card__company-name a',
    '.jobs-unified-top-card__company-name',
    '.job-card-container__primary-description',
    '.job-card-container__company-name',
  ]);

  if (role && company) return { company, role };

  // Fallback: parse document.title — format is "[Title] at [Company] | LinkedIn"
  const titleMatch = document.title.match(/^(.+?)\s+at\s+(.+?)\s*\|/);
  if (titleMatch) {
    return {
      role: titleMatch[1].trim(),
      company: titleMatch[2].trim(),
    };
  }

  // Fallback: artdeco-entity-lockup__subtitle contains "Company · Location"
  const subtitle = trySelectors(['.artdeco-entity-lockup__subtitle']);
  if (subtitle && role) {
    const parts = subtitle.split('·');
    if (parts.length > 0) {
      return { company: parts[0].trim(), role };
    }
  }

  return null;
}

function getJobUrl(): string {
  // Try to extract from URL if on a /jobs/view/ page
  const viewMatch = location.href.match(/\/jobs\/view\/(\d+)/);
  if (viewMatch) return `https://www.linkedin.com/jobs/view/${viewMatch[1]}/`;

  // Try from job card data attribute
  const card = document.querySelector('li[data-occludable-job-id]');
  const jobId = card?.getAttribute('data-occludable-job-id');
  if (jobId) return `https://www.linkedin.com/jobs/view/${jobId}/`;

  // Try from a title link
  const link = document.querySelector<HTMLAnchorElement>(
    '.job-details-jobs-unified-top-card__job-title a, .jobs-unified-top-card__job-title a'
  );
  if (link?.href) return link.href;

  return location.href;
}

// ── Submission detection ────────────────────────────────

function handleApplicationSubmitted(): void {
  const jobData = extractJobData();
  if (!jobData) {
    console.log('[Logged] Application confirmed but could not extract job data');
    return;
  }

  const url = getJobUrl();

  // Dedup: don't report the same URL twice in one page session
  if (url === lastDetectedUrl) return;
  lastDetectedUrl = url;

  reportDetection({
    company: jobData.company,
    role: jobData.role,
    sourceUrl: url,
    sourcePlatform: PLATFORM,
    notes: '',
    detectedBy: 'auto',
  });
}

// ── Main observer ───────────────────────────────────────

function init(): void {
  console.log('[Logged] LinkedIn detector initialized');

  observeDOM(document.body, (mutations) => {
    // Track SPA navigation
    if (location.href !== lastUrl) {
      lastUrl = location.href;
    }

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // PRIMARY: Watch for the "Application sent" confirmation heading
        // h2#post-apply-modal is the most stable success indicator across
        // all analyzed implementations (s00ar, Azoo92i, GodsScion, davidwarshawsky)
        const confirmHeading =
          (node.id === 'post-apply-modal' ? node : null) ||
          node.querySelector?.('h2#post-apply-modal');

        if (confirmHeading) {
          console.log('[Logged] Application sent confirmation detected');
          handleApplicationSubmitted();
          continue;
        }

        // SECONDARY: Watch for success toast notification
        const toast =
          node.matches?.('.artdeco-toast-item') ? node :
          node.querySelector?.('.artdeco-toast-item');

        if (toast) {
          const text = cleanText(toast.textContent).toLowerCase();
          if (text.includes('application') && (text.includes('sent') || text.includes('submitted'))) {
            console.log('[Logged] Application toast detected');
            handleApplicationSubmitted();
          }
        }
      }
    }
  });
}

// LinkedIn is an SPA — content script fires once on initial load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
