import type { Image, Repo } from '~/utils/types'
interface RegistryStatus {
  auth: boolean
  authType: string
  user: string
  deleteEnabled: boolean
}
export function useRegistry() {
  const route = useRoute()
  const info = useState<RegistryStatus | null>('registry-info', () => null)
  const user = computed(() => info.value?.user || '')
  const authenticated = computed(() => Boolean(user.value))
  async function request<T>(path: string, options: Parameters<typeof $fetch>[1] = {}): Promise<T> {
    try {
      return (await $fetch<T>(path, { ...options, credentials: 'same-origin', retry: 0 })) as T
    } catch (error) {
      const failure = error as {
        statusCode?: number
        status?: number
        data?: { statusMessage?: string }
        message?: string
      }
      if ((failure.statusCode || failure.status) === 401) {
        if (info.value) {
          info.value.user = ''
          info.value.auth = true
        }
        if (route.path !== '/login') await navigateTo('/login')
      }
      throw new Error(failure.data?.statusMessage || failure.message || 'Registry request failed', {
        cause: error,
      })
    }
  }
  async function initialize() {
    info.value = await request<RegistryStatus>('/api/registry/status')
  }
  async function login(username: string, password: string) {
    await request('/api/auth/login', { method: 'POST', body: { username, password } })
    await initialize()
    await navigateTo('/home')
  }
  async function logout() {
    await request('/api/auth/logout', { method: 'POST' })
    await initialize()
    await navigateTo(info.value?.auth ? '/login' : '/home')
  }
  const catalog = async () =>
    (await request<{ repositories: string[] }>('/api/registry/catalog')).repositories
  const repository = (name: string, summary = false) =>
    request<{ Summary: Repo; Images: Image[] }>('/api/registry/repository', {
      query: { name, summary },
    })
  const image = (name: string, reference: string) =>
    request<Image>('/api/registry/image', { query: { name, reference } })
  return {
    info,
    user,
    authenticated,
    request,
    initialize,
    login,
    logout,
    catalog,
    repository,
    image,
  }
}
