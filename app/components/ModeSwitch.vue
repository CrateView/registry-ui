<script setup lang="ts">
const mode = useColorMode()
const { t } = useI18n()
const modes = [
  { value: 'system', icon: 'i-lucide-monitor' },
  { value: 'light', icon: 'i-lucide-sun' },
  { value: 'dark', icon: 'i-lucide-moon' },
]
</script>
<template>
  <div class="flex rounded-lg border border-default bg-muted p-0.5" :aria-label="t('theme')">
    <UButton
      v-for="item in modes"
      :key="item.value"
      :icon="item.icon"
      :aria-label="t(item.value)"
      :aria-pressed="mode.preference === item.value"
      :color="mode.preference === item.value ? 'primary' : 'neutral'"
      :variant="mode.preference === item.value ? 'soft' : 'ghost'"
      size="xs"
      @click="mode.preference = item.value"
    />
  </div>
</template>
