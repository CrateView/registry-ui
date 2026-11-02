<template>
  <USelectMenu
    class="w-48"
    :model-value="selected"
    :items="themes"
    :icon="selected?.icon"
    :aria-label="t('theme')"
    :search-input="false"
    :disabled="Boolean(colorMode.forced)"
    @update:model-value="selectTheme($event?.value)"
  />
</template>

<script setup lang="ts">
const { t } = useI18n();
const { colorMode, themes, selectTheme } = useInterfacePreferences();
const selected = computed(() => themes.value.find((theme) => theme.value === colorMode.preference) || themes.value[0]);
</script>
