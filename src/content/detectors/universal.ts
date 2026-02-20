/**
 * Universal job application detector
 *
 * Lightweight content script that runs on ALL pages but exits in <1ms
 * on anything that doesn't look like a job application page.
 *
 * Only activates when it detects:
 * - ATS-specific URL parameters (gh_jid, lever_source, etc.)
 * - Career-related URL paths (/careers/, /jobs/, /apply/)
 *
 * Skips pages handled by dedicated detectors (LinkedIn, Indeed, etc.)
 * to avoid duplicate detections.
 */

import { reportDetection, observeDOM, cleanText } from '../detector-base';
import { extractSalaryFromPage } from '../../shared/salary';

// ── Early exit checks (keep this FAST) ──────────────────

const host = location.hostname.toLowerCase();
const path = location.pathname.toLowerCase();
const search = location.search.toLowerCase();

// Domains with dedicated detectors — exit immediately
const DEDICATED_DOMAINS = [
  'linkedin.com',
  'indeed.com',
  'greenhouse.io',
  'lever.co',
  'myworkdayjobs.com',
];

const hasDedicatedDetector = DEDICATED_DOMAINS.some(d => host === d || host.endsWith('.' + d));

if (!hasDedicatedDetector) {
  // Check if this page has ANY job application signals
  const hasATSParams =
    search.includes('gh_jid') ||
    search.includes('gh_src') ||
    search.includes('lever_source') ||
    search.includes('requisitionid') ||
    search.includes('ashby_jid') ||
    search.includes('icims');

  const hasCareerPath = /\/(careers?|jobs?|apply|application|openings|positions|recruiting|talent|work-with-us|join-us|join-our-team|vacancies)(\/|$|\?)/.test(path);

  if (hasATSParams || hasCareerPath) {
    initUniversalDetector(hasATSParams);
  }
  // else: exit silently — not a job page
}

// ── Universal detector ──────────────────────────────────

function initUniversalDetector(hasATSParams: boolean): void {
  console.warn(`[Logged] Universal detector v0.4 activated on ${host}${path}`);

  let reported = false;
  let pendingSubmission = false;

  // Cache job data on load
  const jobData = extractJobData();
  if (jobData) {
    console.log(`[Logged] Universal: cached job data — ${jobData.company} / ${jobData.role}`);
    chrome.runtime.sendMessage({
      type: 'CACHE_JOB_DATA',
      payload: {
        company: jobData.company,
        role: jobData.role,
        url: location.href,
        jk: `uni-${host}-${Date.now()}`,
        timestamp: Date.now(),
      },
    }).catch(() => {});
  }

  // Watch ALL form submissions
  document.addEventListener('submit', () => {
    console.log('[Logged] Universal: form submitted');
    pendingSubmission = true;
    // Re-cache in case data loaded late
    const data = extractJobData();
    if (data) {
      chrome.runtime.sendMessage({
        type: 'CACHE_JOB_DATA',
        payload: {
          company: data.company,
          role: data.role,
          url: location.href,
          jk: `uni-${host}-${Date.now()}`,
          timestamp: Date.now(),
        },
      }).catch(() => {});
    }
  }, true);

  // Watch submit/apply button clicks (some forms submit via JS, not <form>)
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target) return;
    const btn = target.closest('button, input[type="submit"], a[role="button"]');
    if (!btn) return;
    const text = cleanText(btn.textContent).toLowerCase();
    if (
      text === 'submit' ||
      text === 'submit application' ||
      text === 'apply' ||
      text === 'apply now' ||
      text === 'send application' ||
      text.includes('submit your application')
    ) {
      console.log(`[Logged] Universal: submit-like button clicked ("${text}")`);
      pendingSubmission = true;
    }
  }, true);

  // MutationObserver for completion signals
  observeDOM(document.body, (mutations) => {
    if (reported) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (hasCompletionSignal(node)) {
          // Require EITHER a pending submission OR strong ATS params
          // to avoid false positives on random pages
          if (pendingSubmission || hasATSParams) {
            console.log('[Logged] Universal: completion signal detected');
            handleCompletion();
            return;
          }
        }
      }
    }
  });

  // Also check existing page content after a delay
  // (covers cases where we injected after the confirmation already appeared)
  setTimeout(() => {
    if (reported) return;
    if (hasCompletionSignal(document.body) && hasATSParams) {
      console.log('[Logged] Universal: completion signal found in existing page content');
      handleCompletion();
    }
  }, 1000);

  // ── Helpers ─────────────────────────────────────────

  function handleCompletion(): void {
    if (reported) return;
    reported = true;

    let finalData = extractJobData();

    if (!finalData) {
      // Try getting cached data from background
      chrome.runtime.sendMessage({ type: 'GET_CACHED_JOB' })
        .then((cached: any) => {
          if (cached?.company && cached?.role) {
            console.log(`[Logged] Universal: got cached job — ${cached.company} / ${cached.role}`);
            reportDetection({
              company: cached.company,
              role: cached.role,
              sourceUrl: cached.url || location.href,
              sourcePlatform: identifyPlatform(),
              notes: '',
              detectedBy: 'auto',
              salary: extractSalaryFromPage(),
            });
          } else {
            console.log('[Logged] Universal: completion detected but no job data');
          }
        })
        .catch(() => {});
      return;
    }

    reportDetection({
      company: finalData.company,
      role: finalData.role,
      sourceUrl: location.href,
      sourcePlatform: identifyPlatform(),
      notes: '',
      detectedBy: 'auto',
      salary: extractSalaryFromPage(),
    });
  }
}

