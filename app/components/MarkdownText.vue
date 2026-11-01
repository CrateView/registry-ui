<script setup lang="ts">
import MarkdownIt from 'markdown-it'
const props = defineProps<{ text: string }>()
const parser = new MarkdownIt({ html: false, linkify: true })
const rendered = computed(() => parser.render(props.text))
</script>
<template>
  <!-- eslint-disable vue/no-v-html --><!-- MarkdownIt disables raw HTML and rejects unsafe link protocols. -->
  <div class="prose text-sm text-muted" v-html="rendered" />
</template>
