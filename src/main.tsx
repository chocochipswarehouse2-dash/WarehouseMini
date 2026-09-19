import './storage-override';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { setupOrientationAutoLock } from './services/orientationLock';

// Auto-lock screen to portrait on mobile devices
setupOrientationAutoLock();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
