export interface StorageCounters {
  count: number;
  seconds: number;
}
export interface MonitoringSample {
  at: number;
  reachable: boolean;
  authRequired: boolean;
  latencyMs: number | null;
  probeError: string | null;
  metricsError: string | null;
  storage: { operations: number; seconds: number; elapsed: number } | null;
}
export interface ManifestEvent {
  id: string;
  at: number;
  action: 'push' | 'pull';
  repository: string;
  tag: string | null;
  digest: string;
}
export interface MonitoringOverview {
  startedAt: number | null;
  lastSuccessAt: number | null;
  latest: MonitoringSample | null;
  sources: {
    metrics: boolean;
    events: boolean;
    lastEventAt: number | null;
    collectorError: string | null;
  };
  totals: { push: number; pull: number } | null;
  activity: ManifestEvent[];
  series: {
    at: number;
    push: number | null;
    pull: number | null;
    operationsPerSecond: number | null;
    meanDurationMs: number | null;
    gap: boolean;
  }[];
}
