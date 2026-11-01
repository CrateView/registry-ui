<script setup lang="ts">
const props = defineProps<{ name: string; tag: string; artifact?: boolean }>()
const { t } = useI18n()
const { copy } = useFormatting()
const tool = ref('docker')
const destination = ref('./image')
watch(
  () => props.artifact,
  (value) => {
    tool.value = value ? 'oras' : 'docker'
  },
  { immediate: true },
)
const command = computed(() => {
  const reference = `${window.location.host}/${props.name}${props.tag.startsWith('sha256:') ? '@' : ':'}${props.tag}`
  if (tool.value === 'skopeo')
    return `skopeo copy docker://${reference} oci:${destination.value || './image'}:latest`
  return `${tool.value} ${props.artifact && tool.value === 'podman' ? 'artifact ' : ''}pull ${reference}`
})
</script>
<template>
  <div class="panel space-y-4 p-5">
    <h3 class="flex items-center gap-2 font-semibold">
      <UIcon name="i-lucide-terminal" class="text-primary" />{{ t('pull') }}
    </h3>
    <USelect
      v-model="tool"
      :items="artifact ? ['oras', 'podman'] : ['docker', 'podman', 'skopeo']"
      :aria-label="t('pull')"
      class="w-full"
    /><UInput
      v-if="tool === 'skopeo'"
      v-model="destination"
      :aria-label="t('path')"
      class="w-full"
    />
    <div class="rounded-lg bg-muted p-3">
      <code class="block break-all text-xs leading-relaxed">{{ command }}</code>
    </div>
    <UButton icon="i-lucide-copy" color="neutral" variant="outline" block @click="copy(command)">{{
      t('copy')
    }}</UButton>
  </div>
</template>
