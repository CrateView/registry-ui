import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Use only task-owned containers, volumes, credentials and image tags.
const image = process.argv[2];
if (!image) throw new Error('Usage: node tests/accounts-image-integration.mjs IMAGE');
await mkdir('.dev', { recursive: true });
const root = await mkdtemp(resolve('.dev/accounts-image-'));
const project = `crateview-accounts-image-${process.pid}`;
const password = 'image-fixture-password-123';
const docker = (args, input) =>
  execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const configPath = resolve(root, 'compose.json');
const compose = (args, input) => docker(['compose', '-p', project, '-f', configPath, ...args], input);
const configuration = JSON.parse(
  docker(['compose', '-f', 'compose.yaml', '-f', 'compose.auth.integrated.yaml', 'config', '--format', 'json']),
);
assert.deepEqual(Object.keys(configuration.services).sort(), ['frontend', 'registry']);
for (const service of Object.values(configuration.services))
  for (const port of service.ports || []) port.published = '0';
configuration.name = project;
// Normalized Compose output already contains explicit resource names; changing -p alone is insufficient.
for (const resources of [configuration.volumes, configuration.networks])
  for (const [name, resource] of Object.entries(resources || {})) {
    assert.ok(!resource.external, 'Fixtures must not reference external resources');
    resource.name = `${project}_${name}`;
  }
configuration.services.frontend.image = image;
Object.assign(configuration.services.frontend.environment, {
  NUXT_SESSION_PASSWORD: 'image-fixture-session-secret-with-at-least-32-characters',
  NUXT_USER_CREATION_ALLOWED_USERS: 'admin',
});
await writeFile(configPath, JSON.stringify(configuration));
let imageTag;
const cli = (args, input) =>
  compose(['run', '--rm', '-T', '--no-deps', 'frontend', 'node', '/app/auth/src/cli.mjs', ...args], input);
const pause = () => new Promise((resolve) => setTimeout(resolve, 250));
async function wait(url) {
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.status < 500) return;
    } catch {
      // Containers may still be starting.
    }
    await pause();
  }
  throw new Error(`Startup timed out: ${url}`);
}
async function login(ui, username = 'admin', value = password) {
  const response = await fetch(ui + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ui },
    body: JSON.stringify({ username, password: value }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return response.headers.get('set-cookie').split(';')[0];
}
try {
  cli(['add', 'admin'], password);
  assert.deepEqual(
    JSON.parse(cli(['list'])).map((user) => user.username),
    ['admin'],
  );
  compose(['up', '-d']);
  const address = (service, port) => compose(['port', service, String(port)]);
  let ui = `http://${address('frontend', 3000)}`;
  const registryAddress = address('registry', 5000);
  await wait(ui + '/api/registry/status');
  let cookie = await login(ui);
  const created = await fetch(ui + '/api/account/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ui, Cookie: cookie },
    body: JSON.stringify({ username: 'alice', password }),
  });
  assert.equal(created.status, 200, await created.clone().text());
  cli(['passwd', 'alice'], 'image-replacement-password');
  await login(ui, 'alice', 'image-replacement-password');
  compose(['restart', 'frontend']);
  ui = `http://${address('frontend', 3000)}`;
  await wait(ui + '/api/registry/status');
  cookie = await login(ui);
  const listed = await fetch(ui + '/api/account/users', { headers: { Cookie: cookie } });
  assert.equal(listed.status, 200, await listed.clone().text());
  assert.deepEqual((await listed.json()).users, [{ username: 'admin' }, { username: 'alice' }]);

  const client = resolve(root, 'docker-client');
  await mkdir(client);
  await writeFile(
    resolve(client, 'config.json'),
    JSON.stringify({ auths: { [registryAddress]: { auth: Buffer.from(`admin:${password}`).toString('base64') } } }),
    { mode: 0o600 },
  );
  // Docker treats loopback registries as insecure by default; no daemon configuration changes.
  docker(['--config', client, 'login', registryAddress, '--username', 'admin', '--password-stdin'], password);
  const archive = execFileSync('tar', ['-cf', '-', '--files-from', '/dev/null']);
  imageTag = `${registryAddress}/fixture/accounts-${process.pid}:latest`;
  docker(['import', '-', imageTag], archive);
  docker(['--config', client, 'push', imageTag]);
  docker(['image', 'rm', imageTag]);
  docker(['--config', client, 'pull', imageTag]);

  compose(['stop', 'frontend']);
  // Both registry writes and reads remain available without any account-management process.
  docker(['--config', client, 'push', imageTag]);
  docker(['image', 'rm', imageTag]);
  docker(['--config', client, 'pull', imageTag]);
  console.log(
    'Production image: CLI bootstrap, management, password reload, persistence, Docker login/push/pull and UI-independent access passed',
  );
} finally {
  if (imageTag) {
    try {
      docker(['image', 'rm', imageTag]);
    } catch {
      // A failed pull may leave no local tag.
    }
  }
  try {
    compose(['down', '--volumes', '--remove-orphans']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
