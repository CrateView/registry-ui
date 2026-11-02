<script setup lang="ts">
import type { Repo } from '~/utils/types'

const props = defineProps<{ repos: Repo[] }>()
const { t } = useI18n()
const view = useState<'table' | 'grid'>('repository-view', () => 'table')
const collapsedPaths = ref(new Set<string>())
function toggle(path: string) {
  const next = new Set(collapsedPaths.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  collapsedPaths.value = next
}
const rows = computed(() => {
  interface Node {
    name: string
    path: string
    repo?: Repo
    children: Map<string, Node>
  }
  const root = new Map<string, Node>()
  for (const repo of props.repos) {
    let children = root
    let path = ''
    for (const [index, name] of repo.Name.split('/').entries()) {
      path = path ? `${path}/${name}` : name
      let node = children.get(name)
      if (!node) {
        node = { name, path, children: new Map() }
        children.set(name, node)
      }
      if (index === repo.Name.split('/').length - 1) node.repo = repo
      children = node.children
    }
  }
  const result: { name: string; path: string; depth: number; repo?: Repo; hasChildren: boolean }[] =
    []
  function visit(nodes: Map<string, Node>, depth: number) {
    for (const node of nodes.values()) {
      result.push({
        name: node.name,
        path: node.path,
        depth,
        repo: node.repo,
        hasChildren: !!node.children.size,
      })
      if (!collapsedPaths.value.has(node.path)) visit(node.children, depth + 1)
    }
  }
  visit(root, 0)
  return result
})
</script>

<template>
  <div class="space-y-3">
    <div class="flex justify-end gap-1" role="group" :aria-label="t('view')">
      <UButton
        v-for="mode in ['table', 'grid'] as const"
        :key="mode"
        :icon="mode === 'table' ? 'i-lucide-list-tree' : 'i-lucide-layout-grid'"
        color="neutral"
        :variant="view === mode ? 'soft' : 'ghost'"
        :aria-pressed="view === mode"
        @click="view = mode"
        >{{ t(mode) }}</UButton
      >
    </div>
    <RepoGrid v-if="view === 'grid'" :repos="repos" />
    <div v-else class="panel overflow-x-auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ t('name') }}</th>
            <th>{{ t('description') }}</th>
            <th>{{ t('platforms') }}</th>
            <th>{{ t('tags') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.path"
            :class="{ 'cursor-pointer': row.hasChildren && !row.repo }"
            @click="row.hasChildren && !row.repo && toggle(row.path)"
          >
            <td>
              <div
                class="flex items-center gap-2"
                :style="{ paddingInlineStart: `${row.depth * 1.5}rem` }"
              >
                <button
                  v-if="row.hasChildren"
                  type="button"
                  class="inline-flex items-center gap-2 text-muted"
                  :aria-expanded="!collapsedPaths.has(row.path)"
                  :aria-label="
                    t(collapsedPaths.has(row.path) ? 'expandFolder' : 'collapseFolder', {
                      name: row.path,
                    })
                  "
                  @click.stop="toggle(row.path)"
                >
                  <UIcon
                    :name="
                      collapsedPaths.has(row.path)
                        ? 'i-lucide-chevron-right'
                        : 'i-lucide-chevron-down'
                    "
                    class="size-4 shrink-0"
                  />
                  <UIcon v-if="!row.repo" name="i-lucide-folder" class="size-4 shrink-0" />
                  <span v-if="!row.repo" class="font-medium">{{ row.name }}</span>
                </button>
                <UIcon
                  v-if="row.repo || !row.hasChildren"
                  :name="row.repo ? 'i-lucide-container' : 'i-lucide-folder'"
                  class="size-4 shrink-0 text-muted"
                />
                <NuxtLink
                  v-if="row.repo"
                  :to="repoPath(row.path)"
                  :title="row.path"
                  class="font-semibold text-highlighted hover:text-primary"
                  ><bdi>{{ row.name }}</bdi></NuxtLink
                >
                <span v-else-if="!row.hasChildren" class="font-medium text-muted">{{
                  row.name
                }}</span>
              </div>
            </td>
            <td :class="row.repo?.Error ? 'text-error' : 'text-muted'">
              {{
                row.repo
                  ? row.repo.Error
                    ? t('error')
                    : row.repo.RepresentativeImage?.Description || t('noDescription')
                  : ''
              }}
            </td>
            <td>
              <div v-if="row.repo" class="flex flex-wrap gap-1">
                <UBadge
                  v-for="platform in row.repo.Platforms"
                  :key="`${platform.Os}/${platform.Arch}`"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  >{{ platform.Os || '—' }}/{{ platform.Arch || '—' }}</UBadge
                >
              </div>
            </td>
            <td>{{ row.repo ? (row.repo.TagCount ?? '—') : '' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
