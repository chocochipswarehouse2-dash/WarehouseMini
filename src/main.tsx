import './storage-override';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { setupOrientationAutoLock } from './services/orientationLock';
import { registerSW } from 'virtual:pwa-register';

// Auto-register and update Service Worker immediately
registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload();
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
});

// Auto-lock screen to portrait on mobile devices
setupOrientationAutoLock();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
