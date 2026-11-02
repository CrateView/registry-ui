/** Resolve local install assets within the deployment base while preserving external URLs. */
export function pwaAssetUrl(value: string, baseURL: string) {
  if (/^https?:\/\//i.test(value)) return value;
  const base = `/${baseURL.split('/').filter(Boolean).join('/')}`.replace(/\/$/, '') + '/';
  if (value.startsWith(base) && base !== '/') return value;
  return base + value.replace(/^\/+/, '');
}
