// Run after npm run build. Uses an isolated Distribution container and temporary DB.
import { hashSync } from 'bcryptjs';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const dir = mkdtempSync(join(tmpdir(), 'crateview-monitoring-integration-'));
const name = `crateview-monitoring-${randomUUID()}`;
const secret = randomUUID();
const portServer = createServer();
await new Promise((resolve) => portServer.listen(0, '127.0.0.1', resolve));
const appPort = portServer.address().port;
await new Promise((resolve) => portServer.close(resolve));
const base = `http://127.0.0.1:${appPort}`;
let app;
let logs = '';
let containerStarted = false;
const credentials = `Basic ${Buffer.from('developer:test-password').toString('base64')}`;
const mediaType = 'application/vnd.oci.image.manifest.v1+json';
const digest = (data) => 'sha256:' + createHash('sha256').update(data).digest('hex');
async function until(operation, message, limit = 20000) {
  const end = Date.now() + limit;
  while (Date.now() < end) {
    try {
      const result = await operation();
      if (result) return result;
    } catch {
      /* Wait for readiness. */
    }
    await delay(250);
  }
  throw new Error(`${message}\n${logs}`);
}
async function stopApp() {
  if (!app || app.exitCode !== null) return;
  const child = app;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await exited;
  app = undefined;
}
function startApp(extra = {}) {
  app = spawn(process.execPath, ['.output/server/index.mjs'], {
    env: {
      ...process.env,
      HOST: '0.0.0.0',
      PORT: String(appPort),
      NUXT_SESSION_PASSWORD: 'test-only-session-password-at-least-32-characters',
      ...extra,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [app.stdout, app.stderr])
    stream.on('data', (data) => {
      logs = (logs + data).slice(-12000);
    });
}
try {
  writeFileSync(join(dir, 'htpasswd'), `developer:${hashSync('test-password', 4)}\n`);
  writeFileSync(
    join(dir, 'config.yml'),
    `version: 0.1
storage:
  filesystem:
    rootdirectory: /var/lib/registry
auth:
  htpasswd:
    realm: Registry
    path: /fixture/htpasswd
http:
  addr: :5000
  debug:
    addr: :5001
    prometheus:
      enabled: true
      path: /metrics
notifications:
  endpoints:
    - name: crateview
      url: http://host.docker.internal:${appPort}/api/monitoring/events
      headers:
        Authorization: ["Bearer ${secret}"]
      timeout: 5s
      threshold: 5
      backoff: 1s
`,
  );
  execFileSync(
    'docker',
    [
      'run',
      '-d',
      '--rm',
      '--name',
      name,
      '--add-host',
      'host.docker.internal:host-gateway',
      '-p',
      '127.0.0.1::5000',
      '-p',
      '127.0.0.1::5001',
      '--tmpfs',
      '/var/lib/registry',
      '-v',
      `${dir}:/fixture:ro`,
      '-e',
      'OTEL_TRACES_EXPORTER=none',
      'registry:3.1.2',
      '/fixture/config.yml',
    ],
    { stdio: 'pipe' },
  );
  containerStarted = true;
  const ports = JSON.parse(
    execFileSync('docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', name], {
      encoding: 'utf8',
    }),
  );
  const upstream = `http://127.0.0.1:${ports['5000/tcp'][0].HostPort}`;
  const metricsUrl = `http://127.0.0.1:${ports['5001/tcp'][0].HostPort}/metrics`;
  await until(async () => (await fetch(`${upstream}/v2/`)).status === 401, 'Registry unavailable');
  const config = {
    NUXT_REGISTRY_UPSTREAM: upstream,
    NUXT_MONITORING_ENABLED: 'true',
    NUXT_MONITORING_METRICS_URL: metricsUrl,
    NUXT_MONITORING_WEBHOOK_SECRET: secret,
    NUXT_MONITORING_DATABASE_PATH: join(dir, 'monitoring.sqlite'),
  };
  startApp(config);
  await until(async () => (await fetch(`${base}/api/registry/status`)).ok, 'Application unavailable');
  assert.equal((await fetch(`${base}/api/monitoring/overview?range=24h`)).status, 401);
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'developer', password: 'test-password' }),
  });
  assert.equal(login.status, 200);
  let cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');

  assert.equal(
    (
      await fetch(`${base}/api/monitoring/overview?range=bad`, {
        headers: { Authorization: credentials },
      })
    ).status,
    400,
  );
  assert.equal((await fetch(`${base}/api/monitoring/events`, { method: 'POST', body: '{}' })).status, 401);
  const notificationHeaders = {
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/vnd.docker.distribution.events.v2+json',
  };
  assert.equal(
    (
      await fetch(`${base}/api/monitoring/events`, {
        method: 'POST',
        headers: notificationHeaders,
        body: 'not-json',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(`${base}/api/monitoring/events`, {
        method: 'POST',
        headers: notificationHeaders,
        body: 'x'.repeat(1048577),
      })
    ).status,
    413,
  );
  const chunkedBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(1048577));
      controller.close();
    },
  });
  assert.equal(
    (
      await fetch(`${base}/api/monitoring/events`, {
        method: 'POST',
        headers: notificationHeaders,
        body: chunkedBody,
        duplex: 'half',
      })
    ).status,
    413,
  );
  const repository = 'monitoring/integration';
  const configBlob = JSON.stringify({ architecture: 'amd64', os: 'linux', config: {} });
  const blobDigest = digest(configBlob);
  const upload = await fetch(`${upstream}/v2/${repository}/blobs/uploads/`, {
    method: 'POST',
    headers: { Authorization: credentials },
  });
  assert.equal(upload.status, 202);
  const location = new URL(upload.headers.get('location'), upstream);
  location.searchParams.set('digest', blobDigest);
  assert.equal(
    (
      await fetch(location, {
        method: 'PUT',
        headers: { Authorization: credentials, 'Content-Type': 'application/octet-stream' },
        body: configBlob,
      })
    ).status,
    201,
  );
  const manifest = JSON.stringify({
    schemaVersion: 2,
    mediaType,
    config: {
      mediaType: 'application/vnd.oci.image.config.v1+json',
      digest: blobDigest,
      size: Buffer.byteLength(configBlob),
    },
    layers: [],
  });
  assert.equal(
    (
      await fetch(`${upstream}/v2/${repository}/manifests/latest`, {
        method: 'PUT',
        headers: { Authorization: credentials, 'Content-Type': mediaType },
        body: manifest,
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await fetch(`${upstream}/v2/${repository}/manifests/latest`, {
        headers: { Authorization: credentials, Accept: mediaType },
      })
    ).status,
    200,
  );
  const getOverview = async () => {
    const response = await fetch(`${base}/api/monitoring/overview?range=24h`, {
      headers: { Cookie: cookie },
    });
    assert.equal(response.status, 200);
    const updated = response.headers.getSetCookie();
    if (updated.length) cookie = updated.map((value) => value.split(';')[0]).join('; ');
    return response.json();
  };
  const view = await until(async () => {
    const result = await getOverview();
    return (
      result.activity.some((e) => e.action === 'push') && result.activity.some((e) => e.action === 'pull') && result
    );
  }, 'Distribution notifications not received');
  assert.equal(view.latest.reachable, true);
  assert.equal(view.latest.authRequired, true);
  assert.equal(view.sources.collectorError, null);
  const repeated = view.activity.find((e) => e.action === 'push');
  const envelope = JSON.stringify({
    events: [
      {
        id: repeated.id,
        timestamp: new Date(repeated.at).toISOString(),
        action: repeated.action,
        target: { mediaType, repository, tag: 'latest', digest: repeated.digest },
      },
    ],
  });
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await fetch(`${base}/api/monitoring/events`, {
          method: 'POST',
          headers: notificationHeaders,
          body: envelope,
        })
      ).status,
      204,
    );
  assert.equal((await getOverview()).totals.push, view.totals.push);
  assert.match(await (await fetch(metricsUrl)).text(), /registry_storage_action_seconds_count/);
  console.log('Push/pull delivery and API boundaries passed; waiting for stable storage counter samples.');
  // Newly appearing action series establish a fresh baseline before a valid delta.
  await until(async () => (await getOverview()).latest.storage !== null, 'Second storage sample missing', 135000);
  await stopApp();
  startApp(config);
  await until(async () => (await fetch(`${base}/api/registry/status`)).ok, 'Restart unavailable');
  assert.equal((await getOverview()).totals.push, view.totals.push);
  await stopApp();
  startApp({ ...config, NUXT_MONITORING_DATABASE_PATH: '/dev/null/unwritable.sqlite' });
  await until(async () => (await fetch(`${base}/api/registry/status`)).ok, 'Failure-mode startup unavailable');
  assert.equal((await getOverview()).sources.collectorError, 'databaseFailed');
  assert.equal(
    (
      await fetch(`${base}/api/monitoring/events`, {
        method: 'POST',
        headers: notificationHeaders,
        body: envelope,
      })
    ).status,
    503,
  );
  // Existing authenticated sessions can inspect an outage; new sessions cannot.
  execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
  containerStarted = false;
  assert.equal((await fetch(`${base}/api/registry/status`, { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await fetch(`${base}/api/registry/status`)).status, 502);
  assert.equal((await fetch(`${base}/api/monitoring/overview`, { headers: { Cookie: cookie } })).status, 200);
  assert.notEqual((await fetch(`${base}/api/monitoring/overview`)).status, 200);
  await stopApp();
  startApp({ ...config, NUXT_MONITORING_ENABLED: 'false' });
  await until(async () => (await fetch(`${base}/`)).ok, 'Disabled startup unavailable');
  assert.equal((await fetch(`${base}/api/monitoring/overview`)).status, 404);
  assert.equal(
    (
      await fetch(`${base}/api/monitoring/events`, {
        method: 'POST',
        headers: notificationHeaders,
        body: envelope,
      })
    ).status,
    404,
  );
  console.log(
    'Distribution integration passed: authentication, real push/pull notifications, deduplication, storage counters, restart persistence, write failure, disabled APIs.',
  );
} finally {
  await stopApp();
  if (containerStarted) execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
  rmSync(dir, { recursive: true, force: true });
}
