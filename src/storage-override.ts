// GLOBAL STORAGE OVERRIDE & POLYFILL:
// 1. Prevent "SecurityError: The operation is insecure." in sandboxed iframes or restricted environments.
// 2. Prevent QuotaExceededError from crashing the app when storage is full.

class MemoryStorage implements Storage {
  private _data: Record<string, string> = {};

  get length(): number {
    return Object.keys(this._data).length;
  }

  clear(): void {
    this._data = {};
  }

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null;
  }

  key(index: number): string | null {
    const keys = Object.keys(this._data);
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    delete this._data[key];
  }

  setItem(key: string, value: string): void {
    this._data[key] = String(value);
  }
}

function clearKnownLargeCaches(): void {
  const keysToEvict = [
    'wms_product_cache',
    'wms_picking_cache',
    'wms_raw_picking_list_cache',
    'wms_cached_pengecekan_sj_records',
    'wms_cached_tarikan_md',
    'wms_cached_pengecekan_sj_drafts',
    'wms_offline_queue_pengecekan_sj',
    'wms_local_perbaikan_tickets',
    'wms_local_qc_reports',
    'wms_local_penerimaan_produksi',
    'gas_delta_sync_Stok Real',
    'gas_delta_sync_Mutasi Log',
  ];
  for (const k of keysToEvict) {
    try {
      window.localStorage.removeItem(k);
    } catch {}
  }
}

function isSecurityErrorValue(val: unknown): boolean {
  if (!val) return false;
  try {
    let s = '';
    if (typeof val === 'string') {
      s = val;
    } else if (val instanceof Error || (typeof DOMException !== 'undefined' && val instanceof DOMException)) {
      s = `${val.name || ''} ${val.message || ''} ${val.stack || ''}`;
    } else {
      s = `${(val as any)?.message || (val as any)?.name || ''} ${JSON.stringify(val)}`;
    }
    return (
      s.includes('operation is insecure') ||
      s.includes('SecurityError') ||
      s.includes('Access is denied') ||
      s.includes('failed to connect to websocket') ||
      s.includes('WebSocket closed without opened')
    );
  } catch {
    return false;
  }
}

