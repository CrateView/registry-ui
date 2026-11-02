<script setup lang="ts">
const props = defineProps<{
  title: string
  labels: string[]
  series: { name: string; values: (number | null)[] }[]
  gaps: boolean[]
}>()
const { t, locale } = useI18n()
const colors = ['var(--ui-primary)', 'var(--ui-text-muted)']
const maximum = computed(() =>
  Math.max(1, ...props.series.flatMap((s) => s.values.filter((v): v is number => v !== null))),
)
const hasData = computed(() => props.series.some((s) => s.values.some((v) => v !== null)))
const paths = computed(() =>
  props.series.map((s) => {
    let drawing = false
    return s.values
      .map((value, index) => {
        if (value === null) {
          drawing = false
          return ''
        }
        const command = drawing && !props.gaps[index] ? 'L' : 'M'
        drawing = !props.gaps[index]
        return `${command}${20 + (index / Math.max(1, props.labels.length - 1)) * 560},${170 - (value / maximum.value) * 145}`
      })
      .join(' ')
  }),
)
const format = (value: number | null | undefined) =>
  value == null
    ? '—'
    : new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2 }).format(value)
</script>
<template>
  <section class="panel min-w-0 p-5">
    <h2 class="font-semibold">{{ title }}</h2>
    <div class="my-3 flex flex-wrap gap-4 text-xs">
      <span v-for="(item, index) in series" :key="item.name" :style="{ color: colors[index] }">{{
        item.name
      }}</span>
    </div>
    <svg
      v-if="hasData"
      viewBox="0 0 600 200"
      class="w-full"
      role="img"
      :aria-label="`${title}. ${t('monitorChartHint')}`"
    >
      <title>{{ title }}</title>
      <path d="M20 20 V170 H580" fill="none" stroke="var(--ui-border)" />
      <rect
        v-for="(gap, index) in gaps"
        :key="`gap-${index}`"
        :x="20 + (index / gaps.length) * 560"
        y="20"
        :width="560 / gaps.length"
        :height="gap ? 150 : 0"
        fill="var(--ui-text-muted)"
        opacity="0.1"
      />
      <path
        v-for="(path, index) in paths"
        :key="index"
        :d="path"
        fill="none"
        :stroke="colors[index]"
        stroke-width="2"
      />
      <template v-for="(item, line) in series" :key="item.name">
        <circle
          v-for="(value, index) in item.values"
          :key="index"
          :cx="20 + (index / Math.max(1, labels.length - 1)) * 560"
          :cy="170 - ((value ?? 0) / maximum) * 145"
          :r="value === null ? 0 : 2.5"
          :fill="colors[line]"
        />
      </template>
      <text x="20" y="193" fill="var(--ui-text-muted)" font-size="10">{{ labels[0] }}</text>
      <text x="580" y="193" text-anchor="end" fill="var(--ui-text-muted)" font-size="10">
        {{ labels[labels.length - 1] }}
      </text>
      <text x="22" y="14" fill="var(--ui-text-muted)" font-size="10">{{ format(maximum) }}</text>
    </svg>
    <p v-else class="py-10 text-sm text-muted">{{ t('monitorNoData') }}</p>
    <details class="mt-3 text-xs">
      <summary class="cursor-pointer text-muted">{{ t('monitorDataTable') }}</summary>
      <div class="mt-3 overflow-x-auto">
        <table class="data-table">
          <caption class="sr-only">
            {{
              title
            }}
          </caption>
          <thead>
            <tr>
              <th>{{ t('monitorTime') }}</th>
              <th v-for="item in series" :key="item.name">{{ item.name }}</th>
              <th>{{ t('monitorGap') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(label, index) in labels" :key="index">
              <th scope="row">{{ label }}</th>
              <td v-for="item in series" :key="item.name">{{ format(item.values[index]) }}</td>
              <td>{{ gaps[index] ? t('monitorGap') : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>
</template>
