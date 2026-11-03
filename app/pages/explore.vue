<template>
  <div class="page space-y-6">
    <div>
      <p class="eyebrow mb-3">
        {{ t('registry') }}
      </p>
      <h1 class="page-title">
        {{ t('explore') }}
      </h1>
      <p class="mt-3 text-sm text-muted">
        {{ t('exploreHint') }}
      </p>
    </div>
    <div class="space-y-3">
      <div class="flex flex-wrap items-start gap-3">
        <div class="min-w-48 flex-1">
          <ValidatedSearchInput
            v-model="term"
            icon="i-lucide-search"
            class="w-full"
            :placeholder="t('search')"
            :aria-label="t('search')"
          />
        </div>
        <USelect
          v-model="sort"
          :items="[
            { label: t('alphabetical'), value: 'az' },
            { label: t('reverseAlphabetical'), value: 'za' },
          ]"
          :aria-label="t('sort')"
        />
        <div v-if="!tagSearch" class="ms-auto flex gap-1" role="group" :aria-label="t('view')">
          <UButton
            v-for="mode in ['table', 'grid'] as const"
            :key="mode"
            color="neutral"
            :icon="mode === 'table' ? 'i-lucide-list-tree' : 'i-lucide-layout-grid'"
            :variant="view === mode ? 'soft' : 'ghost'"
            :aria-pressed="view === mode"
            @click="view = mode"
          >
            {{ t(mode) }}
          </UButton>
        </div>
      </div>
      <p v-if="!pending && !error" class="text-sm text-muted">
        {{ t('results', { count: total }) }}
      </p>
    </div>
    <RequestState :pending="pending" :error="error" :empty="!repos.length && !images.length" @retry="load">
      <RepoOverview v-if="repos.length" :repos="repos" :view="view" />
      <ImageTable v-if="images.length" :images="images" />
    </RequestState>
    <ResultPagination
      v-if="!pending && !error"
      v-model:page="page"
      :total="total"
      :items-per-page="tagSearch ? Math.max(1, total) : 12"
    />
  </div>
</template>

<script setup lang="ts">
import type { Repo, Image } from '~/utils/types';
import { createAccountSchemas } from '../../shared/validation';

const { t } = useI18n();
useHead(() => ({ title: t('explore') }));
const registry = useRegistry();
const route = useRoute();
const router = useRouter();
const names = ref<string[]>([]);
const repos = ref<Repo[]>([]);
const images = ref<Image[]>([]);
const term = ref(String(route.query.search || ''));
const appliedTerm = ref(term.value);
const sort = ref('az');
const view = useState<'table' | 'grid'>('repository-view', () => 'table');
const page = ref(1);
const pending = ref(true);
const error = ref('');
const revision = ref(0);
let catalogLoaded = false;
let mounted = false;
let sequence = 0;
let debounce: ReturnType<typeof setTimeout> | undefined;
const tagSearch = computed(() => appliedTerm.value.includes(':'));
const filtered = computed(() =>
  names.value
    .filter((name) => name.toLowerCase().includes(appliedTerm.value.toLowerCase()))
    .toSorted((a, b) => a.localeCompare(b) * (sort.value === 'az' ? 1 : -1)),
);
const total = computed(() => (tagSearch.value ? images.value.length : filtered.value.length));
async function load() {
  const current = ++sequence;
  const query = appliedTerm.value;
  pending.value = true;
  error.value = '';
  try {
    const validation = createAccountSchemas(t).search.safeParse({ search: query });
    if (!validation.success) throw new Error(validation.error.issues[0]?.message);
    if (!catalogLoaded) {
      const result = await registry.catalog();
      if (current !== sequence) return;
      names.value = result;
      catalogLoaded = true;
    }
    if (query.includes(':')) {
      const separator = query.lastIndexOf(':');
      const result = await registry.repository(query.slice(0, separator));
      if (current === sequence) {
        repos.value = [];
        images.value = result.Images.filter((image) => image.Tag?.includes(query.slice(separator + 1)));
      }
    } else {
      const result = await Promise.all(
        filtered.value.slice((page.value - 1) * 12, page.value * 12).map(async (name) => {
          try {
            return (await registry.repository(name, true)).Summary;
          } catch (failure) {
            return { Name: name, Error: String(failure) };
          }
        }),
      );
      if (current === sequence) {
        repos.value = result;
        images.value = [];
      }
    }
  } catch (failure) {
    if (current === sequence) error.value = String(failure);
  } finally {
    if (current === sequence) pending.value = false;
  }
}
function applySearch(value: string, updateUrl = false) {
  clearTimeout(debounce);
  debounce = undefined;
  appliedTerm.value = value;
  term.value = value;
  page.value = 1;
  revision.value++;
  if (updateUrl) {
    void router.replace({ query: { ...route.query, search: value || undefined } });
  }
}
watch(
  term,
  (value) => {
    if (value === appliedTerm.value && !debounce) return;
    // Invalidate immediately so an earlier request cannot finish during the debounce.
    sequence++;
    pending.value = true;
    error.value = '';
    clearTimeout(debounce);
    debounce = setTimeout(() => applySearch(value, true), 300);
  },
  { flush: 'sync' },
);
watch(
  () => route.query.search,
  (value) => {
    const query = String(value || '');
    if (query !== appliedTerm.value) applySearch(query);
  },
);
watch([page, sort, revision], () => {
  if (mounted && !debounce) void load();
});
onMounted(() => {
  mounted = true;
  void load();
});
onBeforeUnmount(() => {
  mounted = false;
  sequence++;
  clearTimeout(debounce);
});
</script>
