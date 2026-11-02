<template>
  <div class="page max-w-4xl space-y-6">
    <UPageCard variant="naked" :description="t('settingsDescription')">
      <template #title>
        <h1 class="page-title">
          {{ t('settings') }}
        </h1>
      </template>
    </UPageCard>
    <UPageCard variant="subtle">
      <UFormField
        class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"
        :label="t('theme')"
        :description="t('themeDescription')"
      >
        <ModeSwitch />
      </UFormField>
      <USeparator />
      <UFormField
        class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"
        :label="t('language')"
        :description="t('languageDescription')"
      >
        <LanguageSwitch />
      </UFormField>
    </UPageCard>
    <AboutSection />
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
useHead(() => ({ title: t('settings') }));
</script>
