/**
 * Salary parsing utilities shared by all detectors.
 *
 * Handles common formats: $80,000 - $100,000, $80K-$100K, $25-$35/hr, etc.
 */

/** Parse a salary string from text. Returns a normalized salary range or null. */
export function parseSalary(text: string): string | null {
  if (!text) return null;

  // Range formats: $80,000 - $100,000 | $80K - $100K | $80k/yr - $100k/yr
  const rangeMatch = text.match(
    /\$\s*([\d,]+(?:\.\d+)?)\s*[kK]?\s*(?:\/\s*(?:yr|year|hr|hour|mo|month|annually|hourly))?\s*[-–—to]+\s*\$?\s*([\d,]+(?:\.\d+)?)\s*[kK]?\s*(?:\/\s*(?:yr|year|hr|hour|mo|month|annually|hourly))?/
  );
  if (rangeMatch) {
    const low = normalizeAmount(rangeMatch[1], text);
    const high = normalizeAmount(rangeMatch[2], text);
    const period = detectPeriod(text);
    return `$${low} - $${high}${period}`;
  }

  // Single amount: $80,000/year | $80K | $25/hr
  const singleMatch = text.match(
    /\$\s*([\d,]+(?:\.\d+)?)\s*[kK]?\s*(?:\/\s*(?:yr|year|hr|hour|mo|month|annually|hourly|per\s+(?:year|hour|month)))?/
  );
  if (singleMatch) {
    const amount = normalizeAmount(singleMatch[1], text);
    const period = detectPeriod(text);
    return `$${amount}${period}`;
  }

  return null;
}

function normalizeAmount(raw: string, context: string): string {
  let num = parseFloat(raw.replace(/,/g, ''));
  // If text contains K/k suffix near the number, multiply
  const kPattern = new RegExp(raw.replace(/[,\.]/g, '[,.]?') + '\\s*[kK]');
  if (kPattern.test(context) && num < 1000) {
    num *= 1000;
  }
  // Format with commas
  return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function detectPeriod(text: string): string {
  const lower = text.toLowerCase();
  if (/\/\s*hr|\/\s*hour|per\s+hour|hourly/.test(lower)) return '/hr';
  if (/\/\s*mo|\/\s*month|per\s+month|monthly/.test(lower)) return '/mo';
  if (/\/\s*yr|\/\s*year|per\s+year|annually|annual|salary/.test(lower)) return '/yr';
  return '';
}

/** Scan the page DOM for salary information using common selectors and text patterns. */
export function extractSalaryFromPage(): string | null {
  // 1. Check elements with salary-related selectors
  const selectors = [
    '[class*="salary"]',
    '[class*="Salary"]',
    '[class*="compensation"]',
    '[class*="Compensation"]',
    '[class*="pay-range"]',
    '[class*="payRange"]',
    '[data-testid*="salary"]',
    '[data-testid*="compensation"]',
    '[data-automation-id*="salary"]',
    '[data-automation-id*="basePayRange"]',
  ];

  for (const sel of selectors) {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      const text = el.textContent?.trim();
      if (text) {
        const salary = parseSalary(text);
        if (salary) return salary;
      }
    }
  }

  // 2. Scan text near salary/compensation keywords (first 5000 chars of visible text)
  const bodyText = document.body.innerText?.slice(0, 5000) || '';
  const lines = bodyText.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('salary') || lower.includes('compensation') ||
        lower.includes('pay range') || lower.includes('pay rate') ||
        lower.includes('base pay') || lower.includes('annual') ||
        lower.includes('hourly rate')) {
      const salary = parseSalary(line);
      if (salary) return salary;
    }
  }

  return null;
}
