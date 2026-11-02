import { en, de, zh_cn, hi, es, ar, fr, bn, pt_br, id, ur, ru, ja } from '@nuxt/ui/locale'
import { getLocale, supportedLocales } from '#shared/locales'
const uiLocales = { en, de, zh_cn, hi, es, ar, fr, bn, pt_br, id, ur, ru, ja }
export const languageOptions = supportedLocales.map(({ code, name }) => ({
  value: code,
  label: name,
}))
export function getUiLocale(code: string) {
  return uiLocales[getLocale(code).ui]
}
