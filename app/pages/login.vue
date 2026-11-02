<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import { createAccountSchemas } from '../../shared/validation'
import type { z } from 'zod'

definePageMeta({ layout: 'auth' })
const { t } = useI18n()
const registry = useRegistry()
const ready = ref(false)
const pending = ref(false)
const error = ref('')
const connectionError = ref('')
const schema = computed(() => createAccountSchemas(t).login)
type Credentials = z.output<typeof schema.value>
const fields = computed<AuthFormField[]>(() => [
  {
    name: 'username',
    type: 'text',
    label: t('username'),
    autocomplete: 'username',
    autofocus: true,
    required: true,
    defaultValue: '',
    spellcheck: false,
    autocapitalize: 'none',
  },
  {
    name: 'password',
    type: 'password',
    label: t('password'),
    autocomplete: 'current-password',
    required: true,
    defaultValue: '',
  },
])
useHead(() => ({ title: t('signIn') }))
async function initialize() {
  ready.value = false
  connectionError.value = ''
  try {
    await registry.initialize()
    if (!registry.info.value?.auth || registry.authenticated.value) {
      await navigateTo('/home')
      return
    }
    ready.value = true
  } catch (failure) {
    connectionError.value = String(failure)
  }
}
onMounted(initialize)
async function login(event: FormSubmitEvent<Credentials>) {
  pending.value = true
  error.value = ''
  try {
    await registry.login(event.data.username, event.data.password)
    event.data.password = ''
  } catch (failure) {
    error.value = String(failure)
  } finally {
    pending.value = false
  }
}
</script>
<template>
  <UPageCard class="w-full max-w-md">
    <template v-if="connectionError">
      <UAlert :title="t('connectionFailed')" :description="connectionError" color="error" />
      <UButton color="neutral" variant="outline" @click="initialize">{{ t('retry') }}</UButton>
    </template>
    <UAuthForm
      v-else-if="ready"
      :fields="registry.info.value?.authType === 'unsupported' ? [] : fields"
      :description="t('loginHint')"
      :schema="schema"
      :loading="pending"
      :submit="{ label: t('signIn'), icon: 'i-lucide-log-in' }"
      @submit="login"
    >
      <template #leading>
        <div
          class="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"
        >
          <UIcon name="i-lucide-lock-keyhole" class="size-6" />
        </div>
      </template>
      <template #title
        ><h1 class="text-2xl font-semibold tracking-tight">{{ t('signIn') }}</h1></template
      >
      <template #validation>
        <UAlert v-if="error" :title="t('error')" :description="error" color="error" />
      </template>
      <template v-if="registry.info.value?.authType === 'unsupported'" #footer>
        <UAlert :title="t('unsupportedAuth')" color="warning" />
      </template>
    </UAuthForm>
    <div v-else class="py-12 text-center text-sm text-muted" role="status">{{ t('loading') }}</div>
  </UPageCard>
</template>
