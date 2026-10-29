import './storage-override';

// Google Maps Platform Quota Defense
(window as any).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
};
const origError = console.error;
console.error = (...args: unknown[]) => {
  const msg = args
    .map((a) => {
      try {
        return typeof a === "string" ? a : (a as any)?.message || (a as any)?.name || String(a);
      } catch {
        return "";
      }
    })
    .join(" ");
  if (msg.includes("operation is insecure") || msg.includes("SecurityError")) {
    console.warn(...args);
    return;
  }
  origError.apply(console, args);
  if (msg.includes("OverQuotaMapError") || msg.includes("QuotaExceededError")) {
    window.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
  }
};
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { setupOrientationAutoLock, isRunningInIframe } from './services/orientationLock';
import { registerSW } from 'virtual:pwa-register';
import { appUpdateManager } from './services/appUpdateService';

// Auto-register Service Worker safely (Multi-User Non-Disruptive: NEVER force reload mid-work!)
try {
  const isIframe = isRunningInIframe();

  if (!isIframe && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        try {
          appUpdateManager.notifySwUpdateReady();
        } catch {}
      },
      onOfflineReady() {
        console.log('App ready to work offline');
      },
      onRegisterError(error) {
        console.warn('PWA registration skipped or error:', error);
      },
    });
  }
} catch (swErr) {
  console.warn('PWA registration skipped:', swErr);
}

// Auto-lock screen to portrait on mobile devices
setupOrientationAutoLock();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
