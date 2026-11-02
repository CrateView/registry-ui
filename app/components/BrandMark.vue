<script setup lang="ts">
defineProps<{ compact?: boolean }>()
const config = useRuntimeConfig().public
const branding = useBranding()
const mode = useColorMode()
const logo = computed(() =>
  safeUrl(
    mode.value === 'dark'
      ? branding.value.logoDark || branding.value.logoLight
      : branding.value.logoLight || branding.value.logoDark,
  ),
)
</script>
<template>
  <NuxtLink to="/home" class="flex min-w-0 items-center gap-3" :aria-label="config.brandName">
    <img
      v-if="logo"
      :src="logo"
      :alt="config.brandName"
      class="h-9 max-w-32 shrink-0 object-contain"
    />
    <span
      v-else
      class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white"
      ><UIcon name="i-lucide-boxes" class="size-5"
    /></span>
    <span v-if="!compact" class="truncate text-base font-bold tracking-tight text-highlighted">{{
      config.brandName
    }}</span>
  </NuxtLink>
</template>
