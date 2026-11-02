<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const config = useRuntimeConfig().public
const registry = useRegistry()
const ready = ref(false)
const failure = ref('')
const links = computed(() => [
  ...(registry.info.value?.monitoringEnabled
    ? [{ label: t('overview'), icon: 'i-lucide-layout-dashboard', to: '/home' }]
    : []),
  { label: t('explore'), icon: 'i-lucide-boxes', to: '/explore' },
  { label: t('settings'), icon: 'i-lucide-settings', to: '/settings' },
])
const title = computed(() => {
  if (route.path === '/login') return t('signIn')
  if (route.path.startsWith('/image/'))
    return [route.params.name, route.params.tag].filter(Boolean).join(' / ')
  if (route.path === '/settings') return t('settings')
  return route.path === '/explore' ? t('explore') : t('overview')
})
const external = computed(() =>
  [
    { label: t('documentation'), icon: 'i-lucide-book-open', to: safeUrl(config.brandDocsUrl) },
    { label: 'GitHub', icon: 'i-lucide-github', to: safeUrl(config.brandRepositoryUrl) },
  ]
    .filter((link) => link.to)
    .map((link) => ({
      ...link,
      target: '_blank',
      rel: 'noopener noreferrer',
      trailingIcon: 'i-lucide-arrow-up-right',
    })),
)
const connected = computed(() => ready.value && !failure.value && !registry.info.value?.probeFailed)
async function initialize() {
  failure.value = ''
  try {
    await registry.initialize()
    ready.value = true
    if (registry.info.value?.auth && !registry.authenticated.value && route.path !== '/login')
      await navigateTo('/login')
  } catch (error) {
    failure.value = String(error)
  }
}
onMounted(initialize)
async function signOut() {
  try {
    await registry.logout()
  } catch {
    failure.value = t('logoutFailed')
  }
}
</script>
<template>
  <UDashboardGroup
    unit="rem"
    storage="local"
    storage-key="crateview-dashboard"
    class="text-default"
  >
    <UDashboardSidebar
      id="registry"
      collapsible
      resizable
      :default-size="16"
      :min-size="14"
      :max-size="22"
      :collapsed-size="4"
      class="bg-default"
      :ui="{ footer: 'border-t border-default' }"
    >
      <template #toggle>
        <UDashboardSidebarToggle :aria-label="t('close')" />
      </template>
      <template #header="{ collapsed }">
        <BrandMark :compact="collapsed" />
      </template>
      <template #default="{ collapsed }">
        <SearchBox v-if="ready && route.path !== '/login'" :collapsed="collapsed" />
        <UNavigationMenu
          :items="links"
          :collapsed="collapsed"
          orientation="vertical"
          :aria-label="t('navigation')"
          tooltip
          popover
        />
        <UNavigationMenu
          :items="external"
          :external-icon="false"
          :collapsed="collapsed"
          orientation="vertical"
          class="mt-auto"
          tooltip
        />
      </template>
      <template #footer="{ collapsed }">
        <UTooltip v-if="collapsed" :text="connected ? t('health') : t('connectionFailed')">
          <div
            class="flex h-10 w-full items-center justify-center"
            role="status"
            :aria-label="connected ? t('health') : t('connectionFailed')"
          >
            <span class="size-2 rounded-full" :class="connected ? 'bg-success' : 'bg-error'" />
          </div>
        </UTooltip>
        <div
          v-show="!collapsed"
          class="w-full min-w-0 space-y-3 rounded-lg border p-3"
          :class="connected ? 'border-success/20 bg-success/5' : 'border-error/20 bg-error/5'"
        >
          <div
            class="flex items-center gap-2 text-xs font-medium"
            :class="connected ? 'text-success' : 'text-error'"
            role="status"
          >
            <span
              class="size-1.5 shrink-0 rounded-full"
              :class="connected ? 'bg-success' : 'bg-error'"
            />
            {{ connected ? t('health') : t('connectionFailed') }}
          </div>
          <VersionChangelog />
        </div>
      </template>
    </UDashboardSidebar>
    <SearchPalette v-if="ready && route.path !== '/login'" />
    <UDashboardPanel id="content" class="bg-muted/35" :ui="{ body: 'p-0 sm:p-0 gap-0' }">
      <template #header>
        <UDashboardNavbar
          :title="title"
          :as="{ title: 'p' }"
          class="bg-default/95 backdrop-blur-sm"
          :ui="{ right: 'gap-3' }"
        >
          <template #toggle>
            <UDashboardSidebarToggle :aria-label="t('navigation')" />
          </template>
          <template #leading="{ sidebarCollapsed }">
            <UDashboardSidebarCollapse
              :aria-label="sidebarCollapsed?.value ? t('expand') : t('collapse')"
            />
          </template>
          <template #right>
            <UDropdownMenu
              v-if="registry.authenticated.value"
              :items="[
                { label: registry.user.value, type: 'label' },
                { label: t('signOut'), icon: 'i-lucide-log-out', onSelect: signOut },
              ]"
              :ui="{ content: 'max-w-[calc(100vw-2rem)]' }"
            >
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-user-round"
                trailing-icon="i-lucide-chevron-down"
                :label="registry.user.value"
                :title="registry.user.value"
                :ui="{ label: 'max-w-[24vw] truncate sm:max-w-48' }"
                :aria-label="t('account')"
              />
            </UDropdownMenu>
            <UButton
              v-else-if="registry.info.value?.auth && route.path !== '/login'"
              to="/login"
              size="sm"
              >{{ t('signIn') }}</UButton
            >
          </template>
        </UDashboardNavbar>
      </template>
      <template #body>
        <main class="flex-1 min-w-0">
          <div v-if="failure" class="page">
            <UAlert
              color="error"
              icon="i-lucide-circle-alert"
              :title="t('connectionFailed')"
              :description="failure"
            /><UButton class="mt-4" @click="initialize">{{ t('retry') }}</UButton>
          </div>
          <slot v-else-if="ready" />
          <div v-else class="page text-muted" role="status">{{ t('loading') }}</div>
        </main>
        <footer class="px-6 py-4 text-xs text-dimmed">
          {{ config.brandName }} · OCI Distribution
        </footer>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
