import { describe, it, expect } from 'vitest'
import { canCreateUser, scopeForPath } from '../server/utils/accounts'

describe('account policy and registry scopes', () => {
  it('defaults to no creators; matches complete usernames and explicit wildcard', () => {
    expect(canCreateUser('', 'alice')).toBe(false)
    expect(canCreateUser('alice, bob', 'bob')).toBe(true)
    expect(canCreateUser('alice', 'ali')).toBe(false)
    expect(canCreateUser('*', '')).toBe(false)
    expect(canCreateUser('*', 'alice')).toBe(true)
  })
  it('maps repository reads, writes, deletion and cross-repository blob mounts', () => {
    expect(scopeForPath('/v2/team/app/manifests/latest')).toEqual(['repository:team/app:pull'])
    expect(scopeForPath('/v2/team/app/manifests/sha256%3Aabc', 'DELETE')).toEqual([
      'repository:team/app:delete',
    ])
    expect(
      scopeForPath('/v2/team/app/blobs/uploads/?mount=sha256:abc&from=other/app', 'POST'),
    ).toEqual(['repository:team/app:push', 'repository:other/app:pull'])
    expect(scopeForPath('/v2/_catalog')).toEqual([])
    expect(scopeForPath('/v2/')).toEqual([])
  })
})
