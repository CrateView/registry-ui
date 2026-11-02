<script setup lang="ts">
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import type { z } from 'zod'
import { createAccountSchemas, userListSchema } from '../../shared/validation'
const { t } = useI18n()
const registry = useRegistry()
const schema = computed(() => createAccountSchemas(t).createUserForm)
type NewUser = z.output<typeof schema.value>
type User = z.output<typeof userListSchema>['users'][number]
const state = reactive({ username: '', password: '', confirmation: '' })
const users = ref<User[]>([])
const loading = ref(false)
const saving = ref(false)
const open = ref(false)
const loadError = ref('')
const saveError = ref('')
const tokenMode = computed(() => registry.info.value?.authType === 'token')
const columns = computed<TableColumn<User>[]>(() => [
  { accessorKey: 'username', header: t('username') },
  ...(tokenMode.value ? [{ accessorKey: 'grants', header: t('repositoryAccess') }] : []),
])
useHead(() => ({ title: t('users') }))
async function load() {
  if (!registry.info.value?.canCreateUsers) return
  loading.value = true
  loadError.value = ''
  try {
    const response = await registry.request<unknown>('/api/account/users')
    users.value = userListSchema.parse(response).users
  } catch (error) {
    loadError.value = String(error)
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(open, () => {
  Object.assign(state, { username: '', password: '', confirmation: '' })
  saveError.value = ''
})
async function create(event: FormSubmitEvent<NewUser>) {
  saving.value = true
  saveError.value = ''
  try {
    await registry.request('/api/account/users', {
      method: 'POST',
      body: { username: event.data.username, password: event.data.password },
    })
    open.value = false
    useToast().add({ title: t('userCreated'), color: 'success' })
    await load()
  } catch (error) {
    saveError.value = String(error)
  } finally {
    saving.value = false
  }
}
</script>
<template>
  <div class="page space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="eyebrow mb-3">{{ t('administration') }}</p>
        <h1 class="page-title">{{ t('users') }}</h1>
        <p class="mt-3 max-w-2xl text-sm text-muted">{{ t('usersDescription') }}</p>
      </div>
      <UButton
        v-if="registry.info.value?.canCreateUsers"
        icon="i-lucide-user-plus"
        :label="t('createUser')"
        @click="open = true"
      />
    </div>
    <template v-if="registry.info.value?.canCreateUsers">
      <UAlert v-if="loadError" color="error" :title="t('error')" :description="loadError">
        <template #actions
          ><UButton color="neutral" variant="outline" :label="t('retry')" @click="load"
        /></template>
      </UAlert>
      <UPageCard variant="subtle" :ui="{ container: 'p-0 sm:p-0' }">
        <div class="flex items-center justify-between gap-3 border-b border-default px-5 py-4">
          <p class="text-sm text-muted" role="status">
            {{ loading ? t('loading') : t('userCount', { count: users.length }) }}
          </p>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-refresh-cw"
            :aria-label="t('refreshUsers')"
            :loading="loading"
            @click="load"
          />
        </div>
        <UTable :data="users" :columns="columns" :loading="loading" :empty="t('noUsers')">
          <template #username-cell="{ row }">
            <div class="flex items-center gap-3">
              <UAvatar :alt="row.original.username" size="sm" aria-hidden="true" />
              <span class="font-medium text-highlighted">{{ row.original.username }}</span>
              <UBadge
                v-if="row.original.username === registry.user.value"
                color="neutral"
                variant="subtle"
                >{{ t('currentUser') }}</UBadge
              >
            </div>
          </template>
          <template #grants-cell="{ row }">
            <div v-if="row.original.grants?.length" class="flex flex-wrap gap-2">
              <UBadge
                v-for="grant in row.original.grants"
                :key="grant.pattern"
                color="neutral"
                variant="subtle"
                >{{ grant.pattern }} · {{ t(`role_${grant.role}`) }}</UBadge
              >
            </div>
            <span v-else class="text-muted">{{ t('noRepositoryAccess') }}</span>
          </template>
        </UTable>
      </UPageCard>
      <p class="text-sm text-muted">{{ t(tokenMode ? 'newUserTokenHint' : 'newUserBasicHint') }}</p>
    </template>
    <UAlert v-else color="warning" :title="t('userAdministrationDenied')" />
    <UModal
      v-model:open="open"
      :title="t('createUser')"
      :description="t(tokenMode ? 'newUserTokenHint' : 'newUserBasicHint')"
      :dismissible="!saving"
      :close="!saving"
    >
      <template #body>
        <UForm
          :schema="schema"
          :state="state"
          :disabled="saving"
          class="space-y-4"
          @submit="create"
        >
          <UAlert v-if="saveError" color="error" :title="t('error')" :description="saveError" />
          <UFormField
            name="username"
            :label="t('username')"
            :description="t('usernameInvalid')"
            required
          >
            <UInput
              v-model="state.username"
              dir="ltr"
              autocomplete="off"
              autocapitalize="none"
              :spellcheck="false"
              :aria-label="t('username')"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="password"
            :label="t('password')"
            :description="t('passwordRequirements')"
            required
          >
            <UInput
              v-model="state.password"
              dir="ltr"
              type="password"
              autocomplete="new-password"
              :aria-label="t('password')"
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
          <div class="flex justify-end gap-3 pt-2">
            <UButton
              color="neutral"
              variant="outline"
              :disabled="saving"
              :label="t('cancel')"
              @click="open = false"
            />
            <UButton type="submit" :loading="saving" :label="t('createUser')" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
