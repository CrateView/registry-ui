import { getLocale, supportedLocales } from '#shared/locales';
import { ar, bn, de, en, es, fr, hi, id, ja, pt_br, ru, ur, zh_cn } from '@nuxt/ui/locale';

const uiLocales = { en, de, zh_cn, hi, es, ar, fr, bn, pt_br, id, ur, ru, ja };
export const languageOptions = supportedLocales.map(({ code, name }) => ({
  value: code,
  label: name,
}));
export function getUiLocale(code: string) {
  return uiLocales[getLocale(code).ui];
}
