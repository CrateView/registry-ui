<script setup lang="ts">
import type { DependencyLicense } from '../../shared/types/licenses'
import { safeUrl } from '../utils/configuration'

const { t } = useI18n()
const config = useRuntimeConfig().public
const open = ref(false)
const search = ref('')
const packages = ref<DependencyLicense[]>()
const loading = ref(false)
const failed = ref(false)
const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  return (packages.value || []).filter((item) =>
    `${item.name} ${item.version} ${item.license}`.toLowerCase().includes(query),
  )
})
async function load() {
  if (loading.value || packages.value) return
  loading.value = true
  failed.value = false
  try {
    packages.value = await $fetch<DependencyLicense[]>('/dependency-licenses.json')
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}
watch(open, (value) => {
  if (value) void load()
})
</script>

<template>
  <UPageCard variant="subtle">
    <h2 class="text-lg font-semibold">{{ t('about') }}</h2>
    <p class="text-sm text-muted">
      {{ config.brandName }} · {{ t('aboutVersion') }} {{ config.appVersion }}
    </p>
    <details :open="open" @toggle="open = ($event.target as HTMLDetailsElement).open">
      <summary class="cursor-pointer font-medium">{{ t('dependencyLicenses') }}</summary>
      <div v-if="open" class="mt-4 min-w-0 space-y-4">
        <p class="text-sm text-muted">{{ t('dependencyLicensesDescription') }}</p>
        <p v-if="loading" role="status">{{ t('licensesLoading') }}</p>
        <div v-else-if="failed" role="alert" class="space-y-2">
          <p>{{ t('licensesLoadError') }}</p>
          <UButton @click="load">{{ t('licensesRetry') }}</UButton>
        </div>
        <template v-else-if="packages">
          <UInput
            v-model="search"
            :aria-label="t('licensesSearch')"
            :placeholder="t('licensesSearch')"
            icon="i-lucide-search"
            class="w-full"
          />
          <p role="status" class="text-sm text-muted">
            {{ t('licensesCount', { count: filtered.length, total: packages.length }) }}
          </p>
          <p v-if="!filtered.length">{{ t('licensesEmpty') }}</p>
          <div v-else class="max-h-[36rem] space-y-2 overflow-y-auto">
            <details
              v-for="item in filtered"
              :key="`${item.name}@${item.version}`"
              class="min-w-0 rounded-md border border-default p-3"
            >
              <summary class="cursor-pointer break-words text-sm">
                <span class="font-medium">{{ item.name }}</span>
                {{ item.version }} · {{ item.license || t('licenseUnknown') }}
              </summary>
              <div class="mt-3 min-w-0 space-y-3 text-sm">
                <a
                  v-if="safeUrl(item.url)"
                  :href="safeUrl(item.url)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-primary underline"
                  >{{ t('licenseProject') }}</a
                >
                <p v-if="!item.documents.length" class="text-muted">
                  {{ t('licenseTextMissing') }}
                </p>
                <div v-for="document in item.documents" :key="document.file + document.text">
                  <h3 class="mb-2 font-medium break-words">{{ document.file }}</h3>
                  <pre
                    class="whitespace-pre-wrap break-words font-mono text-xs [overflow-wrap:anywhere]"
                    >{{ document.text }}</pre>
                </div>
              </div>
            </details>
          </div>
        </template>
      </div>
    </details>
  </UPageCard>
</template>
