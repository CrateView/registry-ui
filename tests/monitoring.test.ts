import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  parseManifestEvents,
  parseProcessStart,
  parseStorageMetrics,
  storageDelta,
  validBearer,
} from '../server/utils/monitoring-core'
import { MonitoringStore, retentionMs } from '../server/utils/monitoring-store'
import { MonitoringService } from '../server/utils/monitoring'
import type { ManifestEvent, MonitoringSample } from '../shared/monitoring'
const now = Date.UTC(2026, 10, 2)
const event: ManifestEvent = {
  id: 'one',
  at: now - 1000,
  action: 'push',
  repository: 'team/image',
  tag: 'latest',
  digest: 'sha256:' + 'a'.repeat(64),
}
const envelope = (extra = {}) => ({
  events: [
    {
      id: event.id,
      timestamp: new Date(event.at).toISOString(),
      action: event.action,
      target: {
        repository: event.repository,
        tag: event.tag,
        digest: event.digest,
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
      },
      ...extra,
    },
  ],
})
const metrics = (count = 10, seconds = 2) =>
  `# HELP ignored\nregistry_storage_action_seconds_count{driver="filesystem",action="GetContent"} ${count}\nregistry_storage_action_seconds_sum{action="GetContent",driver="filesystem"} ${seconds}\nregistry_storage_action_seconds_bucket{le="1"} 400\n`
