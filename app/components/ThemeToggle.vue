<template>
  <UButton
    color="neutral"
    variant="ghost"
    :aria-label="t('theme')"
    :icon="colorMode.value === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun'"
    :disabled="Boolean(colorMode.forced)"
    @click="selectTheme(colorMode.value === 'dark' ? 'light' : 'dark')"
  />
</template>

<script setup lang="ts">
const { t } = useI18n();
const { colorMode, selectTheme } = useInterfacePreferences();
</script>
