<template>
  <div class="flex min-h-dvh flex-col bg-muted/35">
    <header class="flex items-center justify-between gap-4 px-5 py-5 sm:px-8 sm:py-6">
      <BrandMark />
      <UButton
        v-if="website"
        target="_blank"
        rel="noopener noreferrer"
        color="neutral"
        variant="ghost"
        trailing-icon="i-lucide-arrow-up-right"
        :to="website"
        :label="t('visitWebsite')"
      />
    </header>
    <main class="flex flex-1 items-center justify-center px-5 py-10 sm:py-14">
      <slot />
    </main>
    <footer class="flex flex-col items-center gap-4 px-5 pb-6 text-center">
      <div class="flex items-center gap-3">
        <LanguageSwitch />
        <ThemeToggle />
      </div>
      <p class="max-w-lg text-xs text-muted">
        {{ config.brandDescription }}
      </p>
    </footer>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
const config = useRuntimeConfig().public;
const website = computed(() => safeUrl(config.brandProductUrl));
</script>
