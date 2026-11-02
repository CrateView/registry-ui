<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { createAccountSchemas } from '../../shared/validation'
const { t } = useI18n()
const registry = useRegistry()
const schema = computed(() => createAccountSchemas(t).passwordChangeForm)
type PasswordChange = z.output<typeof schema.value>
const state = reactive({ currentPassword: '', password: '', confirmation: '' })
const pending = ref(false)
const error = ref('')
useHead(() => ({ title: t('account') }))
async function changePassword(event: FormSubmitEvent<PasswordChange>) {
  error.value = ''
  pending.value = true
  try {
    await registry.request('/api/account/password', {
      method: 'POST',
      body: { currentPassword: event.data.currentPassword, password: event.data.password },
    })
    Object.assign(state, { currentPassword: '', password: '', confirmation: '' })
    await registry.initialize()
    await navigateTo('/login')
  } catch (failure) {
    error.value = String(failure)
  } finally {
    pending.value = false
  }
}
</script>
<template>
  <div class="page max-w-3xl space-y-6">
    <h1 class="page-title">{{ t('account') }}</h1>
    <UAlert v-if="error" color="error" :title="t('error')" :description="error" />
    <UPageCard
      v-if="registry.info.value?.userManagement"
      :title="t('changePassword')"
      :description="`${t('passwordRequirements')} ${t('passwordChangeHint')}`"
    >
      <UForm
        :schema="schema"
        :state="state"
        :disabled="pending"
        class="space-y-4"
        @submit="changePassword"
      >
        <UFormField name="currentPassword" :label="t('currentPassword')" required>
          <UInput
            v-model="state.currentPassword"
            dir="ltr"
            type="password"
            autocomplete="current-password"
            :aria-label="t('currentPassword')"
            class="w-full"
          />
        </UFormField>
        <UFormField
          name="password"
          :label="t('newPassword')"
          :description="t('passwordRequirements')"
          required
        >
          <UInput
            v-model="state.password"
            dir="ltr"
            type="password"
            autocomplete="new-password"
            :aria-label="t('newPassword')"
            class="w-full"
          />
        </UFormField>
        <UFormField name="confirmation" :label="t('confirmPassword')" required>
          <UInput
            v-model="state.confirmation"
            dir="ltr"
            type="password"
            autocomplete="new-password"
            :aria-label="t('confirmPassword')"
            class="w-full"
          />
        </UFormField>
        <UButton type="submit" :loading="pending">{{ t('changePassword') }}</UButton>
      </UForm>
    </UPageCard>
    <UAlert v-else :title="t('userManagementDisabled')" />
  </div>
</template>
