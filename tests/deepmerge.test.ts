import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const merge = require('deepmerge')
it('rejects prototype poisoning from both source and target', () => {
  const malicious = JSON.parse(
    '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
  )
  for (const result of [
    merge({}, malicious),
    merge(malicious, {}),
    merge({ nested: malicious }, {}),
  ]) {
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(result.polluted).toBeUndefined()
    expect(Object.hasOwn(result, '__proto__')).toBe(false)
    expect(Object.hasOwn(result, 'constructor')).toBe(false)
    if (result.nested) expect(result.nested.polluted).toBeUndefined()
  }
})
it('preserves nested merges, arrays, symbols and custom array merging', () => {
  const key = Symbol('key')
  expect(merge({ nested: { a: 1 }, list: [1], [key]: 1 }, { nested: { b: 2 }, list: [2] })).toEqual(
    { nested: { a: 1, b: 2 }, list: [1, 2], [key]: 1 },
  )
  expect(
    merge({ list: [1] }, { list: [2] }, { arrayMerge: (_a: unknown, b: unknown) => b }),
  ).toEqual({ list: [2] })
})
