<script setup lang="ts">
const { t } = useI18n()
const registry = useRegistry()
const route = useRoute()
const searchInput = useTemplateRef<{ inputRef: HTMLInputElement }>('searchInput')
const term = ref(String(route.query.search || ''))
const suggestions = ref<{ label: string; to: string }[]>([])
const focused = ref(false)
const failure = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let sequence = 0
watch(term, (value) => {
  clearTimeout(timer)
  const current = ++sequence
  suggestions.value = []
  failure.value = ''
  if (!value.trim()) return
  timer = setTimeout(async () => {
    try {
      let result: { label: string; to: string }[]
      if (value.includes(':')) {
        const separator = value.lastIndexOf(':')
        const name = value.slice(0, separator)
        const response = await registry.repository(name)
        result = response.Images.filter((image) => image.Tag?.includes(value.slice(separator + 1)))
          .slice(0, 5)
          .map((image) => ({ label: `${name}:${image.Tag}`, to: imagePath(name, image.Tag!) }))
      } else {
        result = (await registry.catalog())
          .filter((name) => name.includes(value))
          .slice(0, 5)
          .map((name) => ({ label: name, to: repoPath(name) }))
      }
      if (current === sequence) suggestions.value = result
    } catch (error) {
      if (current === sequence) failure.value = String(error)
    }
  }, 250)
})
watch(
  () => route.fullPath,
  () => {
    focused.value = false
    term.value = String(route.query.search || '')
  },
)
onMounted(() => window.addEventListener('keydown', focusSearch))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', focusSearch)
  clearTimeout(timer)
  sequence++
})
function focusSearch(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.metaKey) return
  const controlK = event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'k'
  const slash = !event.ctrlKey && event.key === '/'
  if (!controlK && !slash) return
  const target = event.target
  if (
    slash &&
    target instanceof Element &&
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
    )
  )
    return
  const input = searchInput.value?.inputRef
  if (!input) return
  event.preventDefault()
  input.focus()
}
function submit() {
  focused.value = false
  navigateTo({ path: '/explore', query: { search: term.value } })
}
function onFocusOut(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
    focused.value = false
}
</script>
<template>
  <form
    class="relative w-full max-w-xl"
    role="search"
    @focusout="onFocusOut"
    @submit.prevent="submit"
  >
    <UInput
      ref="searchInput"
      v-model="term"
      aria-keyshortcuts="/ Control+k"
      icon="i-lucide-search"
      :placeholder="t('search')"
      :aria-label="t('search')"
      class="w-full"
      @focus="focused = true"
      @keydown.esc="focused = false"
    />
    <div
      v-if="focused && term.trim()"
      class="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-default bg-default shadow-xl"
    >
      <NuxtLink
        v-for="item in suggestions"
        :key="item.to"
        :to="item.to"
        class="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted focus:bg-muted"
        @click="focused = false"
        ><UIcon name="i-lucide-box" class="text-primary" />{{ item.label }}</NuxtLink
      >
      <p v-if="failure" class="p-3 text-xs text-error">{{ failure }}</p>
      <button
        type="submit"
        class="w-full border-t border-default p-3 text-left text-xs text-muted hover:bg-muted"
      >
        {{ t('searchResults') }}: {{ term }}
      </button>
    </div>
  </form>
</template>
