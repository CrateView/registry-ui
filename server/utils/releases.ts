import { compareVersions, stableVersion, type Release } from '../../shared/releases';

interface GitHubRelease {
  draft: boolean;
  prerelease: boolean;
  tag_name: string;
  published_at: string | null;
  body: string | null;
}

export function createReleaseLoader(fetcher: typeof fetch = fetch, now = Date.now) {
  let cached: Release[] | undefined;
  let expires = 0;
  let pending: Promise<Release[]> | undefined;
  return function load(): Promise<Release[]> {
    if (cached && now() < expires) return Promise.resolve(cached);
    if (pending) return pending;
    pending = (async () => {
      const releases: Release[] = [];
      // Traverse pages so version ordering does not depend on publication order.
      for (let page = 1; ; page++) {
        const response = await fetcher(
          `https://api.github.com/repos/crateview/registry-ui/releases?per_page=100&page=${page}`,
          {
            headers: { Accept: 'application/vnd.github+json' },
            signal: AbortSignal.timeout(5000),
          },
        );
        if (!response.ok) throw new Error(`GitHub releases unavailable (${response.status})`);
        const entries: GitHubRelease[] = await response.json();
        for (const entry of entries) {
          const version = stableVersion(entry.tag_name);
          if (!entry.draft && !entry.prerelease && version)
            releases.push({
              version,
              publishedAt: entry.published_at,
              markdown: entry.body || '',
              url: `https://github.com/crateview/registry-ui/releases/tag/${encodeURIComponent(entry.tag_name)}`,
            });
        }
        if (entries.length < 100) break;
      }
      cached = releases.sort((a, b) => compareVersions(b.version, a.version));
      expires = now() + 3600000;
      return cached;
    })().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
