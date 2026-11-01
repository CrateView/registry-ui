<script setup lang="ts">
import type { Repo } from '~/utils/types'
const { t } = useI18n()
useHead(() => ({ title: t('overview') }))
const registry = useRegistry()
const pending = ref(true)
const error = ref('')
const repos = ref<Repo[]>([])
const count = ref(0)
async function load() {
  pending.value = true
  error.value = ''
  try {
    const names = (await registry.catalog()).toSorted()
    count.value = names.length
    repos.value = await Promise.all(
      names.slice(0, 12).map(async (name) => {
        try {
          return (await registry.repository(name, true)).Summary
        } catch (failure) {
          return { Name: name, Error: String(failure) }
        }
      }),
    )
  } catch (failure) {
    error.value = String(failure)
  } finally {
    pending.value = false
  }
}
onMounted(load)
</script>
<template>
  <div class="page space-y-8">
    <div>
      <p class="eyebrow mb-3">OCI / DISTRIBUTION</p>
      <h1 class="page-title">{{ t('overview') }}</h1>
      <p class="mt-3 text-sm text-muted">{{ t('overviewHint') }}</p>
    </div>
    <div class="panel flex items-center justify-between p-6">
      <div>
        <p class="text-sm text-muted">{{ t('repositories') }}</p>
        <p class="mt-2 text-3xl font-semibold">{{ count }}</p>
      </div>
      <UIcon name="i-lucide-container" class="size-10 text-primary" />
    </div>
    <section>
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold">{{ t('repositories') }}</h2>
        <UButton
          to="/explore"
          color="neutral"
          variant="ghost"
          trailing-icon="i-lucide-arrow-right"
          >{{ t('viewAll') }}</UButton
        >
      </div>
      <RequestState :pending="pending" :error="error" :empty="!repos.length" @retry="load"
        ><RepoGrid :repos="repos"
      /></RequestState>
    </section>
  </div>
</template>
