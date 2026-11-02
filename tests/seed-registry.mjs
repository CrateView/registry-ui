import { createHash } from 'node:crypto';

const source = 'http://127.0.0.1:5000',
  target = 'http://127.0.0.1:5001';
const headers = {
  Authorization: `Basic ${Buffer.from('developer:test-password').toString('base64')}`,
};
const media = 'application/vnd.oci.image.manifest.v1+json';
const hash = (data) => 'sha256:' + createHash('sha256').update(data).digest('hex');
async function check(r) {
  if (!r.ok) throw new Error(`${r.url}: ${r.status} ${await r.text()}`);
  return r;
}
const raw = await (
  await check(await fetch(`${source}/v2/alpine/manifests/latest`, { headers: { Accept: media } }))
).text();
const manifest = JSON.parse(raw);
const rootDigest = hash(raw);
async function blob(repo, data, digest = hash(data)) {
  const upload = await check(await fetch(`${target}/v2/${repo}/blobs/uploads/`, { method: 'POST', headers }));
  const location = new URL(upload.headers.get('location'), target);
  const url = new URL(location.pathname + location.search, target);
  url.searchParams.set('digest', digest);
  await check(
    await fetch(url, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/octet-stream' },
      body: data,
    }),
  );
  return { digest, size: Buffer.byteLength(data) };
}
async function put(repo, reference, document, type = media) {
  const body = typeof document === 'string' ? document : JSON.stringify(document);
  await check(
    await fetch(`${target}/v2/${repo}/manifests/${reference}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': type },
      body,
    }),
  );
  return { digest: hash(body), size: Buffer.byteLength(body), mediaType: type };
}
for (const repo of ['alpine', 'team/image', 'deletable']) {
  for (const descriptor of [manifest.config, ...manifest.layers]) {
    const data = Buffer.from(
      await (await check(await fetch(`${source}/v2/alpine/blobs/${descriptor.digest}`))).arrayBuffer(),
    );
    await blob(repo, data, descriptor.digest);
  }
  await put(repo, 'latest', raw);
  await put(repo, 'v1', raw);
}
const config = await (await fetch(`${source}/v2/alpine/blobs/${manifest.config.digest}`)).json();
config.architecture = 'arm64';
const armConfig = await blob('alpine', JSON.stringify(config));
const armManifest = { ...manifest, config: { ...manifest.config, ...armConfig } };
const arm = await put('alpine', 'arm64', armManifest);
await put(
  'alpine',
  'multi',
  {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests: [
      {
        mediaType: media,
        digest: rootDigest,
        size: Buffer.byteLength(raw),
        platform: { os: 'linux', architecture: 'amd64' },
      },
      { ...arm, platform: { os: 'linux', architecture: 'arm64' } },
    ],
  },
  'application/vnd.oci.image.index.v1+json',
);
const empty = await blob('alpine', '{}');
const sbom = await put('alpine', 'sbom', {
  schemaVersion: 2,
  mediaType: media,
  artifactType: 'application/spdx+json',
  config: { mediaType: 'application/vnd.oci.empty.v1+json', ...empty },
  layers: [],
  subject: { mediaType: media, digest: rootDigest, size: Buffer.byteLength(raw) },
  annotations: { 'org.opencontainers.image.title': 'Fixture SBOM' },
});
await put(
  'alpine',
  rootDigest.replace(':', '-'),
  {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests: [
      {
        ...sbom,
        artifactType: 'application/spdx+json',
        annotations: { 'org.opencontainers.image.title': 'Fixture SBOM' },
      },
    ],
  },
  'application/vnd.oci.image.index.v1+json',
);
console.log('Isolated Distribution registry seeded: namespaces, aliases, multi-platform index and SBOM referrer');
