import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

let highlighter: ReturnType<typeof createHighlighterCore> | undefined;

export function getCodeHighlighter() {
  return (highlighter ??= createHighlighterCore({
    themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/one-dark-pro.mjs')],
    langs: [
      import('shiki/langs/bash.mjs'),
      import('shiki/langs/json.mjs'),
      import('shiki/langs/yaml.mjs'),
      import('shiki/langs/dockerfile.mjs'),
      import('shiki/langs/dotenv.mjs'),
      import('shiki/langs/javascript.mjs'),
      import('shiki/langs/typescript.mjs'),
      import('shiki/langs/html.mjs'),
      import('shiki/langs/css.mjs'),
      import('shiki/langs/sql.mjs'),
      import('shiki/langs/markdown.mjs'),
    ],
    engine: createJavaScriptRegexEngine(),
  }));
}

export function escapeCode(code: string) {
  return code.replace(/[&<>"']/g, (character) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!;
  });
}

export function plainCode(code: string) {
  return `<pre class="shiki"><code>${escapeCode(code)}</code></pre>`;
}

export function highlightCode(
  highlighter: Awaited<ReturnType<typeof getCodeHighlighter>>,
  code: string,
  language = '',
) {
  const lang = language.trim().toLowerCase();
  if (!lang || !highlighter.getLoadedLanguages().includes(lang)) return plainCode(code);
  return highlighter.codeToHtml(code, {
    lang,
    themes: { light: 'github-light', dark: 'one-dark-pro' },
    defaultColor: false,
  });
}