// Intercept & suppress sandbox SecurityErrors ("The operation is insecure") at runtime
if (typeof window !== 'undefined') {
  try {
    if (typeof MessagePort !== 'undefined' && MessagePort.prototype && typeof MessagePort.prototype.postMessage === 'function') {
      const origPortPost = MessagePort.prototype.postMessage as any;
      if (!origPortPost.__wmsPatched) {
        const wrappedPortPost = function (this: MessagePort, data: any, ...rest: any[]) {
          try {
            if (data && data.type === 'error' && (isSecurityErrorValue(data.message) || isSecurityErrorValue(data))) {
              return;
            }
          } catch {}
          return origPortPost.apply(this, [data, ...rest]);
        };
        (wrappedPortPost as any).__wmsPatched = true;
        MessagePort.prototype.postMessage = wrappedPortPost as any;
      }
    }
  } catch {}

  try {
    const rawError = console.error;
    if (typeof rawError === 'function') {
      console.error = function (...args: unknown[]) {
        if (args.some(isSecurityErrorValue)) {
          return;
        }
        return rawError.apply(console, args);
      };
    }
  } catch {}

  try {
    const prevOnError = window.onerror;
    window.onerror = function (message, source, lineno, colno, error) {
      if (isSecurityErrorValue(message) || isSecurityErrorValue(error)) {
        return true;
      }
      if (typeof prevOnError === 'function') {
        return prevOnError.call(this, message, source, lineno, colno, error);
      }
      return false;
    };
  } catch {}

  try {
    const prevOnRejection = window.onunhandledrejection;
    window.onunhandledrejection = function (event: PromiseRejectionEvent) {
      if (event && (isSecurityErrorValue(event.reason) || isSecurityErrorValue(event))) {
        return;
      }
      if (typeof prevOnRejection === 'function') {
        return prevOnRejection.call(window, event);
      }
    };
  } catch {}

  window.addEventListener(
    'error',
    (e) => {
      const msg = (e && (e.message || (e.error && (e.error.message || e.error.name)))) || '';
      if (isSecurityErrorValue(msg) || isSecurityErrorValue(e?.error)) {
        e.preventDefault?.();
        e.stopImmediatePropagation?.();
      }
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    (e) => {
      const reason = e && (e.reason || '');
      if (isSecurityErrorValue(reason)) {
        e.preventDefault?.();
        e.stopImmediatePropagation?.();
      }
    },
    true
  );

  // Ensure BroadcastChannel is safe in sandboxed iframes (used by @supabase/auth-js)
  try {
    let bcWorks = false;
    if (typeof window.BroadcastChannel === 'function') {
      try {
        const probe = new window.BroadcastChannel('__wms_probe_bc__');
        probe.close();
        bcWorks = true;
      } catch {
        bcWorks = false;
      }
    }
    if (!bcWorks) {
      class SafeBroadcastChannel {
        name: string;
        onmessage: ((this: BroadcastChannel, ev: MessageEvent) => any) | null = null;
        onmessageerror: ((this: BroadcastChannel, ev: MessageEvent) => any) | null = null;
        constructor(name: string) {
          this.name = name;
        }
        postMessage(_message: any): void {}
        close(): void {}
        addEventListener(): void {}
        removeEventListener(): void {}
        dispatchEvent(): boolean {
          return true;
        }
      }
      try {
        Object.defineProperty(window, 'BroadcastChannel', {
          value: SafeBroadcastChannel,
          configurable: true,
          writable: true,
        });
      } catch {
        (window as any).BroadcastChannel = SafeBroadcastChannel;
      }
    }
  } catch {}

  // Prevent history.pushState / replaceState from throwing SecurityError in sandboxed preview iframes
  try {
    let isIframe = false;
    try {
      isIframe = window.self !== window.top;
    } catch {
      isIframe = true;
    }
    if (isIframe && typeof window.history !== 'undefined') {
      window.history.pushState = function () {};
      window.history.replaceState = function () {};
    }
  } catch {}
}

// Ensure localStorage is safely usable or fall back to MemoryStorage
try {
  let works = false;
  try {
    const testKey = '__wms_test_storage__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    works = true;
  } catch {
    works = false;
  }

  if (!works) {
    const memoryLocal = new MemoryStorage();
    try {
      Object.defineProperty(window, 'localStorage', {
        value: memoryLocal,
        configurable: true,
        writable: true,
      });
    } catch {
      // In case defineProperty fails, override properties directly
      (window as any).localStorage = memoryLocal;
    }
  } else {
    // If working, hook setItem to protect against quota and security errors
    const originalLocalSetItem = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = function(key: string, value: string) {
      try {
        originalLocalSetItem(key, value);
      } catch (e: any) {
        const msg = String(e?.message || e?.name || e).toLowerCase();
        const isQuota =
          (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) ||
          msg.includes('quota') ||
          msg.includes('exceeded') ||
          e?.code === 22 ||
          e?.code === 1014;

        if (isQuota) {
          clearKnownLargeCaches();
          try {
            originalLocalSetItem(key, value);
          } catch {
            console.warn(`[QuotaExceeded] Still failed to set "${key}" after clearing caches. Suppressing error.`);
          }
        } else {
          console.warn(`[StorageError] Could not save key "${key}":`, e);
        }
      }
    };

    const originalLocalGetItem = window.localStorage.getItem.bind(window.localStorage);
    window.localStorage.getItem = function(key: string) {
      try {
        return originalLocalGetItem(key);
      } catch {
        return null;
      }
    };
  }
} catch (outerErr) {
  console.warn('[StorageOverride] localStorage protection initialized with fallback:', outerErr);
}

// Ensure sessionStorage is safely usable or fall back to MemoryStorage
try {
  let works = false;
  try {
    const testKey = '__wms_test_session__';
    window.sessionStorage.setItem(testKey, testKey);
    window.sessionStorage.removeItem(testKey);
    works = true;
  } catch {
    works = false;
  }

  if (!works) {
    const memorySession = new MemoryStorage();
    try {
      Object.defineProperty(window, 'sessionStorage', {
        value: memorySession,
        configurable: true,
        writable: true,
      });
    } catch {
      (window as any).sessionStorage = memorySession;
    }
  } else {
    const originalSessionSetItem = window.sessionStorage.setItem.bind(window.sessionStorage);
    window.sessionStorage.setItem = function(key: string, value: string) {
      try {
        originalSessionSetItem(key, value);
      } catch (e: any) {
        const msg = String(e?.message || e?.name || e).toLowerCase();
        const isQuota =
          (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) ||
          msg.includes('quota') ||
          msg.includes('exceeded');

        if (isQuota) {
          try {
            window.sessionStorage.clear();
            originalSessionSetItem(key, value);
          } catch (retryErr) {
            console.warn(`[QuotaExceeded] Still failed sessionStorage after clearing:`, retryErr);
          }
        } else {
          console.warn(`[StorageError] Could not save sessionStorage key "${key}":`, e);
        }
      }
    };

    const originalSessionGetItem = window.sessionStorage.getItem.bind(window.sessionStorage);
    window.sessionStorage.getItem = function(key: string) {
      try {
        return originalSessionGetItem(key);
      } catch {
        return null;
      }
    };
  }
} catch (outerErr) {
  console.warn('[StorageOverride] sessionStorage protection initialized with fallback:', outerErr);
}
