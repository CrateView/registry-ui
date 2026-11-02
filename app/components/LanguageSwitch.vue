<script setup lang="ts">
import { de, en } from '@nuxt/ui/locale'
const { t } = useI18n()
const { locale, selectLocale } = useInterfacePreferences()
</script>
<template>
  <ULocaleSelect
    :model-value="locale"
    :locales="[en, de]"
    :aria-label="t('language')"
    class="w-48"
    @update:model-value="selectLocale($event)"
  />
</template>
