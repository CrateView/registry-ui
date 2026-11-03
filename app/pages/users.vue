<template>
  <div class="page space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="eyebrow mb-3">
          {{ t('administration') }}
        </p>
        <h1 class="page-title">
          {{ t('users') }}
        </h1>
        <p class="mt-3 max-w-2xl text-sm text-muted">
          {{ t('usersDescription') }}
        </p>
      </div>
      <UButton
        v-if="registry.info.value?.canCreateUsers"
        icon="i-lucide-user-plus"
        :label="t('createUser')"
        @click="showForm()"
      />
    </div>
    <template v-if="registry.info.value?.canCreateUsers">
      <UAlert v-if="loadError" color="error" :title="t('error')" :description="loadError">
        <template #actions>
          <UButton color="neutral" variant="outline" :label="t('retry')" @click="load" />
        </template>
      </UAlert>
      <div class="flex items-center justify-between gap-3">
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
      <div class="panel overflow-x-auto">
        <table class="data-table" :aria-busy="loading">
          <thead>
            <tr>
              <th scope="col">
                {{ t('username') }}
              </th>
              <th v-if="tokenMode" scope="col">
                {{ t('repositoryAccess') }}
              </th>
              <th scope="col" class="text-right">
                {{ t('actions') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.username">
              <td>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-user-round" class="size-4 shrink-0 text-muted" />
                  <span class="font-semibold text-highlighted">{{ user.username }}</span>
                  <UBadge v-if="user.username === registry.user.value" color="neutral" variant="soft" size="sm">
                    {{ t('currentUser') }}
                  </UBadge>
                </div>
              </td>
              <td v-if="tokenMode">
                <div v-if="user.grants?.length" class="flex flex-wrap gap-1">
                  <UBadge v-for="grant in user.grants" :key="grant.pattern" color="neutral" variant="soft" size="sm">
                    {{ grant.pattern }} · {{ t(`role_${grant.role}`) }}
                  </UBadge>
                </div>
                <span v-else class="text-muted">{{ t('noRepositoryAccess') }}</span>
              </td>
              <td class="text-right">
                <div class="flex justify-end">
                  <UDropdownMenu :items="userActions(user)" :content="{ align: 'end' }">
                    <UButton
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-ellipsis-vertical"
                      :aria-label="t('actions')"
                    />
                  </UDropdownMenu>
                </div>
              </td>
            </tr>
            <tr v-if="!users.length">
              <td class="text-center text-muted" :colspan="tokenMode ? 3 : 2">
                {{ loading ? t('loading') : t('noUsers') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-sm text-muted">
        {{ t(tokenMode ? 'newUserTokenHint' : 'newUserBasicHint') }}
      </p>
    </template>
    <UAlert v-else color="warning" :title="t('userAdministrationDenied')" />
    <UModal
      v-model:open="open"
      :title="t(editing ? 'changePassword' : 'createUser')"
      :description="editing ? state.username : t(tokenMode ? 'newUserTokenHint' : 'newUserBasicHint')"
      :dismissible="!saving"
      :close="!saving"
    >
      <template #body>
        <UForm class="space-y-4" :schema="schema" :state="state" :disabled="saving" @submit="create">
          <UAlert v-if="saveError" color="error" :title="t('error')" :description="saveError" />
          <UFormField name="username" :label="t('username')" :description="t('usernameInvalid')" required>
            <UInput
              v-model="state.username"
              dir="ltr"
              autocomplete="off"
              autocapitalize="none"
              class="w-full"
              :disabled="editing"
              :spellcheck="false"
              :aria-label="t('username')"
            />
          </UFormField>
          <UFormField name="password" :label="t('password')" :description="t('passwordRequirements')" required>
            <UInput
              v-model="state.password"
              dir="ltr"
              type="password"
              autocomplete="new-password"
              class="w-full"
              :aria-label="t('password')"
            />
          </UFormField>
          <UFormField name="confirmation" :label="t('confirmPassword')" required>
            <UInput
              v-model="state.confirmation"
              dir="ltr"
              type="password"
              autocomplete="new-password"
              class="w-full"
              :aria-label="t('confirmPassword')"
            />
          </UFormField>
          <div class="flex justify-end gap-3 pt-2">
            <UButton color="neutral" variant="outline" :disabled="saving" :label="t('cancel')" @click="open = false" />
            <UButton type="submit" :loading="saving" :label="t(editing ? 'changePassword' : 'createUser')" />
          </div>
        </UForm>
      </template>
    </UModal>
    <UModal
      v-model:open="deleteOpen"
      :title="t('deleteUser')"
      :description="t('deleteUserConfirm', { username: deleting?.username || '' })"
      :dismissible="!removing"
      :close="!removing"
    >
      <template #body>
        <UAlert v-if="deleteError" color="error" :title="t('error')" :description="deleteError" />
        <div class="flex justify-end gap-3 pt-2">
          <UButton
            color="neutral"
            variant="outline"
            :disabled="removing"
            :label="t('cancel')"
            @click="deleteOpen = false"
          />
          <UButton color="error" :loading="removing" :label="t('deleteUser')" @click="remove" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem, FormSubmitEvent } from '@nuxt/ui';
import type { z } from 'zod';
import { createAccountSchemas, userListSchema } from '../../shared/validation';

const { t } = useI18n();
const registry = useRegistry();
const schema = computed(() => createAccountSchemas(t).createUserForm);
type NewUser = z.output<typeof schema.value>;
type User = z.output<typeof userListSchema>['users'][number];
const state = reactive({ username: '', password: '', confirmation: '' });
const users = ref<User[]>([]);
const loading = ref(false);
const saving = ref(false);
const open = ref(false);
const editing = ref(false);
const deleting = ref<User | null>(null);
const deleteOpen = ref(false);
const deleteError = ref('');
const removing = ref(false);
const loadError = ref('');
const saveError = ref('');
const tokenMode = computed(() => registry.info.value?.authType === 'token');
useHead(() => ({ title: t('users') }));
async function load() {
  if (!registry.info.value?.canCreateUsers) return;
  loading.value = true;
  loadError.value = '';
  try {
    const response = await registry.request<unknown>('/api/account/users');
    users.value = userListSchema.parse(response).users;
  } catch (error) {
    loadError.value = String(error);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
function userActions(user: User): DropdownMenuItem[] {
  if (user.username === registry.user.value)
    return [{ label: t('changePassword'), icon: 'i-lucide-key-round', to: '/account' }];
  return [
    {
      label: t('changePassword'),
      icon: 'i-lucide-key-round',
      onSelect: () => showForm(user),
    },
    {
      label: t('deleteUser'),
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: () => confirmDelete(user),
    },
  ];
}
function showForm(user?: User) {
  editing.value = Boolean(user);
  Object.assign(state, { username: user?.username || '', password: '', confirmation: '' });
  saveError.value = '';
  open.value = true;
}
watch(open, (value) => {
  if (value) return;
  Object.assign(state, { username: '', password: '', confirmation: '' });
  saveError.value = '';
});
async function create(event: FormSubmitEvent<NewUser>) {
  saving.value = true;
  saveError.value = '';
  try {
    await registry.request(editing.value ? '/api/account/users/password' : '/api/account/users', {
      method: 'POST',
      body: { username: event.data.username, password: event.data.password },
    });
    open.value = false;
    useToast().add({
      title: t(editing.value ? 'userPasswordChanged' : 'userCreated'),
      color: 'success',
    });
    await load();
  } catch (error) {
    saveError.value = String(error);
  } finally {
    saving.value = false;
  }
}
function confirmDelete(user: User) {
  deleting.value = user;
  deleteError.value = '';
  deleteOpen.value = true;
}
async function remove() {
  if (!deleting.value) return;
  removing.value = true;
  deleteError.value = '';
  try {
    await registry.request('/api/account/users/delete', {
      method: 'POST',
      body: { username: deleting.value.username },
    });
    deleteOpen.value = false;
    useToast().add({ title: t('userDeleted'), color: 'success' });
    await load();
  } catch (error) {
    deleteError.value = String(error);
  } finally {
    removing.value = false;
  }
}
</script>
