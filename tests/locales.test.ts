import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { supportedLocales, getLocale, localizedPath } from '../shared/locales'
import { localePreferenceSchema } from '../shared/preferences'
import { requestErrorKey } from '../app/utils/request-errors'
const read = (code: string) =>
  JSON.parse(
    readFileSync(new URL(`../i18n/locales/${code}.json`, import.meta.url), 'utf8'),
  ) as Record<string, string>
const english = read('en')
const placeholders = (text: string) =>
  [...text.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort()
describe('supported languages', () => {
  it('defines thirteen distinct locales and routing defaults', () => {
    expect(new Set(supportedLocales.map((locale) => locale.code)).size).toBe(13)
    expect(getLocale('unsupported').code).toBe('en')
    expect(localizedPath('en', '/docs/overview')).toBe('/docs/overview')
    expect(localizedPath('zh-CN', '/docs/overview')).toBe('/zh-CN/docs/overview')
    expect(localizedPath('pt-BR', '/')).toBe('/pt-BR')
    expect(
      supportedLocales.filter((locale) => locale.dir === 'rtl').map((locale) => locale.code),
    ).toEqual(['ar', 'ur'])
  })
  it('accepts every language preference and rejects unconfigured values', () => {
    for (const locale of supportedLocales)
      expect(localePreferenceSchema.parse(locale.code)).toBe(locale.code)
    expect(localePreferenceSchema.safeParse('xx').success).toBe(false)
  })
  it('maps request errors to localized messages', () => {
    expect(requestErrorKey(401, 'Invalid credentials')).toBe('invalidCredentials')
    expect(requestErrorKey(403, 'User administration not allowed')).toBe('userAdministrationDenied')
    expect(requestErrorKey(503, 'Account store locked; retry later')).toBe(
      'accountServiceUnavailable',
    )
    expect(requestErrorKey(502, 'Unknown upstream failure')).toBe('registryRequestFailed')
  })
  for (const locale of supportedLocales) {
    it(`${locale.code} has complete messages and preserves interpolation`, () => {
      const messages = read(locale.code)
      expect(Object.keys(messages).sort()).toEqual(Object.keys(english).sort())
      for (const [key, source] of Object.entries(english)) {
        const value = messages[key]!
        expect(typeof value, key).toBe('string')
        expect(value.trim(), key).not.toBe('')
        expect(value, key).not.toMatch(/ZXQ\d+QXZ/)
        expect(placeholders(value), key).toEqual(placeholders(source))
      }
    })
  }
})
