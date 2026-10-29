/**
 * App Update Service
 * Handles Multi-User Safe OTA version checking, zero forced-reload protection during active work,
 * automatic seamless update on safe menu navigation, and 1-click instant reload while preserving login sessions.
 */

import {
  CURRENT_APP_VERSION,
  CURRENT_APP_VERSION_INFO,
  VersionInfo,
  isNewerVersion
} from '../config/appVersion';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error';

export interface DownloadStats {
  currentMB: number;
  totalMB: number;
  speed: string;
  stepMessage: string;
}

export interface AppUpdateState {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion: string;
  releaseInfo: VersionInfo | null;
  progress: number; // 0 - 100
  downloadStats: DownloadStats;
  lastChecked: Date | null;
  errorMessage: string | null;
  isMinimized: boolean;
  waitingWorker: ServiceWorker | null;
}

type Listener = (state: AppUpdateState) => void;

class AppUpdateManager {
  private state: AppUpdateState = {
    status: 'idle',
    currentVersion: CURRENT_APP_VERSION,
    latestVersion: CURRENT_APP_VERSION,
    releaseInfo: CURRENT_APP_VERSION_INFO,
    progress: 0,
    downloadStats: {
      currentMB: 0,
      totalMB: 0,
      speed: '',
      stepMessage: 'Siap memperbarui sistem'
    },
    lastChecked: null,
    errorMessage: null,
    isMinimized: false,
    waitingWorker: null
  };

  private listeners = new Set<Listener>();
  private isApplyingUpdate = false;
  private lastAutoCheckMs = 0;

  constructor() {
    this.initServiceWorkerListener();
  }

  private notify() {
    this.listeners.forEach(fn => fn({ ...this.state }));
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): AppUpdateState {
    return { ...this.state };
  }

  public hasPendingUpdate(): boolean {
    return (
      this.state.status === 'available' ||
      this.state.status === 'ready' ||
      Boolean(this.state.waitingWorker) ||
      isNewerVersion(
        this.state.latestVersion,
        CURRENT_APP_VERSION,
        this.state.releaseInfo?.buildHash,
        CURRENT_APP_VERSION_INFO.buildHash
      )
    );
  }

  public setMinimized(minimized: boolean) {
    this.state.isMinimized = minimized;
    this.notify();
  }

  /**
   * Called by virtual:pwa-register onNeedRefresh without forcing a reload
   */
  public notifySwUpdateReady(worker?: ServiceWorker | null) {
    if (worker) {
      this.state.waitingWorker = worker;
    }
    if (this.state.status !== 'downloading') {
      this.state.status = 'ready';
      this.state.progress = 100;
      this.notify();
    }
    // Also fetch latest version.json metadata quietly so we show the new version number & release notes
    this.fetchServerVersionJson().then((serverInfo) => {
      if (serverInfo) {
        this.state.latestVersion = serverInfo.version || this.state.latestVersion;
        this.state.releaseInfo = serverInfo;
        this.notify();
      }
    }).catch(() => {});
  }

