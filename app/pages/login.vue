<script setup lang="ts">
const { t } = useI18n()
const registry = useRegistry()
const username = ref('')
const password = ref('')
const pending = ref(false)
const error = ref('')
useHead(() => ({ title: t('signIn') }))
onMounted(() => {
  if (!registry.info.value?.auth) navigateTo('/home')
})
async function login() {
  pending.value = true
  error.value = ''
  try {
    await registry.login(username.value, password.value)
    password.value = ''
  } catch (failure) {
    error.value = String(failure)
  } finally {
    pending.value = false
  }
}
</script>
<template>
  <div class="page flex min-h-[75vh] items-center justify-center">
    <div class="panel w-full max-w-md space-y-6 p-8">
      <BrandMark />
      <div>
        <h1 class="mt-8 text-2xl font-bold">{{ t('signIn') }}</h1>
        <p class="mt-2 text-sm text-muted">{{ t('loginHint') }}</p>
      </div>
      <UAlert v-if="error" :title="t('error')" :description="error" color="error" /><UAlert
        v-if="registry.info.value?.authType === 'unsupported'"
        :title="t('unsupportedAuth')"
        color="warning"
      />
      <form v-else class="space-y-4" @submit.prevent="login">
        <UFormField :label="t('username')" required
          ><UInput
            v-model="username"
            autocomplete="username"
            :aria-label="t('username')"
            class="w-full"
            required /></UFormField
        ><UFormField :label="t('password')" required
          ><UInput
            v-model="password"
            type="password"
            autocomplete="current-password"
            :aria-label="t('password')"
            class="w-full"
            required /></UFormField
        ><UButton type="submit" :loading="pending" block>{{ t('signIn') }}</UButton>
      </form>
    </div>
  </div>
</template>
