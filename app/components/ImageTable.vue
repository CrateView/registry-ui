<template>
  <div class="space-y-3">
    <div v-if="canDelete && selected.length" class="flex items-center justify-between gap-3">
      <p role="status" class="text-sm text-muted">
        {{ t('selectedCount', { count: selected.length }) }}
      </p>
      <UButton
        color="error"
        variant="outline"
        icon="i-lucide-trash-2"
        @click="confirm(images.filter((image) => selected.includes(key(image))))"
      >
        {{ t('deleteSelected') }}
      </UButton>
    </div>
    <div class="panel overflow-x-auto">
      <table class="data-table">
        <thead>
          <tr>
            <th v-if="canDelete">
              <UCheckbox
                :model-value="allSelected ? true : selected.length ? 'indeterminate' : false"
                :aria-label="t('selectAllVisible')"
                @update:model-value="selected = $event === true ? images.map(key) : []"
              />
            </th>
            <th>
              {{ t('tag') }}
            </th>
            <th>
              {{ t('digest') }}
            </th>
            <th>
              {{ t('platforms') }}
            </th>
            <th>
              {{ t('size') }}
            </th>

            <th>
              {{ t('updated') }}
            </th>
            <th v-if="canDelete">
              {{ t('actions') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="image in images" :key="`${image.RepoName}:${image.Tag}:${image.Digest}`">
            <td v-if="canDelete">
              <UCheckbox
                :model-value="selected.includes(key(image))"
                :aria-label="t('selectTag', { tag: image.Tag || image.Digest })"
                @update:model-value="toggle(image, $event)"
              />
            </td>
            <td>
              <NuxtLink
                class="font-semibold text-highlighted hover:text-primary"
                :to="imagePath(image.RepoName || repo || '', image.Tag || image.Digest)"
              >
                {{ image.Tag || image.Digest.slice(0, 19) }}
              </NuxtLink>
              <div v-if="image.RepoName && !repo" class="mt-1 text-xs text-muted">
                {{ image.RepoName }}
              </div>
            </td>
            <td class="mono text-xs text-muted" :title="image.Digest">
              {{ `${image.Digest?.slice(0, 19) ?? ''}…` }}
            </td>
            <td>
              <div class="flex flex-wrap gap-1">
                <UBadge
                  v-for="manifest in image.Manifests"
                  :key="manifest.Digest"
                  color="neutral"
                  variant="soft"
                  size="sm"
                >
                  {{ manifest.Platform?.Os || '—' }}/{{ manifest.Platform?.Arch || '—' }}
                </UBadge>
              </div>
            </td>
            <td class="whitespace-nowrap">
              {{ bytes(image.Size || image.Manifests?.reduce((sum, m) => sum + Number(m.Size || 0), 0)) }}
            </td>

            <td class="whitespace-nowrap text-muted">
              {{ date(image.LastUpdated) }}
            </td>
            <td v-if="canDelete">
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                :aria-label="`${t('delete')} ${image.Tag || image.Digest}`"
                @click="confirm([image])"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <DeleteManifestsDialog
      v-if="repo && canDelete"
      v-model:open="confirming"
      :repo="repo"
      :images="targets"
      @completed="afterDelete"
    />
  </div>
</template>

<script setup lang="ts">
import type { Image } from '~/utils/types';

const props = defineProps<{ images: Image[]; repo?: string; selectionKey?: string }>();
const emit = defineEmits<{ deleted: [] }>();
const registry = useRegistry();
const canDelete = computed(() => !!props.repo && !!registry.info.value?.deleteEnabled);
const selected = ref<string[]>([]);
const confirming = ref(false);
const targets = ref<Image[]>([]);
const key = (image: Image) => `${image.Tag}:${image.Digest}`;
const allSelected = computed(() => props.images.length > 0 && selected.value.length === props.images.length);
watch(
  () => [props.images, props.repo, props.selectionKey],
  () => {
    selected.value = [];
  },
);
watch(
  () => props.repo,
  () => {
    confirming.value = false;
  },
);
function toggle(image: Image, checked: boolean | 'indeterminate') {
  selected.value =
    checked === true ? [...selected.value, key(image)] : selected.value.filter((value) => value !== key(image));
}
function confirm(images: Image[]) {
  targets.value = [...images];
  confirming.value = true;
}
function afterDelete() {
  selected.value = [];
  emit('deleted');
}
const { t } = useI18n();
const { date, bytes } = useFormatting();
</script>
