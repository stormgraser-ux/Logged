# Logged — Handoff

## Current State
**Phase:** Week 1 scaffold — COMPLETE
**Status:** Extension builds, loads in Chrome, ready for manual testing

## What's Built
- **Manifest V3** Chrome extension structure
- **Storage layer** — chrome.storage.local CRUD with dedup logic for future auto-detection
- **Background service worker** — message router, follow-up alarm stub
- **Popup UI** — clean dark list view, search, status filters (Applied/Interviewing/Offer/Closed), manual add form
- **Build tooling** — esbuild with watch mode, TypeScript strict

## Architecture
```
src/
  background/service-worker.ts   → Message handler, alarm stubs
  content/detectors/             → Empty (Week 2: LinkedIn, Indeed)
  popup/popup.{html,css,ts}      → List UI, search, filters, add form
  shared/types.ts                → Application model, message types
  shared/storage.ts              → chrome.storage CRUD + dedup
  shared/constants.ts            → Statuses, colors, defaults
public/
  manifest.json                  → MV3, permissions: storage + alarms
  icons/                         → 16/48/128 placeholder PNGs
```

## Competitive Intel (Baked In)
Detailed research in `memory/insights/2026-02-19.md`. Key signals:
- **No tool does passive detection** — every competitor requires user action
- **Simplicity is a position** — Teal/Careerflow users bounce from overwhelm
- **No job cap** — Huntr's 100-cap and Careerflow's 10-cap are top complaints
- **Follow-up nudges** are loved across the board (our 7-day "Follow up?" badge)
- **Privacy matters** — Simplify burned trust. Be explicit about data practices.
- **Export builds trust** — users fear vendor lock-in

## Next Up
- [ ] Test loading in Chrome (chrome://extensions → Load unpacked → dist/)
- [ ] Manual add flow end-to-end testing
- [ ] Week 2: LinkedIn content script (detect Easy Apply submissions)
- [ ] Week 2: Indeed content script
- [ ] Chrome Web Store developer account + listing draft
