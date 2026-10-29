import React from 'react';

/**
 * Legacy PwaUpdatePrompt component kept as a no-op to avoid duplicate update banners
 * and prevent forced window.location.reload() on Service Worker controllerchange.
 * All update notifications are now unified via AppUpdateFloatingWidget + Sidebar badge + AppUpdateModal.
 */
export const PwaUpdatePrompt: React.FC = () => {
  return null;
};
