<script setup lang="ts">
import type { Repo } from '~/utils/types'
defineProps<{ repos: Repo[] }>()
const { t } = useI18n()
</script>
<template>
  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    <NuxtLink
      v-for="repo in repos"
      :key="repo.Name"
      :to="repoPath(repo.Name)"
      class="panel group flex min-w-0 flex-col p-5 transition hover:border-primary/50 hover:shadow-md"
      ><span
        class="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"
        ><UIcon name="i-lucide-container" class="size-6"
      /></span>
      <h3 class="truncate text-base font-semibold text-highlighted group-hover:text-primary">
        {{ repo.Name }}
      </h3>
      <p
        class="mt-2 line-clamp-2 min-h-10 text-sm"
        :class="repo.Error ? 'text-error' : 'text-muted'"
      >
        {{ repo.Error || repo.RepresentativeImage?.Description || t('noDescription') }}
      </p>
      <div class="my-4 flex flex-wrap gap-1.5">
        <UBadge
          v-for="platform in repo.Platforms"
          :key="`${platform.Os}/${platform.Arch}`"
          color="neutral"
          variant="soft"
          size="sm"
          >{{ platform.Os || '—' }}/{{ platform.Arch || '—' }}</UBadge
        >
      </div>
      <div
        class="mt-auto flex items-center justify-between border-t border-default pt-4 text-xs text-muted"
      >
        <span>{{ t('tags') }}: {{ repo.TagCount ?? '—' }}</span
        ><UBadge v-if="repo.RepresentativeImage?.Tag" color="neutral" variant="outline" size="sm">{{
          repo.RepresentativeImage.Tag
        }}</UBadge>
      </div></NuxtLink
    >
  </div>
</template>
