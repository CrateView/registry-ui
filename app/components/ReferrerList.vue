<script setup lang="ts">
import type { Referrer } from '~/utils/types'
defineProps<{ referrers: Referrer[]; repo: string }>()
const { t } = useI18n()
const { bytes } = useFormatting()
</script>
<template>
  <RequestState :empty="!referrers.length"
    ><div class="space-y-3">
      <div v-for="referrer in referrers" :key="referrer.Digest" class="panel space-y-3 p-5">
        <div class="flex flex-wrap justify-between gap-2">
          <NuxtLink
            :to="imagePath(repo, referrer.Digest)"
            class="mono break-all text-sm text-primary"
            >{{ referrer.Digest }}</NuxtLink
          ><span class="text-xs text-muted">{{ bytes(referrer.Size) }}</span>
        </div>
        <p class="break-all text-sm text-muted">
          {{ t('artifactType') }}: {{ referrer.ArtifactType || referrer.MediaType }}
        </p>
        <dl v-if="referrer.Annotations?.length" class="space-y-2 text-xs">
          <div v-for="annotation in referrer.Annotations" :key="annotation.Key" class="break-all">
            <dt class="text-muted">{{ annotation.Key }}</dt>
            <dd>{{ annotation.Value }}</dd>
          </div>
        </dl>
      </div>
    </div></RequestState
  >
</template>
