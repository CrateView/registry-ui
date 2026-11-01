<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { getCodeHighlighter, highlightCode } from '../utils/highlighting'
const props = defineProps<{ text: string }>()
const parser = new MarkdownIt({ html: false, linkify: true })
const rendered = ref(parser.render(props.text))
watch(
  () => props.text,
  async (text, _, onCleanup) => {
    let active = true
    onCleanup(() => (active = false))
    rendered.value = parser.render(text)
    try {
      const highlighter = await getCodeHighlighter()
      if (!active) return
      const highlightedParser = new MarkdownIt({
        html: false,
        linkify: true,
        highlight: (code, language) => highlightCode(highlighter, code, language),
      })
      rendered.value = highlightedParser.render(text)
    } catch {
      // Keep safely rendered Markdown if highlighting cannot initialize.
    }
  },
  { immediate: true },
)
</script>
<template>
  <!-- eslint-disable vue/no-v-html --><!-- MarkdownIt disables raw HTML and rejects unsafe link protocols. -->
  <div class="prose text-sm text-muted" v-html="rendered" />
</template>
