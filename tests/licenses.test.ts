import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { collectLicenses } from '../scripts/generate-licenses.mjs'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'crateview-licenses-'))
  roots.push(root)
  async function file(path: string, content: string) {
    const destination = resolve(root, path)
    await mkdir(resolve(destination, '..'), { recursive: true })
    await writeFile(destination, content)
  }
  return { root, file }
}

it('includes locked development, nested, optional and vendored packages deterministically', async () => {
  const { root, file } = await fixture()
  await file(
    'package-lock.json',
    JSON.stringify({
      packages: {
        '': { name: 'application', version: '1' },
        'node_modules/z': { version: '2', license: 'MIT', dev: true },
        'node_modules/a/node_modules/z': { version: '2', license: 'MIT' },
        'node_modules/b/node_modules/z': { version: '1', license: 'MIT' },
        'node_modules/@scope/optional': { version: '3', optional: true },
        'node_modules/local': { resolved: 'vendor/local', link: true },
        'vendor/local': { version: '4', license: 'BSD-2-Clause' },
      },
    }),
  )
  await file(
    'node_modules/z/package.json',
    JSON.stringify({
      name: 'z',
      version: '2',
      repository: { url: 'git+https://example.com/z.git' },
    }),
  )
  await file('node_modules/z/LICENSE', 'Original license\r\nCopyright © Example\r\n')
  await file('node_modules/z/NOTICE.txt', 'An attribution\n')
  await file('node_modules/z/dist/ThirdPartyNoticeText.txt', 'Bundled attribution\n')
  await file('node_modules/z/licenses/extra.txt', 'Additional terms\n')
  await file(
    'node_modules/a/node_modules/z/package.json',
    JSON.stringify({ name: 'z', version: '2' }),
  )
  await file('node_modules/a/node_modules/z/LICENSE', 'Original license\r\nCopyright © Example\r\n')
  await file(
    'vendor/local/package.json',
    JSON.stringify({ name: 'local', version: '4', homepage: 'javascript:alert(1)' }),
  )
  await file('vendor/local/license.txt', 'Vendored license\n')
  const result = await collectLicenses(root)
  expect(result.map((item) => `${item.name}@${item.version}`)).toEqual([
    '@scope/optional@3',
    'local@4',
    'z@1',
    'z@2',
  ])
  expect(result[0]).toMatchObject({ license: '', documents: [] })
  expect(result[1]).toMatchObject({
    license: 'BSD-2-Clause',
    url: '',
    documents: [{ file: 'license.txt', text: 'Vendored license\n' }],
  })
  expect(result[3]).toMatchObject({
    url: 'https://example.com/z',
    documents: [
      { file: 'LICENSE', text: 'Original license\r\nCopyright © Example\r\n' },
      { file: 'NOTICE.txt', text: 'An attribution\n' },
      { file: 'dist/ThirdPartyNoticeText.txt', text: 'Bundled attribution\n' },
      { file: 'licenses/extra.txt', text: 'Additional terms\n' },
    ],
  })
  expect(await collectLicenses(root)).toEqual(result)
})

it('uses explicit license references safely and ignores stale installed versions', async () => {
  const { root, file } = await fixture()
  await file(
    'package-lock.json',
    JSON.stringify({
      packages: {
        'node_modules/custom': { version: '1', license: 'SEE LICENSE IN terms.txt' },
        'node_modules/stale': { version: '2', license: 'MIT' },
        'node_modules/escape': { version: '1', license: 'SEE LICENSE IN ../../secret.txt' },
      },
    }),
  )
  for (const name of ['custom', 'stale', 'escape'])
    await file(`node_modules/${name}/package.json`, JSON.stringify({ name, version: '1' }))
  await file('node_modules/custom/terms.txt', '<script>plain text only</script>\n')
  await file('node_modules/stale/LICENSE', 'Wrong version license')
  await file('secret.txt', 'Private data')
  const result = await collectLicenses(root)
  expect(result[0].documents).toEqual([
    { file: 'terms.txt', text: '<script>plain text only</script>\n' },
  ])
  expect(result[1].documents).toEqual([])
  expect(result[2]).toMatchObject({ version: '2', license: 'MIT', documents: [] })
})

it('fails on an unsupported lockfile instead of publishing an empty inventory', async () => {
  const { root, file } = await fixture()
  await file('package-lock.json', '{}')
  await expect(collectLicenses(root)).rejects.toThrow('packages map')
})
