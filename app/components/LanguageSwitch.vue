<script setup lang="ts">
import type { LocaleCode } from '#shared/locales'
import { languageOptions } from '~/utils/locales'
const { locale, setLocale, setLocaleCookie, t } = useI18n()
async function changeLocale(value: LocaleCode) {
  setLocaleCookie(value)
  await setLocale(value)
}
</script>
<template>
  <USelect
    :model-value="locale"
    :items="languageOptions"
    :aria-label="t('language')"
    class="w-44 max-w-full"
    size="sm"
    @update:model-value="changeLocale($event as LocaleCode)"
  />
</template>
