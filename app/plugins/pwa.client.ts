export default defineNuxtPlugin(() => {
  if (import.meta.dev || !window.isSecureContext || !('serviceWorker' in navigator)) return;
  const baseURL = useRuntimeConfig().app.baseURL;
  const scope = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  // Registration must not prevent ordinary browser use when workers are unavailable or blocked.
  void navigator.serviceWorker.register(`${scope}sw.js`, { scope, updateViaCache: 'none' }).catch((error: unknown) => {
    console.warn('PWA service worker registration failed', error);
  });
});
