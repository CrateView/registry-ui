<script setup lang="ts">
const props = defineProps<{ collapsed?: boolean }>()
const { t } = useI18n()
const open = useState<boolean>('command-palette-open', () => false)
const mac = ref(false)
onMounted(() => {
  mac.value = /Mac|iPhone|iPad/.test(navigator.platform)
})
</script>
<template>
  <UButton
    icon="i-lucide-search"
    color="neutral"
    :variant="props.collapsed ? 'ghost' : 'outline'"
    :class="props.collapsed ? '' : 'w-full min-w-0 text-muted'"
    :aria-label="t('search')"
    aria-keyshortcuts="Meta+k Control+k /"
    aria-haspopup="dialog"
    @click="open = true"
  >
    <template v-if="!props.collapsed" #default
      ><span class="min-w-0 flex-1 truncate text-left">{{ t('search') }}</span></template
    >
    <template v-if="!props.collapsed" #trailing
      ><span class="flex shrink-0 gap-1"
        ><UKbd>{{ mac ? '⌘' : 'Ctrl' }}</UKbd
        ><UKbd>K</UKbd></span
      ></template
    >
  </UButton>
</template>