const sources = { metrics: true, events: true, lastEventAt: null, collectorError: null }
const sample = (at: number, storage: MonitoringSample['storage'] = null): MonitoringSample => ({
  at,
  reachable: true,
  authRequired: true,
  latencyMs: 1,
  probeError: null,
  metricsError: null,
  storage,
})
const cleanup: (() => void)[] = []
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) close()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
function store(source = 'http://registry:5000', path = ':memory:') {
  const value = new MonitoringStore(path, source, now - 86400000)
  cleanup.push(() => value.close())
  return value
}
describe('Distribution monitoring counters and notifications', () => {
  it('pairs normalized labels, ignores unknown metrics and calculates weighted counter deltas', () => {
    expect([...parseStorageMetrics(metrics()).values()]).toEqual([{ count: 10, seconds: 2 }])
    expect(
      storageDelta(parseStorageMetrics(metrics()), parseStorageMetrics(metrics(40, 5)), 60),
    ).toEqual({ operations: 30, seconds: 3, elapsed: 60 })
    expect(() => parseStorageMetrics('unknown_total 5')).toThrow()
    expect(() => parseStorageMetrics(metrics().replace('_sum', '_unknown'))).toThrow()
    expect(() => parseStorageMetrics(metrics().replace(' 10', ' NaN'))).toThrow()
  })
  it('leaves gaps on baseline, reset, disappearance, new series or interruption', () => {
    const before = parseStorageMetrics(metrics())
    expect(storageDelta(null, before, 60)).toBeNull()
    expect(storageDelta(before, parseStorageMetrics(metrics(1, 1)), 60)).toBeNull()
    expect(storageDelta(before, new Map(), 60)).toBeNull()
    expect(storageDelta(before, parseStorageMetrics(metrics(11, 3)), 120)).toBeNull()
    expect(storageDelta(before, new Map([['new', { count: 100, seconds: 30 }]]), 60)).toBeNull()
    expect(storageDelta(before, before, 60)?.operations).toBe(0)
    expect(parseProcessStart('process_start_time_seconds 12345.5')).toBe(12345.5)
    expect(parseProcessStart('unrelated 1')).toBeNull()
  })
  it('requires a separate bearer secret and validates manifest envelopes atomically', () => {
    expect(validBearer('Bearer secret', 'secret')).toBe(true)
    for (const header of [undefined, 'Basic secret', 'Bearer wrong'])
      expect(validBearer(header, 'secret')).toBe(false)
    expect(validBearer('Bearer ', '')).toBe(false)
    expect(parseManifestEvents(envelope(), now)).toEqual([event])
    expect(
      parseManifestEvents(envelope({ target: { mediaType: 'application/octet-stream' } }), now),
    ).toEqual([])
    for (const value of [
      {},
      { events: null },
      envelope({ id: '' }),
      envelope({ timestamp: 'bad' }),
      envelope({ timestamp: new Date(now + 600000).toISOString() }),
    ])
      expect(() => parseManifestEvents(value, now)).toThrow()
  })
})
describe('persistent monitoring history', () => {
  it('deduplicates retries, sorts late arrivals and limits activity to 50', () => {
    const db = store()
    db.saveEvents([event, event], now)
    db.saveEvents(
      Array.from({ length: 60 }, (_, index) => ({
        ...event,
        id: `event-${index}`,
        at: now - 5000 - index,
      })),
      now,
    )
    db.saveEvents([{ ...event, id: 'future', at: now + 1000 }], now)
    const view = db.overview('24h', sources, now)
    expect(view.totals).toEqual({ push: 61, pull: 0 })
    expect(view.activity).toHaveLength(50)
    expect(view.activity[0]).toEqual(event)
    expect(view.sources.lastEventAt).toBe(now)
    expect(view.series).toHaveLength(24)
    expect(db.overview('7d', sources, now).series).toHaveLength(28)
  })
  it('weights duration by operations, preserves missing values and marks sampling gaps', () => {
    const db = store()
    db.saveSample(sample(now - 180000, { operations: 10, seconds: 1, elapsed: 60 }))
    db.saveSample(sample(now - 120000, { operations: 30, seconds: 9, elapsed: 60 }))
    db.saveSample(sample(now - 60000))
    const view = db.overview('24h', sources, now)
    expect(view.series.at(-1)).toMatchObject({
      operationsPerSecond: 40 / 120,
      meanDurationMs: 250,
      gap: true,
    })
    expect(view.series[0]!.operationsPerSecond).toBeNull()
    expect(view.lastSuccessAt).toBe(now - 60000)
    expect(db.overview('24h', { ...sources, events: false }, now).totals).toBeNull()
  })
  it('persists schema and history across reopen, isolates upstreams and cleans all sources', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crateview-monitoring-'))
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
    const path = join(dir, 'history.sqlite')
    const first = new MonitoringStore(path, 'one', now - retentionMs - 100)
    first.saveEvents([event], now)
    first.saveSample(sample(now - retentionMs - 1))
    first.close()
    const reopened = store('one', path)
    expect(reopened.overview('24h', sources, now).totals?.push).toBe(1)
    expect(reopened.db.prepare('PRAGMA user_version').get()!.user_version).toBe(1)
    expect(store('two', path).overview('24h', sources, now).activity).toEqual([])
    reopened.cleanup(now + retentionMs)
    expect(reopened.overview('24h', sources, now + retentionMs).totals?.push).toBe(0)
    expect(reopened.db.prepare('SELECT COUNT(*) AS n FROM samples').get()!.n).toBe(0)
  })
  it('rejects newer database versions and rolls back failed event batches', () => {
    const db = store()
    db.db.exec(
      "CREATE TRIGGER reject_event BEFORE INSERT ON events WHEN NEW.id = 'reject' BEGIN SELECT RAISE(FAIL, 'failure'); END",
    )
    expect(() => db.saveEvents([event, { ...event, id: 'reject' }], now)).toThrow()
    expect(db.overview('24h', sources, now).activity).toEqual([])
    const dir = mkdtempSync(join(tmpdir(), 'crateview-schema-'))
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
    const path = join(dir, 'new.sqlite')
    const raw = new DatabaseSync(path)
    raw.exec('PRAGMA user_version=2')
    raw.close()
    expect(() => new MonitoringStore(path, 'one')).toThrow('Unsupported')
  })
})
describe('background collector', () => {
  const config = {
    registryUpstream: 'http://registry:5000',
    monitoringEnabled: true,
    monitoringMetricsUrl: 'http://registry:5001/metrics',
    monitoringMetricsToken: 'metrics-only',
    monitoringWebhookSecret: 'events-only',
    monitoringDatabasePath: ':memory:',
  }
  it('probes without user credentials, treats 401 as reachable and never overlaps', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    let resolve!: (response: Response) => void
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) =>
      String(url).includes('/metrics')
        ? new Response(metrics())
        : new Promise<Response>((done) => {
            resolve = done
          }),
    )
    vi.stubGlobal('fetch', fetcher)
    const service = new MonitoringService(config)
    cleanup.push(() => service.stop())
    const first = service.collect()
    await service.collect()
    expect(fetcher).toHaveBeenCalledTimes(2)
    resolve(new Response('', { status: 401 }))
    await first
    expect(service.overview('24h').latest).toMatchObject({
      reachable: true,
      authRequired: true,
      storage: null,
    })
    expect(fetcher.mock.calls[0]![1]).not.toHaveProperty('headers')
    expect(fetcher.mock.calls[1]![1]?.headers).toEqual({ Authorization: 'Bearer metrics-only' })
    vi.setSystemTime(now + 60000)
    fetcher.mockImplementation(
      async (url) => new Response(String(url).includes('/metrics') ? metrics(20, 3) : ''),
    )
    await service.collect()
    expect(service.overview('24h').latest?.storage).toEqual({
      operations: 10,
      seconds: 1,
      elapsed: 60,
    })
    vi.setSystemTime(now + 120000)
    fetcher.mockImplementation(
      async (url) =>
        new Response(
          String(url).includes('/metrics')
            ? metrics(200, 30) + 'process_start_time_seconds 12345\n'
            : '',
        ),
    )
    await service.collect()
    expect(service.overview('24h').latest?.storage).toBeNull()
  })
  it('surfaces storage failure and recovers, leaves failed metrics null', async () => {
    const service = new MonitoringService(config)
    cleanup.push(() => service.stop())
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private-url-and-token')))
    await service.collect()
    expect(service.overview('24h').latest).toMatchObject({
      reachable: false,
      storage: null,
      metricsError: 'metricsFailed',
    })
    const save = vi.spyOn(service.store!, 'saveSample').mockImplementation(() => {
      throw new Error('disk full')
    })
    await service.collect()
    expect(service.overview('24h').sources.collectorError).toBe('databaseFailed')
    save.mockRestore()
    await service.collect()
    expect(service.overview('24h').sources.collectorError).toBeNull()
  })
  it('does not collect when disabled; starts a background timer when enabled', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockResolvedValue(new Response(''))
    vi.stubGlobal('fetch', fetcher)
    const off = new MonitoringService({ ...config, monitoringEnabled: false })
    off.start()
    await off.collect()
    expect(fetcher).not.toHaveBeenCalled()
    off.stop()
    const on = new MonitoringService({ ...config, monitoringMetricsUrl: '' })
    cleanup.push(() => on.stop())
    on.start()
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
