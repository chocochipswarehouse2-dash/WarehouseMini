---
name: wms-app-release-update
description: Standard blueprint for WMS Application Versioning, Release Notes (Changelog), and Multi-User Safe OTA Updates across active logged-in sessions (Store, Gudang, Packing, Produksi, HR, Superadmin). Activate whenever deploying code changes or modifying PWA/Service Worker/Update components.
---

# WMS Application Release, Versioning & Multi-User Safe Update Skill

This skill governs how the WMS Inventory application manages version numbers (`v2.5.x`), release notes, Service Worker lifecycle, and non-disruptive updates for dozens of concurrently logged-in users.

---

## 1. Mandatory Version Bump & Release Notes Sync on Every Deploy

Whenever frontend features, bug fixes, or performance optimizations are ready to be deployed to GitHub (`origin/main`), the agent **MUST** automatically bump the application version and update the release notes **before** running `npm run build` and `git commit`:

```bash
node tools/bump_version.cjs --title "WMS v2.5.x — <Judul Singkat Rilis>" --notes "<Poin Pembaruan 1>|<Poin Pembaruan 2>|<Poin Pembaruan 3>"
```

### What `tools/bump_version.cjs` Synchronizes Atomically:
1. **`package.json`**: Increments `"version"` (e.g. `2.5.1` $\rightarrow$ `2.5.2`).
2. **`src/config/appVersion.ts`**:
   - Updates `CURRENT_APP_VERSION_INFO` (`version`, `versionCode`, `buildDate`, `buildHash`, `releaseTitle`, `releaseNotes`).
   - Archives the previous release into `VERSION_HISTORY` (up to 8 recent releases) so users can inspect historical changelogs in `AppUpdateModal`.
3. **`public/version.json`**: Writes the exact JSON metadata served at `/version.json?t=...` so connected clients detect the new release.

---

## 2. Multi-User Safe Update Architecture (Zero Forced-Reload Rule)

Because dozens of users across multiple roles (Store PICs, Warehouse Pickers, Packing/Resi Admins, Produksi/QC, HR, Superadmin) are logged in and working simultaneously during business hours, the update system **MUST NEVER** disrupt active work:

1. **HARD CONSTRAINT — NO FORCED RELOAD MID-WORK**:
   - `vite.config.ts` MUST keep `registerType: 'prompt'`, `workbox.skipWaiting: false`, and `workbox.clientsClaim: false`.
   - `src/main.tsx` (`onNeedRefresh`) and `src/services/appUpdateService.ts` (`controllerchange`) **MUST NEVER** call `window.location.reload()` automatically when a background Service Worker finishes installing.
   - Instead, `onNeedRefresh` calls `appUpdateManager.notifySwUpdateReady()`, which lights up the `BARU v2.5.x` badge in the Sidebar and shows the non-blocking floating pill (`AppUpdateFloatingWidget`).

2. **Automatic Seamless Update on Safe Main-Menu Navigation**:
   - When a user switches top-level pages via the Sidebar (`handleSelectPage` in `src/App.tsx`), if `appUpdateManager.hasPendingUpdate()` is `true` **AND** the user has no unsaved staging barcode scans (`wms_active_staging_scans` is empty):
     - The target page is saved to `localStorage` (`wms_last_active_page`) and browser URL history (`window.history.pushState`), and `appUpdateManager.applyUpdate()` is triggered automatically.
     - The user lands directly on the menu they clicked, running the newest version with zero interruption.

3. **1-Click Instant Manual Update**:
   - Never use multi-step fake download progress bars (`setInterval`).
   - Clicking **"Perbarui"** on the floating pill or **"Perbarui Sekarang (1-Klik)"** inside `AppUpdateModal` immediately sends `{ type: 'SKIP_WAITING' }` to the waiting Service Worker and reloads cleanly.

4. **100% Login Session & Local Draft Preservation**:
   - Applying an update or resetting the browser cache (`clearCacheAndReload`) **MUST NEVER** clear `localStorage` keys (`wms_session_token`, `wms_session_username`, `wms_user_role`, `wms_user_permissions`, `wms_user_store_code`, `wms_active_staging_scans`).
   - No logged-in user may ever be logged out due to an app update.

