<script setup lang="ts">
import type { Image } from '~/utils/types'
defineProps<{ images: Image[]; repo?: string }>()
const { t } = useI18n()
const { date, bytes } = useFormatting()
</script>
<template>
  <div class="panel overflow-x-auto">
    <table class="data-table">
      <thead>
        <tr>
          <th>{{ t('tag') }}</th>
          <th>{{ t('digest') }}</th>
          <th>{{ t('platforms') }}</th>
          <th>{{ t('size') }}</th>

          <th>{{ t('updated') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="image in images" :key="`${image.RepoName}:${image.Tag}:${image.Digest}`">
          <td>
            <NuxtLink
              :to="imagePath(image.RepoName || repo || '', image.Tag || image.Digest)"
              class="font-semibold text-highlighted hover:text-primary"
              >{{ image.Tag || image.Digest.slice(0, 19) }}</NuxtLink
            >
            <div v-if="image.RepoName && !repo" class="mt-1 text-xs text-muted">
              {{ image.RepoName }}
            </div>
          </td>
          <td class="mono text-xs text-muted" :title="image.Digest">
            {{ image.Digest?.slice(0, 19) }}…
          </td>
          <td>
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-for="manifest in image.Manifests"
                :key="manifest.Digest"
                color="neutral"
                variant="soft"
                size="sm"
                >{{ manifest.Platform?.Os || '—' }}/{{ manifest.Platform?.Arch || '—' }}</UBadge
              >
            </div>
          </td>
          <td class="whitespace-nowrap">
            {{
              bytes(image.Size || image.Manifests?.reduce((sum, m) => sum + Number(m.Size || 0), 0))
            }}
          </td>

          <td class="whitespace-nowrap text-muted">{{ date(image.LastUpdated) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
