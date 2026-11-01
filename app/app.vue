<script setup lang="ts">
const config = useRuntimeConfig().public
const { locale } = useI18n()
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
  <UApp
    ><NuxtLayout><NuxtPage /></NuxtLayout
  ></UApp>
</template>
