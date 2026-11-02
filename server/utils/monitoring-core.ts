import { timingSafeEqual } from 'node:crypto';
import type { ManifestEvent, StorageCounters } from '../../shared/monitoring';

export function enabled(value: unknown) {
  return value === true || value === 'true';
}
export function validBearer(header: string | undefined, secret: string) {
  if (!secret || !header) return false;
  const actual = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
// Distribution exposes one histogram per action/driver. Keep each series separate
// so a restarted or disappeared series cannot be hidden by another growing series.
export function parseStorageMetrics(text: string): Map<string, StorageCounters> {
  const series = new Map<string, Partial<StorageCounters>>();
  for (const line of text.split('\n')) {
    const match = line.match(/^registry_storage_action_seconds_(count|sum)(\{[^}]*\})?\s+(\S+)(?:\s+\S+)?\s*$/);
    if (!match) continue;
    const value = Number(match[3]);
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid storage counter');
    const labels = match[2] || '';
    const entries = [...labels.matchAll(/(\w+)="((?:\\.|[^"\\])*)"/g)]
      .map((entry) => [entry[1]!, entry[2]!] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    const key = JSON.stringify(entries);
    const item = series.get(key) || {};
    item[match[1] === 'count' ? 'count' : 'seconds'] = value;
    series.set(key, item);
  }
  if (!series.size || [...series.values()].some((s) => s.count === undefined || s.seconds === undefined))
    throw new Error('Storage metrics unavailable');
  return series as Map<string, StorageCounters>;
}
export function parseProcessStart(text: string): number | null {
  const match = text.match(/^process_start_time_seconds\s+(\S+)(?:\s+\S+)?\s*$/m);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid process start time');
  return value;
}
export function storageDelta(
  previous: Map<string, StorageCounters> | null,
  current: Map<string, StorageCounters>,
  elapsed: number,
) {
  if (!previous || elapsed <= 0 || elapsed > 90 || previous.size !== current.size) return null;
  let operations = 0;
  let seconds = 0;
  for (const [key, value] of current) {
    const before = previous.get(key);
    if (!before || value.count < before.count || value.seconds < before.seconds) return null;
    operations += value.count - before.count;
    seconds += value.seconds - before.seconds;
  }
  return { operations, seconds, elapsed };
}
const manifests = new Set([
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
]);
export function parseManifestEvents(payload: unknown, now = Date.now()): ManifestEvent[] {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('events' in payload) ||
    !Array.isArray(payload.events) ||
    payload.events.length > 1000
  )
    throw new Error('Invalid event envelope');
  const result: ManifestEvent[] = [];
  for (const event of payload.events) {
    if (
      !event ||
      typeof event !== 'object' ||
      typeof event.action !== 'string' ||
      !event.target ||
      typeof event.target !== 'object'
    )
      throw new Error('Invalid event');
    if (!['push', 'pull'].includes(event.action) || !manifests.has(event.target.mediaType)) continue;
    const at = typeof event.timestamp === 'string' ? Date.parse(event.timestamp) : NaN;
    if (
      typeof event.id !== 'string' ||
      !event.id ||
      event.id.length > 256 ||
      !Number.isFinite(at) ||
      at > now + 300000 ||
      typeof event.target.repository !== 'string' ||
      !/^[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*)*$/.test(
        event.target.repository,
      ) ||
      typeof event.target.digest !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(event.target.digest) ||
      (event.target.tag !== undefined &&
        (typeof event.target.tag !== 'string' || !/^[\w][\w.-]{0,127}$/.test(event.target.tag)))
    )
      throw new Error('Invalid manifest event');
    result.push({
      id: event.id,
      at,
      action: event.action,
      repository: event.target.repository,
      digest: event.target.digest,
      tag: event.target.tag ?? null,
    });
  }
  return result;
}
