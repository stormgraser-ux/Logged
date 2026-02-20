# Logged — Handoff

## Current State
**Phase:** Week 4 COMPLETE — ExtensionPay + paid tier features
**Status:** v0.5.0 — Subscription gating, salary detection, CSV export, analytics, Gmail parsing

## What's Built
- **Everything from v0.4.0** (5 detectors + universal + follow-up badge)
- **ExtensionPay integration** — `extpay` npm package, content_script for payment callbacks, subscription state cached in service worker + chrome.storage
- **Subscription gating** — Pro badge in header, upgrade banner for free users, per-feature gate checks via `isFeatureUnlocked()`
- **Salary detection** — `parseSalary()` handles `$80K-$100K`, `$25/hr`, `$120,000-$160,000/yr`. Platform-specific selectors (LinkedIn job insights, Indeed salary elements, Workday automation IDs) + generic `extractSalaryFromPage()` fallback. Always collected, displayed only for Pro users (free users see "Salary (Pro)" locked indicator as upsell).
- **CSV export** — Proper CSV escaping (quotes, commas, newlines), `chrome.downloads.download()` with save-as dialog. Headers: Company, Role, Status, Date, URL, Platform, Salary, Notes, Detected By.
- **Analytics dashboard** — Tab navigation (Applications / Analytics). CSS-only charts: velocity bar chart (8 weeks), response rate progress bar, source effectiveness table, avg days to response. All computed from application data, no chart library.
- **Gmail parsing** — OAuth via `chrome.identity.getAuthToken()`, Gmail API query for confirmation emails (last 24h), regex patterns for "thank you for applying" etc., 48h dedup window, 30-min alarm check. Settings panel with connect/disconnect/check-now buttons.
- **Settings panel** — Gear icon in header opens full overlay with Gmail connection status + subscription info
- **Upgrade flows** — Multiple touchpoints: footer banner, analytics tab gate, export button tooltip, salary locked indicator, settings page. All route to `extpay.openPaymentPage()`.

## Architecture
```
src/
  background/
    service-worker.ts         → ExtPay init, subscription handlers, gmail alarm, message router
    gmail.ts                  → OAuth, email scanning, application email parsing
  content/
    detector-base.ts          → Shared utilities + DetectedApplication (now with salary?)
    detectors/                → All 6 detectors now extract salary
  popup/
    popup.{html,css,ts}       → Tab switching, pro gating, export, analytics, settings
    analytics.ts              → computeAnalytics() pure function
    csv-export.ts             → exportToCSV() with chrome.downloads
  shared/
    types.ts                  → Application (now with salary?), new message types
    storage.ts                → chrome.storage CRUD + dedup
    constants.ts              → Storage keys (SUBSCRIPTION, GMAIL_*)
    subscription.ts           → SubscriptionState, isFeatureUnlocked()
    salary.ts                 → parseSalary(), extractSalaryFromPage()
public/
  manifest.json               → v0.5.0, identity+downloads perms, oauth2, ExtPay content_script
test/
  careers/premium-test.html   → Salary extraction + premium feature test
```

## External Services (All Set Up)
- **Chrome Web Store** — Extension ID: `nglogklipppafadihodmedaghaabbhjg` (unlisted, pending CWS developer verification)
- **ExtensionPay** — `logged-tracker` registered, Stripe connected, "Logged Pro" plan ($5/mo) created
- **Stripe** — Test mode confirmed working (4242 card → subscription active → PRO badge appears)
- **Google Cloud Console** — Project "Logged Extension", Gmail API enabled, OAuth consent screen configured (Testing), OAuth Client ID: `280227723945-66j4q14ihri4qe8du36ue9t6dhng9lcb.apps.googleusercontent.com` (in manifest.json)

## Testing
```bash
cd test && python3 -m http.server 8765
# http://localhost:8765/careers/premium-test.html?gh_jid=456
```
Premium test page exercises: salary extraction ($120K-$160K/yr), universal detection (career path + ATS params), submit confirmation trigger.

## Next Up
- [ ] Chrome Web Store developer account + listing draft
- [ ] Product Hunt launch prep
- [ ] Month 2: Deeper Gmail parsing, analytics refinements, CSV export enhancements
