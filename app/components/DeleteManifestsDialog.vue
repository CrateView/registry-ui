<template>
  <UModal
    v-model:open="open"
    :dismissible="!deleting"
    :close="!deleting"
    :title="t('delete')"
    :description="t('deleteManifestsWarning')"
  >
    <template #body>
      <p v-if="pending" role="status">
        {{ t('loading') }}
      </p>
      <UAlert v-if="failure" role="alert" color="error" :description="failure" />
      <ul v-else class="space-y-4">
        <li v-for="image in manifests" :key="image.Digest" class="space-y-2">
          <p class="mono text-xs break-all">
            {{ image.Digest }}
          </p>
          <p class="text-sm">
            {{ `${t('affectedTags')}: ${image.AffectedTags?.join(', ') || '—'}` }}
          </p>
        </li>
      </ul>
      <UAlert
        v-for="item in failures"
        :key="item.digest"
        role="alert"
        color="error"
        class="mt-3"
        :title="item.digest"
        :description="item.message"
      />
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" :disabled="deleting" @click="open = false">
        {{ t(finished ? 'close' : 'cancel') }}
      </UButton>
      <UButton
        v-if="!finished"
        color="error"
        :loading="deleting"
        :disabled="pending || deleting || !!failure || !manifests.length"
        @click="remove"
      >
        {{ t('confirm') }}
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { Image } from '~/utils/types';

const props = defineProps<{ repo: string; images: Image[] }>();
const emit = defineEmits<{ completed: [allDeleted: boolean] }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const registry = useRegistry();
const manifests = ref<Image[]>([]);
const pending = ref(false);
const deleting = ref(false);
const finished = ref(false);
const failure = ref('');
const failures = ref<{ digest: string; message: string }[]>([]);
let sequence = 0;
watch(open, async (visible) => {
  const current = ++sequence;
  if (!visible) return;
  manifests.value = [];
  failure.value = '';
  failures.value = [];
  finished.value = false;
  pending.value = true;
  try {
    const digests = [...new Set(props.images.map((image) => image.Digest))];
    if (!digests.length) throw new Error(t('notFound'));
    const result = await Promise.all(digests.map((digest) => registry.image(props.repo, digest)));
    if (result.some((image, index) => !image.IsDeletable || image.Digest !== digests[index]))
      throw new Error(t('deleteUnavailable'));
    if (current === sequence) manifests.value = result;
  } catch (error) {
    if (current === sequence) failure.value = String(error);
  } finally {
    if (current === sequence) pending.value = false;
  }
});
onBeforeUnmount(() => {
  sequence++;
});
async function remove() {
  if (pending.value || deleting.value || finished.value || failure.value || !manifests.value.length) return;
  deleting.value = true;
  failures.value = [];
  const repo = props.repo;
  try {
    for (const image of manifests.value) {
      try {
        await registry.request('/api/registry/manifest', {
          method: 'DELETE',
          query: { name: repo, digest: image.Digest },
        });
      } catch (error) {
        failures.value.push({ digest: image.Digest, message: String(error) });
      }
    }
    finished.value = true;
    const allDeleted = !failures.value.length;
    if (allDeleted) {
      open.value = false;
      useToast().add({ title: t('deleted'), color: 'success' });
    }
    emit('completed', allDeleted);
  } finally {
    deleting.value = false;
  }
}
</script>
