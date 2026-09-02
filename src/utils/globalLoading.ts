export const showGlobalLoading = (message: string = 'Memproses...') => {
  window.dispatchEvent(new CustomEvent('global-loading', { detail: { isLoading: true, message } }));
};

export const hideGlobalLoading = () => {
  window.dispatchEvent(new CustomEvent('global-loading', { detail: { isLoading: false, message: '' } }));
};
