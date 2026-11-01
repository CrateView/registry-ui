<script setup lang="ts">
const { locale, setLocale, setLocaleCookie, t } = useI18n()
async function changeLocale(value: 'en' | 'de') {
  setLocaleCookie(value)
  await setLocale(value)
}
</script>
<template>
  <USelect
    :model-value="locale"
    :items="[
      { label: 'EN', value: 'en' },
      { label: 'DE', value: 'de' },
    ]"
    :aria-label="t('language')"
    size="sm"
    class="w-20"
    @update:model-value="changeLocale($event as 'en' | 'de')"
  />
</template>
