import { useState, useEffect } from 'react';
import { appUpdateManager, AppUpdateState } from '../services/appUpdateService';

export function useAppUpdate() {
  const [updateState, setUpdateState] = useState<AppUpdateState>(() => appUpdateManager.getState());

  useEffect(() => {
    const unsubscribe = appUpdateManager.subscribe((nextState) => {
      setUpdateState(nextState);
    });
    return unsubscribe;
  }, []);

  return {
    ...updateState,
    checkForUpdates: (isAuto?: boolean) => appUpdateManager.checkForUpdates(isAuto),
    startDownload: () => appUpdateManager.startDownload(),
    applyUpdate: (options?: { hardReload?: boolean }) => appUpdateManager.applyUpdate(options),
    clearCacheAndReload: () => appUpdateManager.clearCacheAndReload(),
    setMinimized: (minimized: boolean) => appUpdateManager.setMinimized(minimized)
  };
}
