import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ManifestEvent, MonitoringOverview, MonitoringSample } from '../../shared/monitoring';

export const retentionMs = 30 * 86400000;
export class MonitoringStore {
  readonly db: DatabaseSync;
  constructor(
    path: string,
    readonly source: string,
    now = Date.now(),
  ) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    try {
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
      const version = this.db.prepare('PRAGMA user_version').get()!.user_version as number;
      if (version > 1) throw new Error('Unsupported monitoring database version');
      if (version === 0)
        this.db.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE sources (source TEXT PRIMARY KEY, started INTEGER NOT NULL);
        CREATE TABLE samples (source TEXT NOT NULL, at INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(source, at));
        CREATE TABLE events (source TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL, received INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(source, id));
        CREATE INDEX event_time ON events(source, at);
        PRAGMA user_version=1;
        COMMIT;
      `);
      this.db.prepare('INSERT OR IGNORE INTO sources VALUES (?, ?)').run(source, now);
      this.cleanup(now);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  saveSample(sample: MonitoringSample) {
    this.db
      .prepare('INSERT OR REPLACE INTO samples VALUES (?, ?, ?)')
      .run(this.source, sample.at, JSON.stringify(sample));
  }
  saveEvents(events: ManifestEvent[], now = Date.now()) {
    const insert = this.db.prepare('INSERT OR IGNORE INTO events VALUES (?, ?, ?, ?, ?)');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const event of events) {
        if (event.at >= now - retentionMs) insert.run(this.source, event.id, event.at, now, JSON.stringify(event));
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  cleanup(now = Date.now()) {
    this.db.prepare('DELETE FROM samples WHERE at < ?').run(now - retentionMs);
    this.db.prepare('DELETE FROM events WHERE at < ?').run(now - retentionMs);
  }
  overview(range: '24h' | '7d', sources: MonitoringOverview['sources'], now = Date.now()): MonitoringOverview {
    const step = range === '24h' ? 3600000 : 6 * 3600000;
    const since = now - (range === '24h' ? 86400000 : 7 * 86400000);
    const samples = this.db
      .prepare('SELECT payload FROM samples WHERE source = ? AND at >= ? AND at <= ? ORDER BY at')
      .all(this.source, since, now)
      .map((row) => JSON.parse(row.payload as string) as MonitoringSample);
    const buckets = this.db
      .prepare(
        `SELECT CAST((at - ?) / ? AS INTEGER) AS bucket,
        json_extract(payload, '$.action') AS action, COUNT(*) AS count
        FROM events WHERE source = ? AND at >= ? AND at < ? GROUP BY bucket, action`,
      )
      .all(since, step, this.source, since, now);
    const activity = this.db
      .prepare('SELECT payload FROM events WHERE source = ? AND at >= ? AND at < ? ORDER BY at DESC, id LIMIT 50')
      .all(this.source, since, now)
      .map((row) => JSON.parse(row.payload as string) as ManifestEvent);
    const latestRow = this.db
      .prepare('SELECT payload FROM samples WHERE source = ? ORDER BY at DESC LIMIT 1')
      .get(this.source);
    const latest = latestRow ? (JSON.parse(latestRow.payload as string) as MonitoringSample) : null;
    const success = this.db
      .prepare("SELECT MAX(at) AS at FROM samples WHERE source = ? AND json_extract(payload, '$.reachable') = 1")
      .get(this.source)!;
    const lastEvent = this.db.prepare('SELECT MAX(received) AS at FROM events WHERE source = ?').get(this.source)!;
    const startedAt = this.db.prepare('SELECT started FROM sources WHERE source = ?').get(this.source)!
      .started as number;
    const totals = sources.events ? { push: 0, pull: 0 } : null;
    for (const row of buckets) if (totals) totals[row.action as 'push' | 'pull'] += row.count as number;
    const series: MonitoringOverview['series'] = [];
    for (let at = since; at < now; at += step) {
      const end = Math.min(at + step, now);
      const inBucket = samples.filter((sample) => sample.at >= at && sample.at < end);
      const bucket = Math.floor((at - since) / step);
      const observed = (action: 'push' | 'pull') =>
        (buckets.find((row) => row.bucket === bucket && row.action === action)?.count as number | undefined) ?? 0;
      const storage = inBucket.flatMap((sample) => (sample.storage ? [sample.storage] : []));
      const count = storage.reduce((sum, value) => sum + value.operations, 0);
      const seconds = storage.reduce((sum, value) => sum + value.seconds, 0);
      const elapsed = storage.reduce((sum, value) => sum + value.elapsed, 0);
      const stamps = [Math.max(at, startedAt), ...inBucket.map((sample) => sample.at), end];
      const gap =
        at < startedAt ||
        inBucket.some((s) => !s.reachable || (sources.metrics && !s.storage)) ||
        stamps.some((value, index) => index > 0 && value - stamps[index - 1]! > 90000);
      series.push({
        at,
        push: sources.events && end > startedAt ? observed('push') : null,
        pull: sources.events && end > startedAt ? observed('pull') : null,
        operationsPerSecond: elapsed ? count / elapsed : null,
        meanDurationMs: count ? (seconds / count) * 1000 : null,
        gap,
      });
    }
    return {
      startedAt,
      lastSuccessAt: success.at as number | null,
      latest,
      sources: { ...sources, lastEventAt: lastEvent.at as number | null },
      totals,
      activity,
      series,
    };
  }
  close() {
    this.db.close();
  }
}
