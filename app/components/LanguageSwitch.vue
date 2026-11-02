<template>
  <USelect
    class="w-44 max-w-full"
    size="sm"
    :model-value="locale"
    :items="languageOptions"
    :aria-label="t('language')"
    @update:model-value="changeLocale($event as LocaleCode)"
  />
</template>

<script setup lang="ts">
import type { LocaleCode } from '#shared/locales';
import { languageOptions } from '~/utils/locales';

const { locale, setLocale, setLocaleCookie, t } = useI18n();
async function changeLocale(value: LocaleCode) {
  setLocaleCookie(value);
  await setLocale(value);
}
</script>
