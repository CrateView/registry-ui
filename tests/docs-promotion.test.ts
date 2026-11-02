import { afterEach, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { requestPromotion, validateReceipt } from '../scripts/request-docs-promotion.mjs'
vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.mocked(execFileSync).mockReset()
})
const receipt = {
  schema: 1,
  tag: 'v0.6.0',
  registryRevision: 'a'.repeat(40),
  docsRevision: 'b'.repeat(40),
}
it('retains the original docs snapshot on retry and rejects tag/source conflicts', () => {
  expect(validateReceipt(receipt, receipt.tag, receipt.registryRevision)).toBe(receipt)
  expect(() => validateReceipt(receipt, 'v0.6.1', receipt.registryRevision)).toThrow('Conflicting')
  expect(() => validateReceipt(receipt, receipt.tag, 'c'.repeat(40))).toThrow('Conflicting')
  expect(() =>
    validateReceipt({ ...receipt, docsRevision: 'main' }, receipt.tag, receipt.registryRevision),
  ).toThrow('Conflicting')
})
it('persists the receipt before App credentials are required', async () => {
  vi.mocked(execFileSync).mockImplementation((command, args) => {
    if (command === 'git')
      return args?.[0] === 'rev-list'
        ? receipt.registryRevision
        : receipt.docsRevision + '\trefs/heads/main'
    if (args?.[1] === 'view')
      return JSON.stringify({ assets: [], isDraft: false, isPrerelease: false })
    return ''
  })
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await requestPromotion(receipt.tag, { persistOnly: true })
  expect(execFileSync).toHaveBeenCalledWith(
    'gh',
    expect.arrayContaining(['upload']),
    expect.anything(),
  )
  expect(fetch).not.toHaveBeenCalled()
})
it('dispatch retries reuse the durable receipt without repinning next', async () => {
  vi.mocked(execFileSync).mockImplementation((command, args) => {
    if (command === 'git') return receipt.registryRevision
    if (args?.[1] === 'view') return JSON.stringify({ assets: [{ name: 'docs-promotion.json' }] })
    if (args?.[1] === 'download')
      writeFileSync(join(String(args[6]), 'docs-promotion.json'), JSON.stringify(receipt))
    return ''
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  await requestPromotion(receipt.tag)
  expect(execFileSync).not.toHaveBeenCalledWith(
    'git',
    expect.arrayContaining(['ls-remote']),
    expect.anything(),
  )
  expect(execFileSync).not.toHaveBeenCalledWith(
    'gh',
    expect.arrayContaining(['upload']),
    expect.anything(),
  )
})
