# Logged

Passive job application tracker Chrome extension. Zero friction — apply to jobs, Logged tracks automatically.

v0.6.0, submitted to Chrome Web Store (in-depth review pending). Repo: https://github.com/stormgraser-ux/Logged

## Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | TS + bundle to `dist/` |
| `npm run watch` | dev mode (inline sourcemaps, auto-rebuild) |
| `npm run clean` | delete `dist/` |

**Test:** Load `dist/` as unpacked extension in `chrome://extensions`. Use `test/index.html` + `test/harness.js` for platform DOM simulation.

## Stack

Manifest V3, TypeScript + esbuild, chrome.storage.local, ExtensionPay/Stripe, Gmail API (paid tier).

## Key Patterns

- **Cross-tab data handoff:** Indeed job key (jk) passes via service worker in-memory vars, not chrome.storage.
- **Dedup is exact match:** company + role, case-insensitive, within 24h.
- **optional_host_permissions:** Universal detector requires `https://*/*` — triggers in-depth CWS review.
- **Test pages first:** `test/` directory has DOM harnesses for all platforms.
- **Scope guard:** every feature must pass "does this reduce friction?"
