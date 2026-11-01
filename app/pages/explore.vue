<script setup lang="ts">
import type { Repo, Image } from '~/utils/types'
const { t } = useI18n()
useHead(() => ({ title: t('explore') }))
const registry = useRegistry()
const route = useRoute()
const names = ref<string[]>([])
const repos = ref<Repo[]>([])
const images = ref<Image[]>([])
const term = ref(String(route.query.search || ''))
const sort = ref('az')
const page = ref(1)
const pending = ref(false)
const error = ref('')
let sequence = 0
const filtered = computed(() =>
  names.value
    .filter((name) => name.toLowerCase().includes(term.value.toLowerCase()))
    .toSorted((a, b) => a.localeCompare(b) * (sort.value === 'az' ? 1 : -1)),
)
async function load() {
  const current = ++sequence
  pending.value = true
  error.value = ''
  try {
    if (term.value.includes(':')) {
      const separator = term.value.lastIndexOf(':')
      const result = await registry.repository(term.value.slice(0, separator))
      if (current === sequence) {
        repos.value = []
        images.value = result.Images.filter((image) =>
          image.Tag?.includes(term.value.slice(separator + 1)),
        )
      }
    } else {
      const result = await Promise.all(
        filtered.value.slice((page.value - 1) * 12, page.value * 12).map(async (name) => {
          try {
            return (await registry.repository(name, true)).Summary
          } catch (failure) {
            return { Name: name, Error: String(failure) }
          }
        }),
      )
      if (current === sequence) {
        repos.value = result
        images.value = []
      }
    }
  } catch (failure) {
    if (current === sequence) error.value = String(failure)
  } finally {
    if (current === sequence) pending.value = false
  }
}
onMounted(async () => {
  pending.value = true
  try {
    names.value = await registry.catalog()
    await load()
  } catch (failure) {
    error.value = String(failure)
    pending.value = false
  }
})
watch([page, sort], load)
watch(
  () => route.query.search,
  (value) => {
    term.value = String(value || '')
    page.value = 1
    load()
  },
)
function search() {
  page.value = 1
  navigateTo({ path: '/explore', query: { search: term.value } })
  load()
}
</script>
<template>
  <div class="page space-y-6">
    <div>
      <p class="eyebrow mb-3">{{ t('registry') }}</p>
      <h1 class="page-title">{{ t('explore') }}</h1>
      <p class="mt-3 text-sm text-muted">{{ t('exploreHint') }}</p>
    </div>
    <form class="flex gap-3" @submit.prevent="search">
      <UInput
        v-model="term"
        icon="i-lucide-search"
        class="flex-1"
        :placeholder="t('search')"
        :aria-label="t('search')"
      /><UButton type="submit" icon="i-lucide-search">{{ t('searchResults') }}</UButton>
    </form>
    <div class="flex items-center justify-between gap-3">
      <p class="text-sm text-muted">
        {{ t('results', { count: term.includes(':') ? images.length : filtered.length }) }}
      </p>
      <USelect
        v-model="sort"
        :items="[
          { label: t('alphabetical'), value: 'az' },
          { label: t('reverseAlphabetical'), value: 'za' },
        ]"
        :aria-label="t('sort')"
      />
    </div>
    <RequestState
      :pending="pending"
      :error="error"
      :empty="!repos.length && !images.length"
      @retry="load"
      ><RepoGrid v-if="repos.length" :repos="repos" /><ImageTable
        v-if="images.length"
        :images="images" /></RequestState
    ><UPagination
      v-if="!term.includes(':') && filtered.length > 12"
      v-model:page="page"
      :items-per-page="12"
      :total="filtered.length"
    />
  </div>
</template>
