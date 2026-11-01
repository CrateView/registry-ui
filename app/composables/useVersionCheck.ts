import { compareVersions, stableVersion, type Release } from '../../shared/releases'

export function useVersionCheck() {
  const current = useRuntimeConfig().public.appVersion
  const releases = useState<Release[]>('releases', () => [])
  const loaded = useState('releases-loaded', () => false)
  const loading = useState('releases-loading', () => false)
  const failed = useState('releases-failed', () => false)
  const latest = computed(() => releases.value[0])
  const updateAvailable = computed(() =>
    Boolean(
      latest.value && stableVersion(current) && compareVersions(latest.value.version, current) > 0,
    ),
  )
  async function load() {
    if (loaded.value || loading.value) return
    loading.value = true
    failed.value = false
    try {
      releases.value = (await $fetch<{ releases: Release[] }>('/api/releases')).releases
      loaded.value = true
    } catch {
      failed.value = true
    } finally {
      loading.value = false
    }
  }
  return { current, releases, latest, updateAvailable, loading, failed, load }
}
