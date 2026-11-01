<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const config = useRuntimeConfig().public
const registry = useRegistry()
const collapsed = ref(false)
const mobileOpen = ref(false)
const ready = ref(false)
const failure = ref('')
const links = computed(() => [
  { label: t('overview'), icon: 'i-lucide-layout-dashboard', to: '/home' },
  { label: t('explore'), icon: 'i-lucide-boxes', to: '/explore' },
])
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
watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false
  },
)
async function signOut() {
  try {
    await registry.logout()
  } catch {
    failure.value = t('logoutFailed')
  }
}
</script>
<template>
  <div class="min-h-screen bg-muted/35 text-default">
    <button
      v-if="mobileOpen"
      :aria-label="t('close')"
      class="fixed inset-0 z-40 bg-black/40 lg:hidden"
      @click="mobileOpen = false"
    />
    <aside
      id="registry-sidebar"
      class="fixed inset-y-0 left-0 z-50 flex flex-col border-r border-default bg-default transition-[width,transform] duration-200"
      :class="[
        collapsed ? 'lg:w-20' : 'lg:w-64',
        mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64 lg:translate-x-0',
      ]"
    >
      <div class="flex h-20 items-center px-6">
        <BrandMark :compact="collapsed && !mobileOpen" />
      </div>
      <div class="px-5 pb-4 pt-5">
        <span v-if="!collapsed || mobileOpen" class="eyebrow">{{ t('workspace') }}</span>
      </div>
      <nav class="flex-1 space-y-1 px-3" :aria-label="t('navigation')">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          :title="link.label"
          class="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors"
          :class="
            route.fullPath === link.to
              ? 'bg-primary/10 text-primary'
              : 'text-muted hover:bg-muted hover:text-highlighted'
          "
          ><UIcon :name="link.icon" class="size-5 shrink-0" /><span
            v-if="!collapsed || mobileOpen"
            >{{ link.label }}</span
          ></NuxtLink
        >
      </nav>
      <div class="space-y-4 border-t border-default p-4">
        <div v-show="!collapsed || mobileOpen"><VersionChangelog /></div>
        <div v-if="!collapsed || mobileOpen" class="flex items-center justify-between gap-3">
          <ModeSwitch />
          <LanguageSwitch />
        </div>
        <template v-if="!collapsed || mobileOpen"
          ><a
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
            />{{ ready && !failure ? t('health') : t('connectionFailed') }}
          </div></template
        >
      </div>
    </aside>
    <div class="transition-[padding] duration-200" :class="collapsed ? 'lg:pl-20' : 'lg:pl-64'">
      <header
        class="sticky top-0 z-30 flex min-h-20 flex-wrap items-center gap-3 border-b border-default bg-default/95 px-5 py-3 backdrop-blur-sm sm:px-8"
      >
        <div class="flex min-w-0 flex-1 items-center gap-3">
          <UButton
            :icon="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
            color="neutral"
            variant="ghost"
            :aria-label="collapsed ? t('expand') : t('collapse')"
            :aria-expanded="!collapsed"
            aria-controls="registry-sidebar"
            class="hidden shrink-0 lg:flex"
            @click="collapsed = !collapsed"
          />
          <UButton
            icon="i-lucide-menu"
            color="neutral"
            variant="ghost"
            class="shrink-0 lg:hidden"
            :aria-label="t('navigation')"
            :aria-expanded="mobileOpen"
            aria-controls="registry-sidebar"
            @click="mobileOpen = !mobileOpen"
          />
          <SearchBox v-if="ready && route.path !== '/login'" />
        </div>
        <div class="ml-auto flex items-center gap-2 sm:gap-3">
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
        </div>
      </header>
      <main>
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
      <footer class="px-8 py-6 text-xs text-dimmed">
        {{ config.brandName }} · OCI Distribution
      </footer>
    </div>
  </div>
</template>
