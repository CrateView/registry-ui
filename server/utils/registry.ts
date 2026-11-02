import { createError, getRequestHeader, getRequestURL, useSession, type H3Event } from 'h3';
import { createHash, randomBytes } from 'node:crypto';
import { referenceSchema, repositorySchema } from '../../shared/validation';
import { accountMode, registryAuthorization } from './accounts';

const ephemeralPassword = randomBytes(32).toString('base64');
export const manifestAccept =
  'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json';
export async function registrySession(event: H3Event) {
  return useSession<{ username: string; authorization: string; monitoringAccess: string }>(event, {
    name: 'registry-ui-session',
    password: useRuntimeConfig(event).sessionPassword || ephemeralPassword,
    maxAge: 28800,
    sessionHeader: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: getRequestURL(event).protocol === 'https:',
      path: '/',
    },
  });
}
export function sameOrigin(event: H3Event) {
  const origin = getRequestHeader(event, 'origin');
  if (origin && origin !== getRequestURL(event).origin)
    throw createError({ statusCode: 403, statusMessage: 'Cross-origin request rejected' });
}
export function upstreamOrigin(event: H3Event) {
  const url = new URL(useRuntimeConfig(event).registryUpstream);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw createError({ statusCode: 500, statusMessage: 'Invalid registry upstream' });
  return url.origin;
}
export function repositoryPath(name: unknown) {
  const parsed = repositorySchema.safeParse(name);
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid repository name' });
  return parsed.data.split('/').map(encodeURIComponent).join('/');
}
export function referencePath(reference: unknown) {
  const parsed = referenceSchema.safeParse(reference);
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid tag or digest' });
  return encodeURIComponent(parsed.data);
}
export async function registryFetch(event: H3Event, path: string, options: RequestInit = {}, catalog = false) {
  const session = await registrySession(event);
  const authorization = await registryAuthorization(event, path, options.method || 'GET', catalog);
  const headers = new Headers(options.headers);
  headers.set('Accept', manifestAccept);
  if (authorization) headers.set('Authorization', authorization);
  const response = await fetch(upstreamOrigin(event) + path, {
    ...options,
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    // Distribution also uses 401 for insufficient scope. A valid local identity stays signed in.
    const status =
      response.status === 401 &&
      accountMode(event) === 'token' &&
      session.data.authorization &&
      !getRequestHeader(event, 'authorization')
        ? 403
        : response.status;
    if (status === 401 && session.data.authorization) await session.clear();
    throw createError({
      statusCode: status,
      statusMessage: `Registry request failed (${status})`,
      data: { path, status },
    });
  }
  return response;
}
export async function paginatedList(event: H3Event, path: string, key: 'repositories' | 'tags', catalog = false) {
  const values: string[] = [];
  let next = `${path}${path.includes('?') ? '&' : '?'}n=100`;
  const visited = new Set<string>();
  while (next) {
    if (visited.has(next)) throw createError({ statusCode: 502, statusMessage: 'Registry returned a pagination loop' });
    visited.add(next);
    const response = await registryFetch(event, next, {}, catalog);
    const payload = (await response.json()) as Record<string, string[] | null>;
    values.push(...(payload[key] || []));
    const link = response.headers.get('link')?.match(/<([^>]+)>;\s*rel="?next"?/);
    if (!link) break;
    const url = new URL(link[1]!, upstreamOrigin(event) + next);
    if (url.origin !== upstreamOrigin(event) || url.pathname !== path.split('?')[0])
      throw createError({ statusCode: 502, statusMessage: 'Invalid registry pagination target' });
    next = url.pathname + url.search;
  }
  return [...new Set(values)];
}
export async function mapLimit<T, R>(items: T[], operation: (item: T) => Promise<R>, limit = 4): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const current = index++;
        results[current] = await operation(items[current]!);
      }
    }),
  );
  return results;
}
interface Descriptor {
  digest: string;
  mediaType?: string;
  size?: number;
  platform?: { os?: string; architecture?: string; variant?: string };
  annotations?: Record<string, string>;
  artifactType?: string;
}
interface RegistryManifest {
  mediaType?: string;
  config?: Descriptor;
  layers?: Descriptor[];
  blobs?: Descriptor[];
  manifests?: Descriptor[];
  annotations?: Record<string, string>;
  artifactType?: string;
}
interface ImageConfig {
  created?: string;
  os?: string;
  architecture?: string;
  variant?: string;
  config?: { Labels?: Record<string, string> };
  history?: { created_by?: string; empty_layer?: boolean }[];
}
export async function readImage(event: H3Event, name: string, reference: string) {
  const repo = repositoryPath(name);
  const response = await registryFetch(event, `/v2/${repo}/manifests/${referencePath(reference)}`);
  const raw = await response.text();
  const document = JSON.parse(raw) as RegistryManifest;
  const digest =
    response.headers.get('docker-content-digest') || `sha256:${createHash('sha256').update(raw).digest('hex')}`;
  const descriptors = document.manifests || [{ digest, mediaType: document.mediaType }];
  const manifests = await mapLimit(descriptors, async (descriptor) => {
    const manifest: RegistryManifest = document.manifests
      ? ((await (
          await registryFetch(event, `/v2/${repo}/manifests/${referencePath(descriptor.digest)}`)
        ).json()) as RegistryManifest)
      : document;
    let config: ImageConfig = {};
    if (
      manifest.config &&
      ['application/vnd.oci.image.config.v1+json', 'application/vnd.docker.container.image.v1+json'].includes(
        manifest.config.mediaType || '',
      )
    )
      config = (await (
        await registryFetch(event, `/v2/${repo}/blobs/${referencePath(manifest.config.digest)}`)
      ).json()) as ImageConfig;
    const layers = manifest.layers || manifest.blobs || [];
    let layerIndex = 0;
    return {
      Digest: descriptor.digest,
      ConfigDigest: manifest.config?.digest,
      Platform: {
        Os: descriptor.platform?.os || config.os,
        Arch: descriptor.platform?.architecture || config.architecture,
        Variant: descriptor.platform?.variant || config.variant,
      },
      Size: String(layers.reduce((sum, layer) => sum + (layer.size || 0), 0)),
      LastUpdated: config.created,
      ArtifactType: manifest.artifactType,
      Layers: layers.map((layer) => ({ Digest: layer.digest, Size: layer.size })),
      History: (config.history || []).map((entry) => ({
        Layer: entry.empty_layer ? undefined : { Digest: layers[layerIndex]?.digest, Size: layers[layerIndex++]?.size },
        HistoryDescription: { CreatedBy: entry.created_by, EmptyLayer: entry.empty_layer },
      })),
      labels: { ...(config.config?.Labels || {}), ...manifest.annotations },
    };
  });
  const labels = { ...manifests[0]?.labels, ...document.annotations };
  return {
    RepoName: name,
    Tag: reference.startsWith('sha256:') ? undefined : reference,
    Digest: digest,
    Description: labels['org.opencontainers.image.description'],
    Title: labels['org.opencontainers.image.title'],
    Vendor: labels['org.opencontainers.image.vendor'],
    Licenses: labels['org.opencontainers.image.licenses'],
    Source: labels['org.opencontainers.image.source'],
    Documentation: labels['org.opencontainers.image.documentation'] || labels['org.opencontainers.image.url'],
    LastUpdated: labels['org.opencontainers.image.created'] || manifests[0]?.LastUpdated,
    Size: String(manifests.reduce((sum, manifest) => sum + Number(manifest.Size), 0)),
    MediaType: document.mediaType,
    ArtifactType: document.artifactType,
    Manifests: manifests.map(({ labels: _labels, ...manifest }) => manifest),
  };
}
