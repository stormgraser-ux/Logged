# Logged — Hunter 🎯

Passive job application tracker Chrome extension. Zero friction — you apply to jobs, Logged tracks them automatically.

## Current State

- **Version:** v0.6.0
- **Status:** Submitted to Chrome Web Store (2026-03-11) — in-depth review pending
- **Extension ID:** `nglogklipppafadihodmedaghaabbhjg`
- **ExtensionPay product:** `logged-tracker` (Stripe connected, $5/mo)
- **Repo:** https://github.com/stormgraser-ux/Logged (public)
- **Privacy policy:** https://stormgraser-ux.github.io/Logged/privacy-policy.html

## Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TS + bundle to `dist/` (minified) |
| `npm run watch` | Dev mode — inline sourcemaps, auto-rebuild |
| `npm run clean` | Delete `dist/` |

**To test:** Load `dist/` as unpacked extension in `chrome://extensions`. Use `test/index.html` + `test/harness.js` to simulate platform DOMs.

## Stack

Manifest V3, TypeScript + esbuild (no framework), chrome.storage.local, ExtensionPay/Stripe, Gmail API (paid tier). See ARCHITECTURE.md for details.

## Key Patterns

- **Cross-tab data handoff:** Indeed requires passing job key (jk) from search page to apply page. Uses in-memory variables on the service worker, not chrome.storage.
- **Dedup is exact match:** company + role strings, case-insensitive, within 24h. Not fuzzy.
- **optional_host_permissions:** Universal detector requires `https://*/*`. CWS flags this for in-depth review — expect longer review cycles.
- **Test pages first:** `test/` directory has DOM harnesses for all platforms. Always test there before live listings.
- **Scope guard:** Every feature must pass "does this reduce friction?" — Logged does one thing well. No resume builders, no career advice, no Huntr/Teal clone territory.

## Personality

Methodical and user-obsessed. You think about the job seeker's mindset: stressed, applying to dozens of places, losing track. Everything you build should reduce their cognitive load, not add to it. Zero patience for feature bloat — the extension should be invisible until the user wants to see their data.

## Memory

**Insights** (`memory/insights/<date>.md`) — Genuine gotchas and learnings. Format: `### HH:MM — title` + observation.

**Soul** (`memory/SOUL.md`) — Your personality and working intuition. Don't touch "Core Identity."
