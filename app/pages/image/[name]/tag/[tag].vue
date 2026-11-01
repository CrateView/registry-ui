<script setup lang="ts">
import type { Image } from '~/utils/types'
const route = useRoute()
const name = computed(() => String(route.params.name))
const tag = computed(() => String(route.params.tag))
const registry = useRegistry()
const { t } = useI18n()
const { bytes, date, copy } = useFormatting()
const image = ref<Image>()
const pending = ref(true)
const error = ref('')
const selected = ref('')
const tab = ref('layers')
const confirming = ref(false)
const deleting = ref(false)
const manifest = computed(
  () =>
    image.value?.Manifests?.find((m) => m.Digest === selected.value) || image.value?.Manifests?.[0],
)
const artifact = computed(() =>
  Boolean(
    image.value?.ArtifactType &&
    ![
      'application/vnd.oci.image.config.v1+json',
      'application/vnd.docker.container.image.v1+json',
    ].includes(image.value.ArtifactType),
  ),
)
const referrers = ref<NonNullable<Image['Referrers']>>([])
const referrersSupported = ref(true)
const referrersError = ref('')
async function loadReferrers() {
  if (tab.value !== 'referrers' || !image.value) return
  referrersError.value = ''
  try {
    const results = await Promise.all(
      [
        ...new Set(
          [image.value.Digest, manifest.value?.Digest].filter((value): value is string => !!value),
        ),
      ].map((digest) =>
        registry.request<{ supported: boolean; referrers: NonNullable<Image['Referrers']> }>(
          '/api/registry/referrers',
          { query: { name: name.value, digest } },
        ),
      ),
    )
    referrersSupported.value = results.some((result) => result.supported)
    referrers.value = results
      .flatMap((result) => result.referrers)
      .filter(
        (entry, index, list) => list.findIndex((other) => other.Digest === entry.Digest) === index,
      )
  } catch (error) {
    referrersError.value = String(error)
  }
}
watch([tab, selected], loadReferrers)
const documentData = ref<unknown>(null)
const documentError = ref('')
const documentPending = ref(false)
let documentSequence = 0
async function loadDocument() {
  if (!['manifest', 'config'].includes(tab.value) || !image.value) return
  const current = ++documentSequence
  documentPending.value = true
  documentError.value = ''
  try {
    const value = await registry.request('/api/registry/document', {
      query: {
        name: name.value,
        kind: tab.value,
        reference: tab.value === 'config' ? manifest.value?.ConfigDigest : image.value.Digest,
      },
    })
    if (current === documentSequence) documentData.value = value
  } catch (error) {
    if (current === documentSequence) documentError.value = String(error)
  } finally {
    if (current === documentSequence) documentPending.value = false
  }
}
watch([tab, selected], loadDocument)
const tabs = computed(() => [
  { key: 'layers', icon: 'i-lucide-layers' },

  { key: 'referrers', icon: 'i-lucide-git-branch' },
  { key: 'metadata', icon: 'i-lucide-file-json' },
  { key: 'manifest', icon: 'i-lucide-braces' },
  { key: 'config', icon: 'i-lucide-settings' },
])
const platformItems = computed(() =>
  (image.value?.Manifests || []).map((m) => ({
    label: `${m.Platform?.Os || '—'}/${m.Platform?.Arch || '—'} · ${m.Digest.slice(7, 19)}`,
    value: m.Digest,
  })),
)
useHead(() => ({ title: `${name.value}:${tag.value}` }))
async function load() {
  pending.value = true
  error.value = ''
  try {
    image.value = await registry.image(name.value, tag.value)
    selected.value = image.value?.Manifests?.[0]?.Digest || ''
    if (!image.value?.Digest) error.value = t('notFound')
  } catch (failure) {
    error.value = String(failure)
  } finally {
    pending.value = false
  }
}
onMounted(load)
watch(() => [name.value, tag.value], load)
async function remove() {
  deleting.value = true
  try {
    await registry.request('/api/registry/manifest', {
      method: 'DELETE',
      query: { name: name.value, digest: image.value!.Digest },
    })
    confirming.value = false
    useToast().add({ title: t('deleted'), color: 'success' })
    await navigateTo(repoPath(name.value))
  } catch (failure) {
    error.value = String(failure)
    confirming.value = false
  } finally {
    deleting.value = false
  }
}
</script>
<template>
  <div class="page space-y-6">
    <UButton
      :to="repoPath(name)"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      class="p-0"
      >{{ name }}</UButton
    ><RequestState :pending="pending" :error="error" @retry="load"
      ><template v-if="image"
        ><div class="flex flex-wrap justify-between gap-4">
          <div>
            <p class="eyebrow mb-3">{{ artifact ? t('artifacts') : t('images') }}</p>
            <h1 class="page-title break-all">
              {{ name }}<span class="text-primary">:{{ tag }}</span>
            </h1>
            <div class="mt-4"></div>
          </div>
          <UButton
            v-if="image.IsDeletable"
            color="error"
            variant="outline"
            icon="i-lucide-trash-2"
            class="self-start"
            @click="confirming = true"
            >{{ t('delete') }}</UButton
          >
        </div>
        <div class="panel flex flex-wrap items-center gap-4 p-5">
          <USelect
            v-if="platformItems.length"
            v-model="selected"
            :items="platformItems"
            :aria-label="t('platform')"
            class="min-w-48"
          /><button
            class="mono min-w-0 break-all text-left text-xs text-muted hover:text-primary"
            :aria-label="t('copy') + ' ' + t('digest')"
            @click="copy(image.Digest)"
          >
            {{ image.Digest }} <UIcon name="i-lucide-copy" />
          </button>
        </div>
        <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div class="min-w-0 space-y-5">
            <div class="flex gap-1 overflow-x-auto border-b border-default pb-2">
              <UButton
                v-for="item in tabs"
                :key="item.key"
                :icon="item.icon"
                :variant="tab === item.key ? 'soft' : 'ghost'"
                :color="tab === item.key ? 'primary' : 'neutral'"
                class="shrink-0"
                @click="tab = item.key"
                >{{ t(item.key) }}</UButton
              >
            </div>
            <div v-if="tab === 'layers'" class="space-y-3">
              <RequestState :empty="!manifest?.History?.length && !manifest?.Layers?.length"
                ><details
                  v-for="(entry, index) in manifest?.History"
                  :key="index"
                  class="panel p-5"
                >
                  <summary class="flex cursor-pointer items-start justify-between gap-4">
                    <CodeBlock
                      :code="entry.HistoryDescription?.CreatedBy || t('unknown')"
                      language="bash"
                      class="min-w-0 flex-1 text-xs leading-relaxed"
                    /><span class="shrink-0 text-xs text-muted">{{
                      bytes(entry.Layer?.Size)
                    }}</span>
                  </summary>
                  <div class="mt-4 space-y-2 text-xs text-muted">
                    <p class="mono break-all">{{ entry.Layer?.Digest }}</p>
                    <p v-if="entry.HistoryDescription?.EmptyLayer">{{ t('emptyLayer') }}</p>
                  </div>
                </details>
                <div v-if="!manifest?.History?.length" class="space-y-3">
                  <div v-for="layer in manifest?.Layers" :key="layer.Digest" class="panel p-5">
                    <p class="mono break-all text-xs">{{ layer.Digest }}</p>
                    <p class="mt-2 text-xs text-muted">{{ bytes(layer.Size) }}</p>
                  </div>
                </div></RequestState
              >
            </div>
            <div v-else-if="tab === 'referrers'" class="space-y-4">
              <UAlert v-if="referrersError" :description="referrersError" color="error" />
              <UAlert
                v-else-if="!referrersSupported"
                :title="t('referrersUnsupported')"
                color="warning"
              />
              <ReferrerList v-else :repo="name" :referrers="referrers" />
            </div>
            <RequestState
              v-else-if="tab === 'manifest' || tab === 'config'"
              :pending="documentPending"
              :error="documentError"
              @retry="loadDocument"
              ><div class="panel overflow-hidden p-5">
                <UButton
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-copy"
                  class="mb-4"
                  @click="copy(JSON.stringify(documentData, null, 2))"
                  >{{ t('copy') }}</UButton
                >
                <CodeBlock
                  :code="JSON.stringify(documentData, null, 2) ?? ''"
                  language="json"
                  class="text-xs leading-relaxed"
                /></div
            ></RequestState>
            <div v-else class="panel space-y-5 p-6">
              <h2 class="font-semibold">{{ t('metadata') }}</h2>
              <MarkdownText :text="image.Description || t('noDescription')" />
              <dl class="space-y-4 text-sm">
                <div
                  v-for="entry in [
                    { label: t('vendor'), value: image.Vendor },
                    { label: t('license'), value: image.Licenses },
                    { label: t('artifactType'), value: image.ArtifactType },
                    { label: t('configDigest'), value: manifest?.ConfigDigest },
                  ]"
                  :key="entry.label"
                >
                  <dt class="mb-1 text-xs text-muted">{{ entry.label }}</dt>
                  <dd class="break-all">{{ entry.value || '—' }}</dd>
                </div>
              </dl>
            </div>
          </div>
          <aside class="space-y-4">
            <PullCommand :name="name" :tag="tag" :artifact="artifact" />
            <div class="panel divide-y divide-default px-5">
              <div
                v-for="entry in [
                  {
                    label: t('platform'),
                    value: `${manifest?.Platform?.Os || '—'}/${manifest?.Platform?.Arch || '—'}`,
                  },
                  { label: t('size'), value: bytes(manifest?.Size || image.Size) },
                  { label: t('updated'), value: date(manifest?.LastUpdated || image.LastUpdated) },

                  { label: t('license'), value: image.Licenses || '—' },
                ]"
                :key="entry.label"
                class="py-4"
              >
                <p class="text-xs text-muted">{{ entry.label }}</p>
                <p class="mt-1 break-all text-sm">{{ entry.value }}</p>
              </div>
            </div>
          </aside>
        </div></template
      ></RequestState
    ><UModal
      v-model:open="confirming"
      :title="t('delete')"
      :description="
        t('deleteConfirm', { image: image?.Digest, tags: image?.AffectedTags?.join(', ') || '—' })
      "
      ><template #footer
        ><UButton color="neutral" variant="outline" @click="confirming = false">{{
          t('cancel')
        }}</UButton
        ><UButton color="error" :loading="deleting" @click="remove">{{
          t('confirm')
        }}</UButton></template
      ></UModal
    >
  </div>
</template>
