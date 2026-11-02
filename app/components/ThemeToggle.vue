<script setup lang="ts">
const { t } = useI18n()
const { colorMode, selectTheme } = useInterfacePreferences()
</script>
<template>
  <UButton
    :aria-label="t('theme')"
    color="neutral"
    variant="ghost"
    :icon="colorMode.value === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun'"
    :disabled="Boolean(colorMode.forced)"
    @click="selectTheme(colorMode.value === 'dark' ? 'light' : 'dark')"
  />
</template>
