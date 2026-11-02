import type { MonitoringOverview, MonitoringSample, StorageCounters } from '../../shared/monitoring'
import { enabled, parseStorageMetrics, parseProcessStart, storageDelta } from './monitoring-core'
import { MonitoringStore } from './monitoring-store'

interface MonitoringConfig {
  registryUpstream: string
  monitoringEnabled: unknown
  monitoringMetricsUrl: string
  monitoringMetricsToken: string
  monitoringWebhookSecret: string
  monitoringDatabasePath: string
}
export class MonitoringService {
  store: MonitoringStore | null = null
  collectorError: string | null = null
  eventError: string | null = null
  private busy = false
  private previous: {
    at: number
    counters: Map<string, StorageCounters>
    processStart: number | null
  } | null = null
  private lastCleanup = 0
  private closed = false
  private timer: ReturnType<typeof setInterval> | null = null
  constructor(readonly config: MonitoringConfig) {}
  get active() {
    return enabled(this.config.monitoringEnabled)
  }
  private openStore() {
    if (!this.store)
      this.store = new MonitoringStore(
        this.config.monitoringDatabasePath,
        new URL(this.config.registryUpstream).origin,
      )
    return this.store
  }
  start() {
    if (!this.active || this.timer) return
    void this.collect()
    this.timer = setInterval(() => {
      void this.collect()
    }, 60000)
    this.timer.unref()
  }
  stop() {
    this.closed = true
    if (this.timer) clearInterval(this.timer)
    this.store?.close()
    this.store = null
  }
  async collect() {
    if (this.busy || this.closed || !this.active) return
    this.busy = true
    const at = Date.now()
    const sample: MonitoringSample = {
      at,
      reachable: false,
      authRequired: false,
      latencyMs: null,
      probeError: null,
      metricsError: null,
      storage: null,
    }
    try {
      const store = this.openStore()
      await Promise.all([
        (async () => {
          const began = performance.now()
          try {
            const response = await fetch(new URL('/v2/', this.config.registryUpstream), {
              redirect: 'manual',
              signal: AbortSignal.timeout(10000),
            })
            sample.latencyMs = performance.now() - began
            sample.reachable = response.ok || response.status === 401
            sample.authRequired = response.status === 401
            if (!sample.reachable) sample.probeError = `HTTP ${response.status}`
            await response.body?.cancel()
          } catch {
            sample.probeError = 'probeFailed'
          }
        })(),
        (async () => {
          if (!this.config.monitoringMetricsUrl) return
          try {
            const url = new URL(this.config.monitoringMetricsUrl)
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
              throw new Error('Invalid metrics URL')
            const response = await fetch(url, {
              redirect: 'manual',
              signal: AbortSignal.timeout(10000),
              headers: this.config.monitoringMetricsToken
                ? { Authorization: `Bearer ${this.config.monitoringMetricsToken}` }
                : {},
            })
            if (!response.ok) {
              await response.body?.cancel()
              throw new Error('Metrics failed')
            }
            const text = await response.text()
            const counters = parseStorageMetrics(text)
            const processStart = parseProcessStart(text)
            sample.storage = storageDelta(
              this.previous?.processStart === processStart ? this.previous.counters : null,
              counters,
              (at - (this.previous?.at || at)) / 1000,
            )
            this.previous = { at, counters, processStart }
          } catch {
            sample.metricsError = 'metricsFailed'
            this.previous = null
          }
        })(),
      ])
      if (this.closed) return
      store.saveSample(sample)
      if (at - this.lastCleanup >= 86400000) {
        store.cleanup(at)
        this.lastCleanup = at
      }
      this.collectorError = null
    } catch {
      if (!this.closed) this.collectorError = 'databaseFailed'
    } finally {
      this.busy = false
    }
  }
  saveEvents(events: Parameters<MonitoringStore['saveEvents']>[0]) {
    try {
      this.openStore().saveEvents(events)
      this.eventError = null
    } catch (error) {
      this.eventError = 'databaseFailed'
      throw error
    }
  }
  overview(range: '24h' | '7d'): MonitoringOverview {
    const sources = {
      metrics: Boolean(this.config.monitoringMetricsUrl),
      events: Boolean(this.config.monitoringWebhookSecret),
      lastEventAt: null,
      collectorError: this.collectorError || this.eventError,
    }
    try {
      return this.openStore().overview(range, sources)
    } catch {
      return {
        startedAt: null,
        lastSuccessAt: null,
        latest: null,
        sources: { ...sources, collectorError: 'databaseFailed' },
        totals: null,
        activity: [],
        series: [],
      }
    }
  }
}
let instance: MonitoringService | undefined
export function monitoringService() {
  return (instance ||= new MonitoringService(useRuntimeConfig()))
}
