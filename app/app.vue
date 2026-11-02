<template>
  <UApp :locale="uiLocale">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
import { getLocale } from '#shared/locales';
import { pwaAssetUrl } from '#shared/pwa';
import { getUiLocale } from '~/utils/locales';

const runtimeConfig = useRuntimeConfig();
useFetch(`${runtimeConfig.app.baseURL.replace(/\/$/, '')}/api/branding`, { key: 'branding' });
const branding = useBranding();
const config = runtimeConfig.public;
const { locale, t } = useI18n();
const uiLocale = computed(() => getUiLocale(locale.value));
useHead(() => ({
  htmlAttrs: { lang: locale.value, dir: getLocale(locale.value).dir },
  titleTemplate: (title) =>
    (config.brandTitleTemplate || `%s · ${config.brandName}`).replaceAll('%s', title || config.brandName),
  meta: [
    { name: 'description', content: config.brandDescription || t('overviewHint') },
    { name: 'theme-color', content: '#18181b' },
    { name: 'apple-mobile-web-app-title', content: config.brandName },
  ],
  link: [
    { rel: 'icon', href: safeUrl(branding.value.favicon) || '/favicon.ico' },
    { rel: 'manifest', href: `${runtimeConfig.app.baseURL.replace(/\/$/, '')}/manifest.webmanifest` },
    {
      rel: 'apple-touch-icon',
      href: pwaAssetUrl(safeUrl(branding.value.pwaIcon192) || '/branding/pwa-192.png', runtimeConfig.app.baseURL),
    },
  ],
}));
</script>
