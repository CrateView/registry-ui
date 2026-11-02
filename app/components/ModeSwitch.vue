<script setup lang="ts">
const { t } = useI18n()
</script>
<template>
  <UColorModeSelect :aria-label="t('theme')" class="w-48" />
</template>
