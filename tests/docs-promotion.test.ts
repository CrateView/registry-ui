import { expect, it } from 'vitest'
import { validateReceipt } from '../scripts/request-docs-promotion.mjs'
it('retains the original docs snapshot on retry and rejects tag/source conflicts', () => {
  const receipt = {
    schema: 1,
    tag: 'v0.6.0',
    registryRevision: 'a'.repeat(40),
    docsRevision: 'b'.repeat(40),
  }
  expect(validateReceipt(receipt, receipt.tag, receipt.registryRevision)).toBe(receipt)
  expect(() => validateReceipt(receipt, 'v0.6.1', receipt.registryRevision)).toThrow('Conflicting')
  expect(() => validateReceipt(receipt, receipt.tag, 'c'.repeat(40))).toThrow('Conflicting')
  expect(() =>
    validateReceipt({ ...receipt, docsRevision: 'main' }, receipt.tag, receipt.registryRevision),
  ).toThrow('Conflicting')
})
