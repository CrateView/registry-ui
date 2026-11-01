<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const config = useRuntimeConfig().public
const registry = useRegistry()
const ready = ref(false)
const failure = ref('')
const links = computed(() => [
  { label: t('overview'), icon: 'i-lucide-layout-dashboard', to: '/home' },
  { label: t('explore'), icon: 'i-lucide-boxes', to: '/explore' },
])
const title = computed(() => {
  if (route.path === '/login') return t('signIn')
  if (route.path.startsWith('/image/'))
    return [route.params.name, route.params.tag].filter(Boolean).join(' / ')
  return route.path === '/explore' ? t('explore') : t('overview')
})
const external = computed(() =>
  [
    { label: t('product'), url: config.brandProductUrl },
    { label: t('documentation'), url: config.brandDocsUrl },
    { label: t('source'), url: config.brandRepositoryUrl },
  ].filter((link) => safeUrl(link.url)),
)
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
      :ui="{ footer: 'flex-col items-stretch border-t border-default' }"
    >
      <template #toggle>
        <UDashboardSidebarToggle :aria-label="t('close')" />
      </template>
      <template #header="{ collapsed }">
        <BrandMark :compact="collapsed" />
      </template>
      <template #default="{ collapsed, collapse }">
        <SearchBox
          v-if="ready && route.path !== '/login'"
          :collapsed="collapsed"
          @expand="collapse(false)"
        />
        <UNavigationMenu
          :items="links"
          :collapsed="collapsed"
          orientation="vertical"
          :aria-label="t('navigation')"
          tooltip
        />
      </template>
      <template #footer="{ collapsed }">
        <div v-show="!collapsed" class="space-y-3 py-2">
          <VersionChangelog />
          <div class="flex flex-wrap items-center justify-between gap-2">
            <ModeSwitch />
            <LanguageSwitch />
          </div>
          <a
            v-for="link in external"
            :key="link.label"
            :href="safeUrl(link.url)"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-between text-xs text-muted hover:text-primary"
            >{{ link.label }}<UIcon name="i-lucide-arrow-up-right"
          /></a>
          <div class="flex items-center gap-2 text-xs text-muted">
            <span
              class="size-1.5 rounded-full"
              :class="ready && !failure ? 'bg-success' : 'bg-error'"
            />
            {{ ready && !failure ? t('health') : t('connectionFailed') }}
          </div>
        </div>
      </template>
    </UDashboardSidebar>
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
            >
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-user-round"
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