// ── Completion signal detection ─────────────────────────

const COMPLETION_PHRASES = [
  'thank you for applying',
  'thanks for applying',
  'application has been submitted',
  'application has been received',
  'your application was submitted',
  'successfully submitted your application',
  'application submitted successfully',
  'application complete',
  'application received',
  'you have applied',
  "you've applied",
  'we received your application',
  'we have received your application',
];

function hasCompletionSignal(node: HTMLElement): boolean {
  const text = cleanText(node.textContent).toLowerCase();
  // Only check reasonably-sized containers
  if (text.length > 3000 || text.length < 15) return false;
  return COMPLETION_PHRASES.some(phrase => text.includes(phrase));
}

// ── Job data extraction (generic) ───────────────────────

function extractJobData(): { company: string; role: string } | null {
  // Strategy: try multiple generic approaches

  // 1. Open Graph meta tags (many career pages set these)
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');

  // 2. document.title parsing — common patterns:
  //    "Role at Company", "Role - Company", "Company - Role", "Role | Company"
  const title = document.title;

  // Try "at" pattern first (most unambiguous)
  const atMatch = title.match(/^(.+?)\s+at\s+(.+?)(?:\s*[|–—-]\s*|$)/);
  if (atMatch) {
    return { role: atMatch[1].trim(), company: atMatch[2].trim() };
  }

  // Try "Role - Company" or "Company - Role" with og:site_name to disambiguate
  const dashMatch = title.match(/^(.+?)\s*[|–—-]\s*(.+?)(?:\s*[|–—-]\s*|$)/);
  if (dashMatch) {
    const part1 = dashMatch[1].trim();
    const part2 = dashMatch[2].trim();

    // If og:site_name matches one part, the other is the role
    if (ogSiteName) {
      const siteLower = ogSiteName.toLowerCase();
      if (part1.toLowerCase().includes(siteLower) || siteLower.includes(part1.toLowerCase())) {
        return { company: part1, role: part2 };
      }
      if (part2.toLowerCase().includes(siteLower) || siteLower.includes(part2.toLowerCase())) {
        return { company: part2, role: part1 };
      }
    }

    // Heuristic: company names are usually shorter, roles are longer
    // Also check if part2 contains common company suffixes
    if (/\b(inc|corp|ltd|llc|co|company|group|technologies)\b/i.test(part2)) {
      return { role: part1, company: part2 };
    }
    if (/\b(inc|corp|ltd|llc|co|company|group|technologies)\b/i.test(part1)) {
      return { role: part2, company: part1 };
    }

    // Default: assume "Role - Company" (most common pattern)
    return { role: part1, company: part2 };
  }

  // Try og:title with same parsing
  if (ogTitle && ogTitle !== title) {
    const ogAtMatch = ogTitle.match(/^(.+?)\s+at\s+(.+?)$/);
    if (ogAtMatch) {
      return { role: ogAtMatch[1].trim(), company: ogAtMatch[2].trim() };
    }
  }

  // 3. Try h1/h2 for role, company from domain
  const h1 = cleanText(document.querySelector('h1')?.textContent);
  if (h1 && h1.length < 100) {
    const company = ogSiteName || extractCompanyFromDomain();
    if (company) return { role: h1, company };
  }

  // 4. If we have og:site_name but nothing else, use domain + site name
  if (ogSiteName) {
    return { role: 'Unknown Position', company: ogSiteName };
  }

  // 5. Last resort: company from domain
  const domainCompany = extractCompanyFromDomain();
  if (domainCompany) {
    return { role: 'Unknown Position', company: domainCompany };
  }

  return null;
}

function extractCompanyFromDomain(): string {
  // Extract company name from hostname
  // e.g., "careers.carvana.com" → "carvana"
  const parts = host.split('.');
  // Remove TLD and common prefixes
  const filtered = parts.filter(p =>
    !['com', 'org', 'net', 'io', 'co', 'www', 'careers', 'jobs', 'apply', 'hire', 'recruiting'].includes(p)
  );
  return filtered[0] || '';
}

function identifyPlatform(): string {
  // Try to identify which ATS is powering this page
  if (search.includes('gh_jid') || search.includes('gh_src') || search.includes('greenhouse')) return 'greenhouse';
  if (search.includes('lever')) return 'lever';
  if (search.includes('icims')) return 'icims';
  if (search.includes('workday')) return 'workday';
  if (search.includes('ashby')) return 'ashby';
  if (search.includes('taleo') || search.includes('requisitionid')) return 'taleo';

  // Check for ATS indicators in the page
  if (document.querySelector('[data-greenhouse]') || document.querySelector('script[src*="greenhouse"]')) return 'greenhouse';
  if (document.querySelector('[data-lever]') || document.querySelector('script[src*="lever"]')) return 'lever';

  return host; // fallback to domain name
}
