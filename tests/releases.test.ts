import { expect, it, vi } from 'vitest';
import { createReleaseLoader } from '../server/utils/releases';
import { compareVersions, stableVersion } from '../shared/releases';

it('normalizes stable tags and compares numeric segments', () => {
  expect(stableVersion('v1.2.3')).toBe('1.2.3');
  for (const tag of ['01.2.3', '1.2', 'v1.2.3-rc.1', 'latest']) expect(stableVersion(tag)).toBeNull();
  expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
  expect(compareVersions('1.0.0+build', '1.0.0')).toBe(0);
  expect(compareVersions('0.9.0', '1.0.0')).toBe(-1);
});
it('filters releases, sorts versions, deduplicates concurrent loads and expires cache', async () => {
  let now = 0;
  const entry = (tag_name: string, draft = false, prerelease = false) => ({
    tag_name,
    draft,
    prerelease,
    body: 'Notes',
    published_at: null,
  });
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify([
            entry('v1.9.0'),
            entry('v1.10.0'),
            entry('v2.0.0', true),
            entry('v3.0.0', false, true),
            entry('invalid'),
          ]),
        ),
    );
  const load = createReleaseLoader(fetcher, () => now);
  const [releases] = await Promise.all([load(), load()]);
  expect(releases.map((r) => r.version)).toEqual(['1.10.0', '1.9.0']);
  await load();
  expect(fetcher).toHaveBeenCalledTimes(1);
  now = 3600001;
  await load();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('does not cache GitHub failures and permits retry', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('', { status: 403 }))
    .mockResolvedValueOnce(new Response('[]'));
  const load = createReleaseLoader(fetcher);
  await expect(load()).rejects.toThrow('403');
  expect(await load()).toEqual([]);
});
