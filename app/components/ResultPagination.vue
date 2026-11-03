<template>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <p class="text-sm text-muted" role="status" data-testid="result-range">
      {{ t('paginationRange', { start: number(start), end: number(end), total: number(total) }) }}
    </p>
    <UPagination v-if="total > itemsPerPage" v-model:page="page" :items-per-page="itemsPerPage" :total="total" />
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ total: number; itemsPerPage?: number }>(), { itemsPerPage: 12 });
const page = defineModel<number>('page', { required: true });
const { t } = useI18n();
const { number } = useFormatting();
const start = computed(() => (props.total ? (page.value - 1) * props.itemsPerPage + 1 : 0));
const end = computed(() => Math.min(page.value * props.itemsPerPage, props.total));
</script>
