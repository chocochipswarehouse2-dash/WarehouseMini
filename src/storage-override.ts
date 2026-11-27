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

const PROTECTED_STORAGE_KEY_REGEX =
  /^(wms_session_|wms_user_|wms_endpoint_|wms_supabase_|wms_gas_|wms_fonnte_|wms_wa_webhook_|wms_active_staging_scans$|wms_active_picking_session$|wms_active_putaway_session$|wms_recount_workspace_draft_v1$|wms_draft_|wms_offline_)|outbox/i;

function clearKnownLargeCaches(protectedKey?: string): void {
  const keysToEvict = [
    'wms_product_cache',
    'wms_picking_cache',
    'wms_raw_picking_list_cache',
    'wms_cached_pengecekan_sj_records',
    'wms_cached_tarikan_md',
    'wms_cached_pengecekan_sj_drafts',
    'wms_local_perbaikan_tickets',
    'wms_local_qc_reports',
    'wms_local_penerimaan_produksi',
    'gas_delta_sync_Stok Real',
    'gas_delta_sync_Mutasi Log',
    'wms_trello_up_catalog_cache',
    'wms_katalog_manual_data',
    'wms_peminjaman_cache',
    'wms_peminjaman_records',
    'wms_recount_audit_map',
    'wms_recount_logs',
    'wms_so_queue_cache_ALL',
    'wms_so_queue_cache_PENDING',
    'wms_so_queue_cache_APPROVED',
    'wms_putaway_tasks_cache_v1',
    'wms_stok_real_fisik_light',
    'wms_stok_real_fisik_cache',
    'wms_mutasi_cache',
    'wms_produksi_matrix_metrics_cache',
    'wms_katalog_search_cache',
    'wms_staging_scan_cache',
    'wms_jne_rekap_member_cache',
    'chocochips_jne_member_records_v2',
    'chocochips_jne_corporate_records_v1',
    'wms_pengiriman_store_reports',
    'wms_pengiriman_store_trips',
    'wms_penerimaan_mutasi_store',
    'wms_penerimaan_paket',
    'wms_handover_paket',
    'wms_ig_live_orders_v1',
    'wms_picking_reset_undo_backups_v1',
    'wms_ai_chat_history',
  ];
  for (const k of keysToEvict) {
    if (k === protectedKey) continue;
    try {
      window.localStorage.removeItem(k);
    } catch {}
  }
}

function evictLargestDisposableKeys(
  protectedKey: string,
  writeAttempt: () => void
): boolean {
  try {
    const candidates: Array<{ key: string; len: number }> = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || k === protectedKey || PROTECTED_STORAGE_KEY_REGEX.test(k)) continue;
      const v = window.localStorage.getItem(k);
      candidates.push({ key: k, len: v ? v.length : 0 });
    }
    candidates.sort((a, b) => b.len - a.len);

    for (let i = 0; i < candidates.length; i++) {
      try {
        window.localStorage.removeItem(candidates[i].key);
      } catch {}
      if ((i + 1) % 3 === 0 || i === candidates.length - 1 || candidates[i].len >= 4096) {
        try {
          writeAttempt();
          return true;
        } catch {}
      }
    }
  } catch {}
  return false;
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
      s.includes('WebSocket closed without opened') ||
      s.includes('dev-sw.js') ||
      s.includes('encountered an error during installation')
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
          clearKnownLargeCaches(key);
          try {
            originalLocalSetItem(key, value);
          } catch {
            const recovered = evictLargestDisposableKeys(key, () =>
              originalLocalSetItem(key, value)
            );
            if (!recovered) {
              console.warn(`[QuotaExceeded] Still failed to set "${key}" after clearing caches. Suppressing error.`);
            }
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
