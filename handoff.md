# Logged — Handoff

## Current State
**Phase:** Pre-launch hardening
**Status:** v0.6.0 — CWS launch blockers fixed, reliability improvements

## What Changed in v0.6.0

### CWS Blockers Fixed
- **Universal detector → opt-in via optional permissions.** Removed `https://*/*` from manifest `content_scripts`. Now uses `optional_host_permissions` + `chrome.scripting.registerContentScripts()`. Toggle in Settings > Detection. CWS reviewers won't flag this.
- **Privacy policy** created at `docs/privacy-policy.html`. Ready to host on GitHub Pages. Covers local-only storage, Gmail access, no telemetry.
- **Support email** — `homepage_url` added to manifest. Actual support email goes in CWS Developer Dashboard (not a manifest field in MV3).
- **`scripting` permission** added to manifest for dynamic content script registration.

### Reliability Fixes
- **Analytics response rate** — Only counts `interviewing`/`offer` as responses. Previously counted `closed` as a response, which inflated the metric.
- **Service worker cache → `chrome.storage.session`** — `cachedJob` (cross-tab handoff) now survives SW restarts. `cachedSubscription` loads from session storage on startup before async ExtPay refresh.
- **Silent failure handling** — `reportDetection()` in detector-base retries once on sendMessage failure (wakes sleeping SW). Popup `send()` also retries once. Content scripts already had `.catch()` on their sends.

### Screenshots Still Needed
CWS requires 3-4 screenshots. User needs to capture:
1. Popup list view with some applications
2. Analytics tab
3. Settings panel showing detection toggle
4. (Optional) Detection in action on a job site

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
    analytics.ts              → computeAnalytics() — fixed response rate
    csv-export.ts             → exportToCSV() with chrome.downloads
  shared/
    types.ts                  → +3 universal detector message types
    storage.ts                → chrome.storage CRUD + dedup
    constants.ts              → +UNIVERSAL_ENABLED, CACHED_JOB keys
    subscription.ts           → SubscriptionState, isFeatureUnlocked()
    salary.ts                 → parseSalary(), extractSalaryFromPage()
public/
  manifest.json               → v0.6.0, +scripting perm, +optional_host_permissions, -universal from content_scripts
docs/
  privacy-policy.html         → Host on GitHub Pages for CWS listing
test/
  careers/premium-test.html   → Salary extraction + premium feature test
```

## External Services (All Set Up)
- **Chrome Web Store** — Extension ID: `nglogklipppafadihodmedaghaabbhjg` (unlisted, pending CWS developer verification)
- **ExtensionPay** — `logged-tracker` registered, Stripe connected, "Logged Pro" plan ($5/mo) created
- **Stripe** — Test mode confirmed working
- **Google Cloud Console** — Project "Logged Extension", Gmail API enabled, OAuth consent screen configured

## Next Up
- [ ] Take screenshots for CWS listing
- [ ] Host privacy policy on GitHub Pages
- [ ] Set support email in CWS Developer Dashboard
- [ ] Chrome Web Store listing draft + submit
- [ ] Product Hunt launch prep
