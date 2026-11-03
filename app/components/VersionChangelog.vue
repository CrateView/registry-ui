<template>
  <UModal v-model:open="open" :title="t('changelogTitle')">
    <button
      type="button"
      class="flex w-full items-center gap-2 text-xs text-muted hover:text-primary"
      :aria-label="t('openChangelog', { version: current })"
    >
      <span class="font-mono">v{{ current }}</span>
      <span
        v-if="updateAvailable"
        class="size-2 rounded-full bg-primary"
        role="status"
        :title="t('updateAvailable', { version: latest?.version })"
        :aria-label="t('updateAvailable', { version: latest?.version })"
      />
      <span class="ms-auto flex items-center gap-1">
        {{ t('changelogTitle') }}
        <UIcon name="i-lucide-chevron-right" class="size-3" />
      </span>
    </button>
    <template #body>
      <div class="space-y-4">
        <p v-if="loading" role="status">
          {{ t('loading') }}
        </p>
        <div v-else-if="failed" role="alert">
          <p>
            {{ t('changelogFailed') }}
          </p>
          <UButton class="mt-3" @click="load">
            {{ t('retry') }}
          </UButton>
        </div>
        <p v-else-if="!releases.length">
          {{ t('changelogEmpty') }}
        </p>
        <template v-else>
          <section v-if="updateAvailable && latest" class="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <h3 class="font-semibold">
              {{ `${t('whatsNew')} · v${latest.version}` }}
            </h3>
            <p class="mb-2 text-xs text-muted">
              {{ date(latest.publishedAt) }}
            </p>
            <MarkdownText :text="latest.markdown" />
          </section>
          <div class="max-h-[50vh] space-y-4 overflow-y-auto">
            <section
              v-for="release in history"
              :key="release.version"
              class="border-b border-default pb-3 last:border-0"
            >
              <h3 class="font-mono font-semibold">
                {{ `v${release.version}` }}
              </h3>
              <p class="mb-2 text-xs text-muted">
                {{ date(release.publishedAt) }}
              </p>
              <MarkdownText :text="release.markdown" />
            </section>
          </div>
        </template>
        <a
          href="https://github.com/crateview/registry-ui/releases"
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-primary underline"
        >
          {{ t('allReleases') }}
        </a>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const { t } = useI18n();
const { date } = useFormatting();
const open = ref(false);
const { current, releases, latest, updateAvailable, loading, failed, load } = useVersionCheck();
const history = computed(() => releases.value.slice(updateAvailable.value ? 1 : 0, updateAvailable.value ? 7 : 6));
onMounted(load);
watch(open, (value) => {
  if (value) load();
});
</script>
