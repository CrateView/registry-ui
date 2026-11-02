<script setup lang="ts">
defineProps<{ pending?: boolean; error?: string; empty?: boolean }>()
const { t } = useI18n()
defineEmits<{ retry: [] }>()
</script>
<template>
  <div v-if="pending" role="status" class="flex justify-center p-16 text-muted">
    <UIcon name="i-lucide-loader-circle" class="me-2 size-5 animate-spin" />{{ t('loading') }}
  </div>
  <div v-else-if="error" class="space-y-3">
    <UAlert
      :title="t('error')"
      :description="error"
      color="error"
      icon="i-lucide-triangle-alert"
    /><UButton variant="outline" @click="$emit('retry')">{{ t('retry') }}</UButton>
  </div>
  <div v-else-if="empty" class="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
    <UIcon name="i-lucide-package-open" class="size-10 text-dimmed" />
    <h3 class="font-semibold">{{ t('empty') }}</h3>
    <p class="text-sm text-muted">{{ t('emptyHint') }}</p>
  </div>
  <slot v-else />
</template>
