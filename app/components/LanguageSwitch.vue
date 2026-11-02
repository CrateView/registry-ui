<script setup lang="ts">
import { de, en } from '@nuxt/ui/locale'
const { locale, setLocale, setLocaleCookie, t } = useI18n()
async function changeLocale(value: 'en' | 'de') {
  setLocaleCookie(value)
  await setLocale(value)
}
</script>
<template>
  <ULocaleSelect
    :model-value="locale"
    :locales="[en, de]"
    :aria-label="t('language')"
    class="w-48"
    @update:model-value="changeLocale($event as 'en' | 'de')"
  />
</template>
