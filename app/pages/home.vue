<template>
  <div class="page space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="eyebrow mb-3">
          {{ t('registry') }}
        </p>
        <h1 class="page-title">
          {{ t('overview') }}
        </h1>
        <p class="mt-3 text-sm text-muted">
          {{ t('monitorDescription') }}
        </p>
      </div>
      <div class="flex gap-2">
        <USelect
          v-model="range"
          :items="[
            { label: t('monitor24h'), value: '24h' },
            { label: t('monitor7d'), value: '7d' },
          ]"
          :aria-label="t('monitorRange')"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          :loading="pending"
          :aria-label="t('retry')"
          @click="load"
        />
      </div>
    </div>
    <UAlert v-if="error" color="error" :title="t('error')" :description="error" />
    <p v-if="pending && !data" role="status" class="text-muted">
      {{ t('loading') }}
    </p>
    <template v-if="data">
      <UAlert v-if="data.sources.collectorError" color="error" :title="t('monitorDatabaseError')" />
      <UAlert
        v-if="stale || data.latest?.probeError || data.latest?.metricsError"
        color="warning"
        :title="t('monitorCollectionWarning')"
      />
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div v-for="card in cards" :key="card.label" class="panel p-5">
          <p class="text-sm text-muted">
            {{ card.label }}
          </p>
          <p class="mt-3 text-xl font-semibold">
            {{ card.value }}
          </p>
        </div>
      </div>
      <div class="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
        <span>{{ t('monitorStarted') }}: {{ time(data.startedAt) }}</span>
        <span>{{ t('monitorLastSuccess') }}: {{ time(data.lastSuccessAt) }}</span>
        <span>
          {{ t('monitorMetricsSource') }}: {{ t(data.sources.metrics ? 'monitorConfigured' : 'monitorNotConfigured') }}
        </span>
        <span>
          {{ t('monitorEventSource') }}: {{ t(data.sources.events ? 'monitorConfigured' : 'monitorNotConfigured') }}
        </span>
        <span>{{ t('monitorLastEvent') }}: {{ time(data.sources.lastEventAt) }}</span>
      </div>
      <p class="text-xs text-muted">
        {{ t('monitorChartHint') }}
      </p>
      <div class="grid gap-4 xl:grid-cols-2">
        <MonitoringChart
          :title="t('monitorEvents')"
          :labels="labels"
          :gaps="gaps"
          :series="[
            { name: t('monitorPush'), values: data.series.map((p) => p.push) },
            { name: t('monitorPull'), values: data.series.map((p) => p.pull) },
          ]"
        />
        <MonitoringChart
          :title="t('monitorOperations')"
          :labels="labels"
          :gaps="gaps"
          :series="[{ name: t('monitorPerSecond'), values: data.series.map((p) => p.operationsPerSecond) }]"
        />
        <MonitoringChart
          :title="t('monitorDuration')"
          :labels="labels"
          :gaps="gaps"
          :series="[{ name: 'ms', values: data.series.map((p) => p.meanDurationMs) }]"
        />
      </div>
      <section class="panel overflow-hidden">
        <div class="p-5">
          <h2 class="font-semibold">
            {{ t('monitorActivity') }}
          </h2>
          <p class="mt-2 text-xs text-muted">
            {{ t('monitorEventHint') }}
          </p>
        </div>
        <p v-if="!data.activity.length" class="px-5 pb-5 text-sm text-muted">
          {{ t(data.sources.events ? 'monitorNoEvents' : 'monitorNotConfigured') }}
        </p>
        <div v-else class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>
                  {{ t('monitorTime') }}
                </th>
                <th>
                  {{ t('monitorAction') }}
                </th>
                <th>
                  {{ t('repositories') }}
                </th>
                <th>
                  {{ t('tag') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="event in data.activity" :key="event.id">
                <td class="whitespace-nowrap">
                  {{ time(event.at) }}
                </td>
                <td>
                  {{ t(event.action === 'push' ? 'monitorPush' : 'monitorPull') }}
                </td>
                <td>
                  <NuxtLink class="text-primary" :to="repoPath(event.repository)">
                    {{ event.repository }}
                  </NuxtLink>
                </td>
                <td>
                  {{ event.tag || '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { MonitoringOverview } from '~~/shared/monitoring';

const { t, locale } = useI18n();
useHead(() => ({ title: t('overview') }));
const registry = useRegistry();
if (!registry.info.value?.monitoringEnabled) await navigateTo('/explore', { replace: true });
const range = ref<'24h' | '7d'>('24h');
const data = ref<MonitoringOverview | null>(null);
const pending = ref(false);
const now = ref(Date.now());
const error = ref('');
let sequence = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const { date: time } = useFormatting();
const number = (value: number | null | undefined) =>
  value == null ? '—' : new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(value);
const labels = computed(() => data.value?.series.map((point) => time(point.at)) || []);
const gaps = computed(() => data.value?.series.map((point) => point.gap) || []);
const stale = computed(() => !data.value?.latest || now.value - data.value.latest.at > 90000);
const cards = computed(() => [
  {
    label: t('monitorReachability'),
    value: stale.value
      ? t('monitorUnknown')
      : data.value?.latest?.reachable
        ? t(data.value.latest.authRequired ? 'monitorAuthRequired' : 'monitorReachable')
        : t('monitorUnreachable'),
  },
  {
    label: t('monitorLatency'),
    value: `${number(stale.value ? null : data.value?.latest?.latencyMs)} ms`,
  },
  { label: t('monitorPush'), value: number(data.value?.totals?.push) },
  { label: t('monitorPull'), value: number(data.value?.totals?.pull) },
]);
async function load() {
  now.value = Date.now();
  const current = ++sequence;
  pending.value = true;
  error.value = '';
  try {
    const result = await registry.request<MonitoringOverview>('/api/monitoring/overview', {
      query: { range: range.value },
    });
    if (current === sequence) data.value = result;
  } catch (failure) {
    if (current === sequence) error.value = String(failure);
  } finally {
    if (current === sequence) pending.value = false;
  }
}
watch(range, () => {
  data.value = null;
  void load();
});
onMounted(() => {
  if (!registry.info.value?.monitoringEnabled) return;
  void load();
  timer = setInterval(() => {
    if (!pending.value) void load();
  }, 60000);
});
onUnmounted(() => {
  sequence++;
  clearInterval(timer);
});
</script>
