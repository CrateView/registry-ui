<script setup lang="ts">
import { getCodeHighlighter, highlightCode, plainCode } from '../utils/highlighting'

const props = defineProps<{ code: string; language?: string }>()
const html = ref(plainCode(props.code))
onMounted(() =>
  watch(
    () => [props.code, props.language] as const,
    async ([code, language], _, onCleanup) => {
      let active = true
      onCleanup(() => (active = false))
      html.value = plainCode(code)
      try {
        const highlighter = await getCodeHighlighter()
        if (active) html.value = highlightCode(highlighter, code, language)
      } catch {
        // Keep escaped plain text if highlighting cannot initialize.
      }
    },
    { immediate: true },
  ),
)
</script>
<template>
  <!-- eslint-disable vue/no-v-html --><!-- Only escaped text or Shiki-generated HTML is rendered. -->
  <div dir="ltr" class="code-block" v-html="html" />
</template>
