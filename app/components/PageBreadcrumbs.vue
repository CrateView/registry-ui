<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'
import { repoPath } from '../utils/queries'
const route = useRoute()
const { t } = useI18n()
const items = computed<BreadcrumbItem[]>(() => {
  const home = {
    label: t('home'),
    icon: 'i-lucide-house',
    to: '/home',
    ui: { linkLabel: 'sr-only' },
  }
  let result: BreadcrumbItem[]
  if (route.path === '/home') result = [{ label: t('overview'), icon: 'i-lucide-house' }]
  else if (route.path.startsWith('/image/')) {
    const name = String(route.params.name || '')
    const reference = String(route.params.tag || '')
    result = [
      home,
      { label: t('explore'), to: '/explore' },
      { label: name, ...(reference ? { to: repoPath(name) } : {}) },
    ]
    if (reference) result.push({ label: reference })
  } else if (route.path === '/users' || route.path === '/settings') {
    result = [
      home,
      { label: t('administration') },
      { label: t(route.path === '/users' ? 'users' : 'settings') },
    ]
  } else result = [home, { label: t(route.path === '/account' ? 'account' : 'explore') }]
  return result.map((item, index) => ({ ...item, active: index === result.length - 1 }))
})
</script>
<template>
  <UBreadcrumb :items="items" class="min-w-0">
    <template #item-label="{ item }"
      ><bdi :title="item.label">{{ item.label }}</bdi></template
    >
  </UBreadcrumb>
</template>
