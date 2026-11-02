<script setup lang="ts">
import { pullDestinationSchema } from '../../shared/validation'
const props = defineProps<{ name: string; tag: string; artifact?: boolean }>()
const { t } = useI18n()
const { copy } = useFormatting()
const tool = ref('docker')
const destination = ref('./image')
const destinationError = computed(() =>
  tool.value === 'skopeo' && !pullDestinationSchema.safeParse(destination.value).success
    ? t('destinationInvalid')
    : undefined,
)
watch(
  () => props.artifact,
  (value) => {
    tool.value = value ? 'oras' : 'docker'
  },
  { immediate: true },
)
const command = computed(() => {
  const reference = `${window.location.host}/${props.name}${props.tag.startsWith('sha256:') ? '@' : ':'}${props.tag}`
  if (destinationError.value) return ''
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
    /><UFormField v-if="tool === 'skopeo'" :label="t('path')" :error="destinationError"
      ><UInput v-model="destination" dir="ltr" :aria-label="t('path')" class="w-full"
    /></UFormField>
    <div v-if="command" class="rounded-lg bg-muted p-3">
      <CodeBlock :code="command" language="bash" class="text-xs leading-relaxed" />
    </div>
    <UButton
      icon="i-lucide-copy"
      color="neutral"
      variant="outline"
      block
      :disabled="Boolean(destinationError)"
      @click="copy(command)"
      >{{ t('copy') }}</UButton
    >
  </div>
</template>
