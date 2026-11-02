import { afterEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadBranding } from '../server/utils/branding'

const roots: string[] = []
const config = () => ({
  brandLogoLightFile: '',
  brandLogoDarkFile: '',
  brandFaviconFile: '',
  public: {
    brandLogoLight: 'https://example.test/light.svg',
    brandLogoDark: '/dark.png',
    brandFavicon: '/favicon.ico',
  },
  app: { baseURL: '/' },
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'crateview-branding-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('filesystem branding', () => {
  it('preserves all URL settings when no files are configured', () => {
    const result = loadBranding(config())
    expect(result.links).toEqual({
      logoLight: 'https://example.test/light.svg',
      logoDark: '/dark.png',
      favicon: '/favicon.ico',
    })
    expect(result.assets.size).toBe(0)
  })

  it('overrides only configured assets, resolves relative paths, and keeps paths private', () => {
    const root = fixture()
    const file = join(root, 'private-logo.svg')
    const body = '<svg xmlns="http://www.w3.org/2000/svg"/>'
    writeFileSync(file, body)
    const options = { ...config(), brandLogoLightFile: 'private-logo.svg', brandFaviconFile: file }
    const result = loadBranding(options, root)
    expect(result.links).toEqual({
      logoLight: '/api/branding/logo-light',
      logoDark: '/dark.png',
      favicon: '/api/branding/favicon',
    })
    expect(result.assets.get('logo-light')?.body.toString()).toBe(body)
    expect(result.assets.get('favicon')?.body.toString()).toBe(body)
    expect(JSON.stringify(result.links)).not.toContain(file)
    expect(JSON.stringify(result.links)).not.toContain('private-logo.svg')
    expect(result.assets.get('../private-logo.svg')).toBeUndefined()
    expect(result.assets.get('__proto__')).toBeUndefined()
    rmSync(file)
    expect(result.assets.get('logo-light')?.body.toString()).toBe(body)
  })

  it('preserves a deployment base URL', () => {
    const root = fixture()
    writeFileSync(join(root, 'icon.ico'), 'icon')
    const result = loadBranding(
      { ...config(), brandFaviconFile: 'icon.ico', app: { baseURL: '/registry/' } },
      root,
    )
    expect(result.links.favicon).toBe('/registry/api/branding/favicon')
  })

  it.each([
    ['svg', 'image/svg+xml'],
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['webp', 'image/webp'],
    ['gif', 'image/gif'],
    ['ico', 'image/x-icon'],
    ['PNG', 'image/png'],
  ])('serves %s with its media type', (extension, contentType) => {
    const root = fixture()
    const file = join(root, `logo.${extension}`)
    writeFileSync(file, Buffer.from([1, 2, 3]))
    const result = loadBranding({ ...config(), brandLogoDarkFile: file })
    expect(result.assets.get('logo-dark')).toEqual({ body: Buffer.from([1, 2, 3]), contentType })
  })

  it.each(['missing.svg', 'directory.png', 'empty.gif', 'unsupported.txt'])(
    'rejects invalid file %s',
    (file) => {
      const root = fixture()
      mkdirSync(join(root, 'directory.png'))
      writeFileSync(join(root, 'empty.gif'), '')
      writeFileSync(join(root, 'unsupported.txt'), 'not an image')
      expect(() => loadBranding({ ...config(), brandFaviconFile: file }, root)).toThrow(
        'Invalid NUXT_BRAND_FAVICON_FILE',
      )
    },
  )

  it.skipIf(process.getuid?.() === 0)('rejects an unreadable file', () => {
    const root = fixture()
    const file = join(root, 'logo.svg')
    writeFileSync(file, '<svg/>')
    chmodSync(file, 0)
    expect(() => loadBranding({ ...config(), brandLogoLightFile: file })).toThrow(
      'Invalid NUXT_BRAND_LOGO_LIGHT_FILE',
    )
  })
})
