---
name: wms-app-release-update
description: >-
  Standard blueprint and CLI workflow for WMS Application Versioning, Release
  Notes (Changelog), FAQ Synchronization check, and Multi-User Safe OTA Updates
  across active logged-in sessions (Store, Gudang, Packing, Produksi, HR,
  Superadmin). Activate whenever deploying frontend changes or modifying
  PWA/Service Worker/Update components.
---

# WMS Application Release, Versioning & Multi-User Safe Update Skill

## Overview

This skill governs how the WMS Inventory application manages version numbers (`v2.5.x`), release notes (`VERSION_HISTORY`), role-aware FAQ synchronization (`initialStoreFaq.ts`), Service Worker lifecycle, and non-disruptive OTA updates for dozens of concurrently logged-in users across Store, Gudang, Packing, Produksi, HR, and Superadmin roles.

## Dependencies

- **`pre-task-sync`** ([`.agents/skills/pre-task-sync/SKILL.md`](file:///d:/Antigravity/WMS%20Inventory/.agents/skills/pre-task-sync/SKILL.md)): Must be executed before starting any code or release workflow (`git pull --rebase` and `node tools/gas_status.cjs`).
- **`auto-deploy`** ([`.agents/skills/auto-deploy/SKILL.md`](file:///d:/Antigravity/WMS%20Inventory/.agents/skills/auto-deploy/SKILL.md)): Coordinates the full build, GAS check, Git push, and `### 🚀 Deployment Status` reporting table.
- **`wms-performance-anti-freeze`** ([`.agents/skills/wms-performance-anti-freeze/SKILL.md`](file:///d:/Antigravity/WMS%20Inventory/.agents/skills/wms-performance-anti-freeze/SKILL.md)): Ensures modified views are audited for main-thread freeze hazards prior to bumping a release.
- **`wms-ui-ux-design-system`** ([`.agents/skills/wms-ui-ux-design-system/SKILL.md`](file:///d:/Antigravity/WMS%20Inventory/.agents/skills/wms-ui-ux-design-system/SKILL.md)): Enforces `font-mono` badges, semantic colors, and role-aware perspectives in `AppUpdateModal` and `initialStoreFaq.ts`.
- **`wms-responsive-desktop-mobile`** ([`.agents/skills/wms-responsive-desktop-mobile/SKILL.md`](file:///d:/Antigravity/WMS%20Inventory/.agents/skills/wms-responsive-desktop-mobile/SKILL.md)): Ensures update banners and modals remain touch-friendly on handheld scanners/phones and clean on desktop.

## Quick Start

Before running `npm run build` and pushing frontend changes in `src/` to `origin/main`, bump the version and verify multi-user release safety:

```bash
node tools/bump_version.cjs bump --title "WMS v2.5.x — Ringkasan Fitur" --notes "Poin 1|Poin 2" --output C:/Users/Chocochips\ Warehouse/.gemini/antigravity/brain/release_bump.json
node tools/bump_version.cjs verify-release --output C:/Users/Chocochips\ Warehouse/.gemini/antigravity/brain/release_verify.json
```

## Utility Scripts

### `tools/bump_version.cjs`

1. **`bump` Subcommand** — Atomically increments `package.json`, `src/config/appVersion.ts` (including `VERSION_HISTORY`), and `public/version.json`:
   ```bash
   node tools/bump_version.cjs bump \
     --title "WMS v2.5.x — <Judul Singkat Rilis>" \
     --notes "<Catatan Rilis 1>|<Catatan Rilis 2>|<Catatan Rilis 3>" \
     --output <path/to/release_bump.json>
   ```
   - Optional flags: `--minor`, `--major`, `--version v2.5.9`, `--sync-only`.

2. **`verify-release` Subcommand** — Validates version parity across all 3 files, checks Multi-User Safe SW rules (`skipWaiting: false`, no forced `window.location.reload()` in `onNeedRefresh`), and checks whether Order/Resolusi workflow changes require an FAQ update in `src/data/initialStoreFaq.ts`:
   ```bash
   node tools/bump_version.cjs verify-release --output <path/to/release_verify.json>
   ```

## Workflow

### 1. Check Role-Aware FAQ Synchronization
- If any feature, button, modal, or workflow changed in `ManualShipmentTab.tsx`, `AlterationRepairTab.tsx`, or `ReturBarangTab.tsx`, review and update [`src/data/initialStoreFaq.ts`](file:///d:/Antigravity/WMS%20Inventory/src/data/initialStoreFaq.ts) first.
- Strictly maintain **Store vs. Admin perspective** (never instruct Store PICs to click Admin-only buttons).

### 2. Bump Version & Release Notes (`tools/bump_version.cjs bump`)
- Run `node tools/bump_version.cjs bump --title "..." --notes "..." --output ...` whenever `src/` files are modified for deployment.
- Confirm that `package.json`, `src/config/appVersion.ts`, and `public/version.json` all share the exact new `version` (`v2.5.x`) and `buildHash`.

### 3. Enforce Multi-User Safe OTA Rules (`tools/bump_version.cjs verify-release`)
- **Zero Forced-Reload Mid-Work**:
  - [`vite.config.ts`](file:///d:/Antigravity/WMS%20Inventory/vite.config.ts) MUST maintain `registerType: 'prompt'`, `workbox.skipWaiting: false`, and `workbox.clientsClaim: false`.
  - [`src/main.tsx`](file:///d:/Antigravity/WMS%20Inventory/src/main.tsx) (`onNeedRefresh`) and [`src/services/appUpdateService.ts`](file:///d:/Antigravity/WMS%20Inventory/src/services/appUpdateService.ts) (`controllerchange`) MUST NEVER trigger an unprompted `window.location.reload()` while a user is typing in a form or scanning barcodes.
- **Automatic Seamless Update on Safe Main-Menu Navigation**:
  - In [`src/App.tsx`](file:///d:/Antigravity/WMS%20Inventory/src/App.tsx) (`handleSelectPage`), when a user switches top-level menus via the Sidebar and `appUpdateManager.hasPendingUpdate()` is `true` (with no unsaved staging barcode scans in `wms_active_staging_scans`), the target page is saved to `localStorage` and URL history and `appUpdateManager.applyUpdate()` reloads directly into the new menu on the latest version.
- **1-Click Manual Update & 100% Login Session Preservation**:
  - Never use multi-step simulated download progress bars (`setInterval`).
  - Applying an update or clearing cache (`clearCacheAndReload`) MUST preserve `localStorage` session tokens (`wms_session_token`, `wms_user_role`, `wms_user_permissions`, `wms_user_store_code`, `wms_active_staging_scans`).

### 4. Auto-Heal & Deploy
- If `verify-release` reports any version drift or `skipWaiting: true` hazard, auto-heal it immediately, run `npm run build`, commit all 3 version files with the code changes, and push to `origin/main`.

## Rate Limiting

- Local CLI commands (`bump` and `verify-release`) operate purely on local workspace files with zero external network calls.
- Client-side update checks (`/version.json?t=...` in [`src/services/appUpdateService.ts`](file:///d:/Antigravity/WMS%20Inventory/src/services/appUpdateService.ts)) enforce a minimum **60-second throttle** (`lastAutoCheckMs`) on automatic checks (`visibilitychange` / boot) and a **10-minute background interval** to prevent server/CDN request spikes across dozens of active devices.

## Common Mistakes

1. **Modifying only `package.json` or `src/config/appVersion.ts` manually**: Always use `node tools/bump_version.cjs` so `package.json`, `src/config/appVersion.ts` (including `VERSION_HISTORY`), and `public/version.json` never drift out of sync.
2. **Enabling `skipWaiting: true` or calling `window.location.reload()` in `onNeedRefresh`**: This causes active Store and Warehouse users to lose unsaved form inputs mid-work whenever a new deployment finishes on Vercel.
3. **Clearing `localStorage` during cache reset**: `clearCacheAndReload()` must only clear Service Worker registrations, `caches` (CacheStorage), and `sessionStorage`—never `localStorage`, which holds the user's active login session and offline staging scans.
