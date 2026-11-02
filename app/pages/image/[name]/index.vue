<script setup lang="ts">
import type { Repo, Image } from '~/utils/types'
const route = useRoute()
const name = computed(() => String(route.params.name))
const { t } = useI18n()
const { number } = useFormatting()
const registry = useRegistry()
const pending = ref(true)
const error = ref('')
const reloadError = ref('')
const summary = ref<Repo>()
const images = ref<Image[]>([])
const page = ref(1)
const term = ref('')
const tagSort = ref('newest')
const tagSortItems = computed(() => [
  { value: 'newest', label: t('newest') },
  { value: 'oldest', label: t('oldest') },
  { value: 'az', label: t('alphabetical') },
  { value: 'za', label: t('reverseAlphabetical') },
])
const filtered = computed(() =>
  images.value
    .filter((image) => (image.Tag || '').toLowerCase().includes(term.value.toLowerCase()))
    .toSorted((a, b) => {
      if (tagSort.value === 'az' || tagSort.value === 'za')
        return (a.Tag || '').localeCompare(b.Tag || '') * (tagSort.value === 'az' ? 1 : -1)
      return (
        ((Date.parse(a.LastUpdated || '') || 0) - (Date.parse(b.LastUpdated || '') || 0)) *
        (tagSort.value === 'newest' ? -1 : 1)
      )
    }),
)
const visible = computed(() => filtered.value.slice((page.value - 1) * 12, page.value * 12))
watch([term, tagSort], () => {
  page.value = 1
})
useHead(() => ({ title: name.value }))
async function load() {
  pending.value = !summary.value
  error.value = ''
  reloadError.value = ''
  try {
    const result = await registry.repository(name.value)
    summary.value = result.Summary
    images.value = result.Images || []
    page.value = Math.min(page.value, Math.max(1, Math.ceil(filtered.value.length / 12)))
    if (!summary.value?.Name) error.value = t('notFound')
  } catch (failure) {
    if (summary.value) reloadError.value = String(failure)
    else error.value = String(failure)
  } finally {
    pending.value = false
  }
}
onMounted(load)
watch(name, () => {
  summary.value = undefined
  images.value = []
  page.value = 1
  term.value = ''
  load()
})
</script>
<template>
  <div class="page space-y-6">
    <UButton to="/explore" variant="link" color="neutral" icon="i-lucide-arrow-left" class="p-0">{{
      t('repositories')
    }}</UButton
    ><RequestState :pending="pending" :error="error" @retry="load"
      ><template v-if="summary"
        ><div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="eyebrow mb-3">{{ t('repository') }}</p>
            <h1 class="page-title break-all">{{ name }}</h1>
            <div class="mt-4"></div>
          </div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div
            v-for="metric in [
              { label: t('tags'), value: number(images.length), icon: 'i-lucide-tags' },

              {
                label: t('platforms'),
                value: number(summary.Platforms?.length),
                icon: 'i-lucide-download',
              },
            ]"
            :key="metric.label"
            class="panel p-5"
          >
            <div class="mb-3 flex justify-between text-sm text-muted">
              {{ metric.label }}<UIcon :name="metric.icon" />
            </div>
            <p class="text-2xl font-semibold tracking-tight">{{ metric.value }}</p>
          </div>
        </div>
        <div class="panel space-y-4 p-6">
          <h2 class="font-semibold">{{ t('description') }}</h2>
          <MarkdownText :text="summary.RepresentativeImage?.Description || t('noDescription')" />
          <div class="flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted">
            <span>{{ t('vendor') }}: {{ summary.RepresentativeImage?.Vendor || '—' }}</span
            ><span>{{ t('license') }}: {{ summary.RepresentativeImage?.Licenses || '—' }}</span
            ><a
              v-if="safeUrl(summary.RepresentativeImage?.Source)"
              :href="safeUrl(summary.RepresentativeImage?.Source)"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary"
              >{{ t('source') }}</a
            ><a
              v-if="safeUrl(summary.RepresentativeImage?.Documentation)"
              :href="safeUrl(summary.RepresentativeImage?.Documentation)"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary"
              >{{ t('documentation') }}</a
            >
          </div>
        </div>
        <div class="flex items-center justify-between gap-4">
          <h2 class="text-lg font-semibold">{{ t('tags') }}</h2>
          <USelect
            v-model="tagSort"
            :items="tagSortItems"
            :aria-label="t('sort')"
            class="ml-auto"
          />
          <UInput
            v-model="term"
            icon="i-lucide-search"
            :placeholder="t('tags')"
            :aria-label="t('tags')"
          />
        </div>
        <UAlert v-if="reloadError" color="error" :description="reloadError" />
        <ImageTable
          :images="visible"
          :repo="name"
          :selection-key="`${page}:${term}:${tagSort}`"
          @deleted="load" /><RequestState v-if="!visible.length" empty /><UPagination
          v-if="filtered.length > 12"
          v-model:page="page"
          :items-per-page="12"
          :total="filtered.length" /></template
    ></RequestState>
  </div>
</template>
