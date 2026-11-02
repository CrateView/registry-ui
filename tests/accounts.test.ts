import { describe, expect, it } from 'vitest';
import { accountBackend, canCreateUser, scopeForPath } from '../server/utils/accounts';

describe('account policy and registry scopes', () => {
  it('defaults to no creators; matches complete usernames and explicit wildcard', () => {
    expect(canCreateUser('', 'alice')).toBe(false);
    expect(canCreateUser('alice, bob', 'bob')).toBe(true);
    expect(canCreateUser('alice', 'ali')).toBe(false);
    expect(canCreateUser('*', '')).toBe(false);
    expect(canCreateUser('*', 'alice')).toBe(true);
  });
  it('maps repository reads, writes, deletion and cross-repository blob mounts', () => {
    expect(scopeForPath('/v2/team/app/manifests/latest')).toEqual(['repository:team/app:pull']);
    expect(scopeForPath('/v2/team/app/manifests/sha256%3Aabc', 'DELETE')).toEqual(['repository:team/app:delete']);
    expect(scopeForPath('/v2/team/app/blobs/uploads/?mount=sha256:abc&from=other/app', 'POST')).toEqual([
      'repository:team/app:push',
      'repository:other/app:pull',
    ]);
    expect(scopeForPath('/v2/_catalog')).toEqual([]);
    expect(scopeForPath('/v2/')).toEqual([]);
  });
});

// Explicit data-directory selection prevents a typo from silently contacting another backend.
describe('account backend selection', () => {
  const config = { authMode: 'off', authDataDir: '', authServiceUrl: '', authServiceSecret: '' };
  it('keeps management disabled by default and selects integrated htpasswd explicitly', () => {
    expect(accountBackend(config)).toBe('off');
    expect(accountBackend({ ...config, authMode: 'htpasswd', authDataDir: '/accounts' })).toBe('integrated');
  });
  it('retains existing external basic and token configurations', () => {
    for (const authMode of ['htpasswd', 'token'])
      expect(
        accountBackend({ ...config, authMode, authServiceUrl: 'http://auth:8080', authServiceSecret: 'secret' }),
      ).toBe('external');
  });
  it('rejects ambiguous backends and unsupported local modes', () => {
    for (const extra of [
      { authMode: 'off' },
      { authMode: 'token' },
      { authServiceUrl: 'http://auth:8080' },
      { authServiceSecret: 'secret' },
    ])
      expect(() => accountBackend({ ...config, authMode: 'htpasswd', authDataDir: '/accounts', ...extra })).toThrow(
        'Conflicting account backend configuration',
      );
  });
});
