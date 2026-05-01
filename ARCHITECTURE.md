# Logged — Architecture

> Auto-referenced by Claude when exploring the codebase.
> For orientation and commands, see CLAUDE.md.

## Source Tree

```
src/
  background/
    service-worker.ts         → ExtPay, subscription (session+local cache), gmail, universal detector registration, message router
    gmail.ts                  → OAuth, email scanning, application email parsing
  content/
    detector-base.ts          → Shared utilities + retry-on-failure reporting
    detectors/                → 5 dedicated + 1 universal (dynamically registered)
      linkedin.ts
      indeed.ts
      greenhouse.ts
      lever.ts
      workday.ts
      universal.ts
  popup/
    popup.{html,css,ts}       → Tab switching, pro gating, export, analytics, settings, universal toggle
    analytics.ts              → computeAnalytics() — response rate only counts interviewing/offer
    csv-export.ts             → exportToCSV() with chrome.downloads
  shared/
    types.ts                  → All message types including universal detector management
    storage.ts                → chrome.storage CRUD + dedup
    constants.ts              → Storage keys
    subscription.ts           → SubscriptionState, isFeatureUnlocked()
    salary.ts                 → parseSalary(), extractSalaryFromPage()
public/
  manifest.json               → v0.6.0, scripting perm, optional_host_permissions
docs/
  privacy-policy.html         → Hosted via GitHub Pages
store-assets/                 → CWS screenshots + promo tiles
```

## Data Flow

```
Content scripts (per job platform)
  → Detect application submission events
  → Extract: company, role, date, source URL
  → Send to background service worker

Background service worker
  → Deduplicate (same company + similar role within 24h)
  → Store in chrome.storage
  → Manage follow-up reminder scheduling

Popup / Side panel
  → Clean list view (not kanban)
  → Search, filter by status
  → 4 statuses: Applied → Interviewing → Offer → Closed
  → Manual add fallback for undetected platforms

(Paid tier) Gmail API integration
  → OAuth for "application received" confirmation emails
  → Second detection layer
```

## Platform Detection Priority

1. **LinkedIn** — Highest volume, hardest DOM (dynamic class names). Target 70-80% catch rate.
2. **Indeed** — Second highest volume, more stable DOM.
3. **Greenhouse** — Common ATS, consistent structure.
4. **Lever** — Common ATS, consistent structure.
5. **Workday** — Enterprise ATS, painful DOM but huge employer coverage.
6. **Universal detector** — Opt-in via optional permissions (`https://*/*`), toggled from settings. Catches platforms not explicitly supported. Triggers CWS in-depth review due to broad host permissions.

## Tech Stack

- **Manifest V3** Chrome extension
- **TypeScript compiled via esbuild** — no framework. Popup is ~700 lines of vanilla TS in `src/popup/popup.ts`
- **chrome.storage.local** for all data — sync storage was evaluated and dropped. All reads/writes go through `src/shared/storage.ts`
- **ExtensionPay** for Stripe-based subscriptions
- **Gmail API** (paid tier) for email confirmation parsing

## Monetization

**Free tier (acquisition engine):**
- Passive detection on all supported platforms
- Unlimited job tracking (no cap)
- Simple list view with search + status filters
- Manual add for undetected platforms
- Follow-up nudge: "Applied 7 days ago — follow up?"

**Paid tier ($5/mo) — fully live, all 4 pro features shipped:**
- Gmail confirmation email parsing (backup detection layer)
- Application analytics — velocity, response rate, source effectiveness
- CSV export
- Salary range detection from original posting

**Payment:** ExtensionPay (wraps Stripe, ~20 lines of code, open source) — Stripe connected, product ID `logged-tracker`

## External Services

- **Chrome Web Store** — Submitted for review
- **ExtensionPay** — `logged-tracker`, Stripe connected, "Logged Pro" ($5/mo)
- **Google Cloud Console** — Gmail API enabled, OAuth consent screen (Testing)
- **GitHub Pages** — Privacy policy hosted from /docs on master

## Conventions

- Keep the extension lightweight — no heavy frameworks in the popup
- Content scripts should be surgical — only inject on job platform domains
- Detection logic is per-platform in separate modules (easy to add new platforms)
- Test detection with real job listings, not mocked DOMs (DOMs change constantly)
- Chrome Web Store listing copy matters as much as the code — optimize it

## Marketing Plan (Post-Build)

Distribution channels (in order of priority):
1. **Reddit** — r/jobs, r/cscareerquestions, r/jobsearch. "I built this, it's free, looking for feedback."
2. **Product Hunt** — After polish. 12:01 AM Pacific launch.
3. **Indie Hacker communities** — r/SideProject, IndieHackers.com, HN "Show HN"
4. **SEO blog posts** — "how to track job applications," "best way to organize job search"

**Tone:** Person sharing something useful, not a brand launching a product.
