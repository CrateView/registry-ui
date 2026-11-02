<template>
  <UModal
    v-model:open="open"
    :title="t('commandPalette')"
    :ui="{ content: 'sm:max-w-xl' }"
    @after:leave="previousFocus?.focus()"
  >
    <template #content>
      <div>
        <span class="sr-only">{{ t('commandPalette') }}</span>
        <UCommandPalette
          v-model:search-term="term"
          :groups="groups"
          :loading="pending"
          :placeholder="t('search')"
          :aria-label="t('search')"
          @update:open="open = $event"
        />
        <p v-if="failure" role="alert" class="px-4 pb-3 text-sm text-error">
          {{ failure }}
        </p>
        <p
          v-else-if="term.trim() && !pending && !suggestions.length"
          role="status"
          class="px-4 pb-3 text-sm text-muted"
        >
          {{ t('empty') }}
        </p>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { createAccountSchemas } from '../../shared/validation';

const { t } = useI18n();
const registry = useRegistry();
const route = useRoute();
const open = useState<boolean>('command-palette-open', () => false);
const term = ref('');
const suggestions = ref<{ label: string; to: string }[]>([]);
const pending = ref(false);
const searchValidation = computed(() => createAccountSchemas(t).search.safeParse({ search: term.value }));
const failure = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
let sequence = 0;
let previousFocus: HTMLElement | null = null;
function show() {
  if (open.value) return;
  open.value = true;
}
watch(
  open,
  (visible) => {
    if (visible) {
      previousFocus = document.activeElement as HTMLElement | null;
      term.value = String(route.query.search || '');
    }
  },
  { flush: 'sync' },
);
const groups = computed(() => [
  {
    id: 'registry',
    label: t('registry'),
    ignoreFilter: true,
    items: suggestions.value.map((item) => ({
      ...item,
      icon: 'i-lucide-box',
      onSelect: () => {
        open.value = false;
      },
    })),
  },
  {
    id: 'results',
    ignoreFilter: true,
    items:
      searchValidation.value.success && term.value.trim()
        ? [
            {
              label: `${t('searchResults')}: ${term.value}`,
              icon: 'i-lucide-search',
              onSelect: () => {
                open.value = false;
                navigateTo({ path: '/explore', query: { search: term.value } });
              },
            },
          ]
        : [],
  },
  {
    id: 'navigation',
    label: t('navigation'),
    items: [
      ...(registry.info.value?.monitoringEnabled ? [{ label: t('overview'), to: '/home' }] : []),
      { label: t('explore'), to: '/explore' },
      { label: t('settings'), to: '/settings' },
      ...(registry.info.value?.canCreateUsers ? [{ label: t('users'), to: '/users' }] : []),
    ].map((item) => ({
      ...item,
      onSelect: () => {
        open.value = false;
      },
    })),
  },
]);
watch([term, open], ([value, visible]) => {
  clearTimeout(timer);
  const current = ++sequence;
  suggestions.value = [];
  failure.value = '';
  pending.value = false;
  if (!visible || !value.trim()) return;
  if (!searchValidation.value.success) {
    failure.value = searchValidation.value.error.issues[0]?.message || t('searchInvalid');
    return;
  }
  pending.value = true;
  timer = setTimeout(async () => {
    try {
      let result: { label: string; to: string }[];
      if (value.includes(':')) {
        const separator = value.lastIndexOf(':');
        const name = value.slice(0, separator);
        const response = await registry.repository(name);
        result = response.Images.filter((image) =>
          image.Tag?.toLowerCase().includes(value.slice(separator + 1).toLowerCase()),
        )
          .slice(0, 5)
          .map((image) => ({ label: `${name}:${image.Tag}`, to: imagePath(name, image.Tag!) }));
      } else {
        result = (await registry.catalog())
          .filter((name) => name.toLowerCase().includes(value.toLowerCase()))
          .slice(0, 5)
          .map((name) => ({ label: name, to: repoPath(name) }));
      }
      if (current === sequence) suggestions.value = result;
    } catch (error) {
      if (current === sequence) failure.value = String(error);
    } finally {
      if (current === sequence) pending.value = false;
    }
  }, 250);
});
watch(
  () => route.fullPath,
  () => {
    open.value = false;
  },
);
function shortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.altKey) return;
  const key = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'k';
  const slash = !event.ctrlKey && !event.metaKey && event.key === '/';
  if (!key && !slash) return;
  if (
    slash &&
    event.target instanceof Element &&
    event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')
  )
    return;
  event.preventDefault();
  show();
}
onMounted(() => {
  window.addEventListener('keydown', shortcut);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', shortcut);
  clearTimeout(timer);
  sequence++;
});
</script>