  /**
   * Listen to browser Service Worker registration lifecycle safely (NO forced reload mid-work)
   */
  private initServiceWorkerListener() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Only reload on controllerchange if the update was intentionally triggered by applyUpdate()
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (this.isApplyingUpdate) {
        window.location.reload();
      }
    });

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;

      if (reg.waiting) {
        this.notifySwUpdateReady(reg.waiting);
      }

      reg.addEventListener('updatefound', () => {
        const installingWorker = reg.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            this.notifySwUpdateReady(installingWorker);
          }
        });
      });
    }).catch(err => {
      console.warn('[AppUpdate] SW registration check warning:', err);
    });
  }

  private async fetchServerVersionJson(): Promise<VersionInfo | null> {
    try {
      const timestamp = Date.now();
      const res = await fetch(`/version.json?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        const rawText = await res.text();
        const trimmed = rawText.trim();
        if (
          (contentType.includes('application/json') || trimmed.startsWith('{')) &&
          !trimmed.startsWith('<!') &&
          !trimmed.startsWith('<html')
        ) {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object' && typeof parsed.version === 'string') {
            return parsed as VersionInfo;
          }
        }
      }
    } catch {
      // Ignore transient network errors
    }
    return null;
  }

  /**
   * Check for updates manually or automatically
   */
  public async checkForUpdates(isAuto: boolean = false): Promise<AppUpdateState> {
    if (this.state.status === 'downloading') {
      return this.getState();
    }

    // Throttle automatic checks to at most once every 60 seconds
    if (isAuto && Date.now() - this.lastAutoCheckMs < 60_000) {
      return this.getState();
    }
    this.lastAutoCheckMs = Date.now();

    if (!isAuto) {
      this.state.status = 'checking';
      this.state.errorMessage = null;
      this.notify();
    }

    try {
      // 1. Trigger Service Worker update check quietly
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.update();
            if (reg.waiting) {
              this.state.waitingWorker = reg.waiting;
            }
          }
        } catch (swErr) {
          console.warn('[AppUpdate] Service Worker update check warning:', swErr);
        }
      }

      // 2. Query public/version.json with cache-busting timestamp and no-cache headers
      const serverVersionInfo = await this.fetchServerVersionJson();

      const latestVer = serverVersionInfo?.version || CURRENT_APP_VERSION;
      const hasNewVersion = isNewerVersion(
        latestVer,
        CURRENT_APP_VERSION,
        serverVersionInfo?.buildHash,
        CURRENT_APP_VERSION_INFO.buildHash
      );
      const isSwReady = Boolean(this.state.waitingWorker);

      this.state.lastChecked = new Date();
      this.state.latestVersion = latestVer;

      if (serverVersionInfo) {
        this.state.releaseInfo = serverVersionInfo;
      }

      if (isSwReady || hasNewVersion) {
        this.state.status = 'ready';
        this.state.progress = 100;
        if (!isAuto) {
          this.state.isMinimized = false;
        }
      } else {
        this.state.status = 'up-to-date';
        this.state.progress = 0;
      }

      this.notify();
      return this.getState();
    } catch {
      if (this.state.waitingWorker) {
        this.state.status = 'ready';
        this.state.progress = 100;
      } else {
        this.state.status = isAuto ? 'idle' : 'up-to-date';
        this.state.errorMessage = null;
      }
      this.state.lastChecked = new Date();
      this.notify();
      return this.getState();
    }
  }

  /**
   * 1-Click Direct Apply (kept for backward compatibility with callers of startDownload)
   */
  public startDownload(): void {
    this.applyUpdate();
  }

  /**
   * Apply the update immediately in 1 click while 100% preserving localStorage login session & staging scans
   */
  public applyUpdate(options?: { hardReload?: boolean }): void {
    if (this.isApplyingUpdate) return;
    this.isApplyingUpdate = true;

    this.state.status = 'downloading';
    this.state.progress = 100;
    this.state.downloadStats = {
      currentMB: 100,
      totalMB: 100,
      speed: 'Instan',
      stepMessage: 'Menerapkan versi terbaru & mempertahankan sesi login...'
    };
    this.notify();

    try {
      if (this.state.waitingWorker) {
        this.state.waitingWorker.postMessage({ type: 'SKIP_WAITING' });
        // Fallback reload if controllerchange doesn't fire within 800ms
        setTimeout(() => {
          window.location.reload();
        }, 800);
        return;
      }

      if ('caches' in window) {
        caches.keys().then((names) => {
          return Promise.all(
            names
              .filter((name) => options?.hardReload || name.includes('precache') || name.includes('workbox'))
              .map((name) => caches.delete(name))
          );
        }).finally(() => {
          window.location.reload();
        });
        return;
      }

      window.location.reload();
    } catch (err) {
      console.warn('[AppUpdate] Apply reload fallback:', err);
      window.location.reload();
    }
  }

  /**
   * Force clear all browser cache storage and unregister service workers (Emergency Rescue)
   * Preserves localStorage login session & staging scans!
   */
  public async clearCacheAndReload(): Promise<void> {
    try {
      this.isApplyingUpdate = true;
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }

      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        for (const key of cacheKeys) {
          await caches.delete(key);
        }
      }

      sessionStorage.clear();
      window.location.reload();
    } catch (e) {
      console.error('[AppUpdate] Clear cache failed:', e);
      window.location.reload();
    }
  }
}

export const appUpdateManager = new AppUpdateManager();
