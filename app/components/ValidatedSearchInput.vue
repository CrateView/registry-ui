<script setup lang="ts">
import { createAccountSchemas } from '../../shared/validation'
defineOptions({ inheritAttrs: false })
const model = defineModel<string>({ required: true })
const { t } = useI18n()
const validation = computed(() =>
  createAccountSchemas(t).search.shape.search.safeParse(model.value),
)
const error = computed(() =>
  validation.value.success ? undefined : validation.value.error.issues[0]?.message,
)
</script>
<template>
  <UFormField :error="error"
    ><UInput v-model="model" v-bind="$attrs" :aria-invalid="Boolean(error)"
  /></UFormField>
</template>
