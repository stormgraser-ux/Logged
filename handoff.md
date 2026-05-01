# Logged — Handoff

## Current State
**Phase:** Submitted to Chrome Web Store
**Status:** v0.6.0 — Under CWS review (submitted 2026-03-11)

## What's Live
- **All detection:** 5 dedicated platform detectors + universal detector (now opt-in via optional permissions)
- **Full popup UI:** List view, search, filters, inline edit, analytics tab, settings panel
- **Paid tier:** ExtensionPay/Stripe integration, subscription gating, upgrade flows
- **Pro features:** Salary detection, CSV export, analytics dashboard, Gmail parsing
- **Follow-up reminders:** Badge count for stale applications
- **Privacy policy:** Live at https://stormgraser-ux.github.io/Logged/privacy-policy.html
- **GitHub repo:** Public at https://github.com/stormgraser-ux/Logged

## CWS Listing
- Extension ID: `nglogklipppafadihodmedaghaabbhjg`
- Screenshots (3), small promo tile, marquee promo tile uploaded
- All permission justifications submitted
- Privacy policy URL linked
- Support URL: GitHub issues page
- Contact email verified on developer account
- **Status: Submitted for review** — flagged for in-depth review due to broad host permissions (optional_host_permissions). Expected longer review time.

## Architecture
```
src/
  background/
    service-worker.ts         → ExtPay, subscription (session+local cache), gmail, universal detector registration, message router
    gmail.ts                  → OAuth, email scanning, application email parsing
  content/
    detector-base.ts          → Shared utilities + retry-on-failure reporting
    detectors/                → 5 dedicated + 1 universal (dynamically registered)
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

## External Services
- **Chrome Web Store** — Submitted for review
- **ExtensionPay** — `logged-tracker`, Stripe connected, "Logged Pro" ($5/mo)
- **Google Cloud Console** — Gmail API enabled, OAuth consent screen (Testing)
- **GitHub Pages** — Privacy policy hosted from /docs on master

## Next Up
- [ ] Wait for CWS review approval
- [ ] Product Hunt launch prep (listing draft, launch timing)
- [ ] Marketing: Reddit posts (r/jobs, r/cscareerquestions), Show HN
- [ ] Month 2: Deeper Gmail parsing, analytics refinements
