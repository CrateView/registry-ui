<script setup lang="ts">
const { t } = useI18n()
useHead(() => ({ title: t('settings') }))
</script>
<template>
  <div class="page max-w-4xl space-y-6">
    <UPageCard :description="t('settingsDescription')" variant="naked">
      <template #title>
        <h1 class="page-title">{{ t('settings') }}</h1>
      </template>
    </UPageCard>
    <UPageCard variant="subtle">
      <UFormField
        :label="t('theme')"
        :description="t('themeDescription')"
        class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"
      >
        <ModeSwitch />
      </UFormField>
      <USeparator />
      <UFormField
        :label="t('language')"
        :description="t('languageDescription')"
        class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"
      >
        <LanguageSwitch />
      </UFormField>
    </UPageCard>
    <AboutSection />
  </div>
</template>
