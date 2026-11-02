import ar from '../../i18n/locales/ar.json';
import bn from '../../i18n/locales/bn.json';
import de from '../../i18n/locales/de.json';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';
import fr from '../../i18n/locales/fr.json';
import hi from '../../i18n/locales/hi.json';
import id from '../../i18n/locales/id.json';
import ja from '../../i18n/locales/ja.json';
import ptBR from '../../i18n/locales/pt-BR.json';
import ru from '../../i18n/locales/ru.json';
import ur from '../../i18n/locales/ur.json';
import zhCN from '../../i18n/locales/zh-CN.json';
import { supportedLocales } from '../../shared/locales';
import { pwaAssetUrl } from '../../shared/pwa';

const dictionaries = { en, de, 'zh-CN': zhCN, hi, es, ar, fr, bn, 'pt-BR': ptBR, id, ur, ru, ja };

/** Only offline-copy fields are embedded; registry data and runtime secrets never enter the worker. */
export const offlineMessages = Object.fromEntries(
  supportedLocales.map(({ code, dir }) => [
    code,
    {
      title: dictionaries[code].pwaOfflineTitle,
      description: dictionaries[code].pwaOfflineDescription,
      retry: dictionaries[code].retry,
      dir,
    },
  ]),
);

/** Self-contained document works without application bundles, cached assets or external requests. */
export function createOfflineDocument(name: string) {
  const escapedName = name.replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
  const messages = JSON.stringify(offlineMessages).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><title>${escapedName}</title>
<style>
:root { color-scheme: light dark; font-family: system-ui, sans-serif; background: #fafafa; color: #18181b; }
body { margin: 0; min-height: 100svh; display: grid; place-items: center; }
main { max-width: 34rem; padding: 2rem; text-align: center; overflow-wrap: anywhere; }
h1 { font-size: clamp(1.6rem, 5vw, 2.2rem); line-height: 1.2; }
p { line-height: 1.6; } .brand { font-weight: 600; }
button { font: inherit; font-weight: 600; border: 1px solid currentColor; border-radius: .5rem; padding: .75rem 1.25rem; background: #18181b; color: #fafafa; cursor: pointer; }
button:focus-visible { outline: 3px solid #ef4444; outline-offset: 4px; }
@media (prefers-color-scheme: dark) { :root { background: #18181b; color: #fafafa; } button { background: #fafafa; color: #18181b; } }
</style></head><body><main><p class="brand">${escapedName}</p>
<h1 id="title">You are offline</h1><p id="description">Connect to the internet, then try again to open your registry.</p>
<button type="button" id="retry">Retry</button></main><script>
const messages = ${messages};
const codes = Object.keys(messages);
function matchLocale(value) {
  const normalized = value.toLowerCase();
  return codes.find((code) => code.toLowerCase() === normalized)
    || codes.find((code) => code.toLowerCase().split('-')[0] === normalized.split('-')[0]);
}
let preferred = '';
try {
  const cookie = document.cookie.split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith('registry-ui-language='));
  if (cookie) preferred = decodeURIComponent(cookie.slice('registry-ui-language='.length));
} catch { /* Invalid or inaccessible cookies use browser language preferences. */ }
const locale = matchLocale(preferred) || (navigator.languages || [navigator.language]).map(matchLocale).find(Boolean) || 'en';
const copy = messages[locale];
document.documentElement.lang = locale;
document.documentElement.dir = copy.dir;
document.getElementById('title').textContent = copy.title;
document.getElementById('description').textContent = copy.description;
document.getElementById('retry').textContent = copy.retry;
document.getElementById('retry').addEventListener('click', () => location.reload());
</script></body></html>`;
}

/** Intercept app document navigation only, preserving HTTP responses and all protocol traffic. */
export function createPwaWorker(baseURL: string, name: string) {
  return `const base = ${JSON.stringify(pwaAssetUrl('', baseURL))};
const offline = ${JSON.stringify(createOfflineDocument(name))};
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(base)) return;
  const path = url.pathname.slice(base.length);
  if (/^(api|v2)(\\/|$)/.test(path)) return;
  event.respondWith(fetch(request).catch(() => new Response(offline, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })));
});
`;
}
