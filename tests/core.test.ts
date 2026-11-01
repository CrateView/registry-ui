import { describe, it, expect } from 'vitest'
import { repositoryPath, referencePath, mapLimit } from '../server/utils/registry'
import { resolveTheme, safeUrl } from '../app/utils/configuration'
import en from '../i18n/locales/en.json'
import de from '../i18n/locales/de.json'
describe('standard registry boundaries', () => {
  it('accepts namespaces but rejects traversal and arbitrary paths', () => {
    expect(repositoryPath('team/my_image.v2')).toBe('team/my_image.v2')
    for (const name of ['../image', '/etc/passwd', 'x?y', 'http://evil', 'team//image', 'UPPER'])
      expect(() => repositoryPath(name)).toThrow()
  })
  it('distinguishes valid tags and digests', () => {
    expect(referencePath('v1.2')).toBe('v1.2')
    expect(referencePath('sha256:' + 'a'.repeat(64))).toContain('sha256%3A')
    for (const value of ['../image', 'tag?x', 'sha256:short'])
      expect(() => referencePath(value)).toThrow()
  })
  it('limits concurrent metadata requests and preserves ordering', async () => {
    let active = 0
    let peak = 0
    const result = await mapLimit(
      [1, 2, 3, 4, 5, 6],
      async (n) => {
        active++
        peak = Math.max(active, peak)
        await new Promise((resolve) => setTimeout(resolve, 2))
        active--
        return n * 2
      },
      2,
    )
    expect(peak).toBe(2)
    expect(result).toEqual([2, 4, 6, 8, 10, 12])
  })
})
describe('branding and theme', () => {
  const base = { primary: 'red', neutral: 'zinc', radius: '0.5rem', fontFamily: 'system-ui' }
  it('keeps defaults and applies runtime overrides', () => {
    expect(resolveTheme(base, {})).toEqual(base)
    expect(resolveTheme(base, { themePrimary: 'blue' }).primary).toBe('blue')
  })
  it('rejects CSS and link injection', () => {
    expect(() => resolveTheme(base, { themeFontFamily: 'sans;}' })).toThrow()
    expect(safeUrl('javascript:alert(1)')).toBe('')
    expect(safeUrl('//evil.test')).toBe('')
    expect(safeUrl('/logo.svg')).toBe('/logo.svg')
  })
  it('provides equivalent locale keys and placeholders', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort())
    for (const key of Object.keys(en) as (keyof typeof en)[])
      expect(de[key].match(/\{\w+\}/g) || []).toEqual(en[key].match(/\{\w+\}/g) || [])
  })
})
