import { hashSync } from 'bcryptjs';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('.dev/distribution-test');
await mkdir(root, { recursive: true });
await writeFile(`${root}/htpasswd`, `developer:${hashSync('test-password', 4)}\n`, { mode: 0o600 });
const registry = spawn(
  'docker',
  [
    'run',
    '--rm',
    '--name',
    'registry-ui-test',
    '--publish',
    '127.0.0.1:5001:5000',
    '--tmpfs',
    '/var/lib/registry',
    '--mount',
    `type=bind,source=${root}/htpasswd,target=/auth/htpasswd,readonly`,
    '--env',
    'REGISTRY_AUTH=htpasswd',
    '--env',
    'REGISTRY_AUTH_HTPASSWD_REALM=Registry',
    '--env',
    'REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd',
    '--env',
    'REGISTRY_STORAGE_DELETE_ENABLED=true',
    '--env',
    'OTEL_TRACES_EXPORTER=none',
    'registry:3.1.2',
  ],
  { stdio: 'inherit' },
);
const app = spawn(process.execPath, ['.output/server/index.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '3001',
    NUXT_REGISTRY_UPSTREAM: 'http://127.0.0.1:5001',
    NUXT_REGISTRY_DELETE_ENABLED: 'true',
    NUXT_PUBLIC_BRAND_NAME: 'Acme Containers',
    NUXT_PUBLIC_THEME_PRIMARY: 'blue',
  },
});
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  app.kill('SIGTERM');
  try {
    execFileSync('docker', ['stop', '--time', '1', 'registry-ui-test'], { stdio: 'ignore' });
  } catch {
    /* The container may already have exited. */
  }
  registry.kill('SIGTERM');
  process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
for (const child of [registry, app]) {
  child.on('error', (error) => {
    console.error(error);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code || 1);
  });
}
