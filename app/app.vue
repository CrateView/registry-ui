<script setup lang="ts">
import { de, en } from '@nuxt/ui/locale'
const config = useRuntimeConfig().public
const { locale } = useI18n()
const uiLocale = computed(() => (locale.value === 'de' ? de : en))
useHead(() => ({
  htmlAttrs: { lang: locale.value },
  titleTemplate: (title) =>
    (config.brandTitleTemplate || `%s · ${config.brandName}`).replaceAll(
      '%s',
      title || config.brandName,
    ),
  meta: [{ name: 'description', content: config.brandDescription }],
  link: [
    { rel: 'icon', href: safeUrl(config.brandFavicon) || '/favicon.ico' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
  ],
}))
</script>
<template>
  <UApp :locale="uiLocale"
    ><NuxtLayout><NuxtPage /></NuxtLayout
  ></UApp>
</template>
