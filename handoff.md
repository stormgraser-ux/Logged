# Logged — Handoff

## Current State
**Phase:** Week 2 — Auto-detection BUILT, needs live testing
**Status:** Extension builds, LinkedIn + Indeed detectors wired

## What's Built
- **Manifest V3** Chrome extension with content scripts
- **Storage layer** — chrome.storage.local CRUD with dedup (24h window)
- **Background service worker** — message router, APPLICATION_DETECTED handler, follow-up alarm stub
- **Popup UI** — dark list view, search, status filters, manual add, inline edit
- **LinkedIn detector** — watches for `h2#post-apply-modal` (Easy Apply confirmation) + toast fallback
- **Indeed detector** — dual-mode: main page (caches job data) + smartapply.indeed.com wizard (completion detection)
- **Build tooling** — esbuild with watch mode, TypeScript strict, zero type errors

## Architecture
```
src/
  background/service-worker.ts        → Message handler, dedup, alarm stubs
  content/
    detector-base.ts                  → Shared utilities (reportDetection, observeDOM, waitForElement)
    detectors/linkedin.ts             → Easy Apply modal → h2#post-apply-modal → report
    detectors/indeed.ts               → Main page + wizard window → .ia-HasApplied-bodyTop → report
  popup/popup.{html,css,ts}           → List UI, search, filters, add form, inline edit
  shared/types.ts                     → Application model, message types
  shared/storage.ts                   → chrome.storage CRUD + dedup
  shared/constants.ts                 → Statuses, colors, defaults
public/
  manifest.json                       → MV3, content_scripts for linkedin.com + indeed.com
  icons/                              → 16/48/128 placeholder PNGs
```

## Detection Architecture
- **LinkedIn:** MutationObserver on document.body → watches for `h2#post-apply-modal` (confirmation heading) or `.artdeco-toast-item` (success toast). Extracts job data from top card selectors with document.title as fallback.
- **Indeed:** Two contexts — main page caches job data to chrome.storage.session on viewjob load, wizard on smartapply.indeed.com reads it back and reports on `.ia-HasApplied-bodyTop` or confirmation URL.
- **Dedup:** Background SW checks company+role within 24h window before adding.

## Key Research (in memory/insights/2026-02-19.md)
- LinkedIn: `h2#post-apply-modal` is the most stable success selector (6 repos confirm)
- Indeed: wizard opens in new window on smartapply.indeed.com (~40% of listings redirect to external ATS)
- document.title parsing is an ultra-reliable fallback for LinkedIn job data
- data-testid attributes are most stable on Indeed; avoid css-* generated classes

## Next Up
- [ ] Live test LinkedIn Easy Apply detection (apply to a real job)
- [ ] Live test Indeed Apply detection
- [ ] Week 3: Greenhouse + Lever + Workday ATS detectors
- [ ] Follow-up reminder notifications (alarm handler)
- [ ] Chrome Web Store developer account + listing draft
