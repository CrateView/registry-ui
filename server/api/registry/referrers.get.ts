import { digestQuerySchema } from '../../../shared/validation'
import { validated } from '../../utils/validation'
import { registryFetch, repositoryPath, referencePath } from '../../utils/registry'
interface ReferrerIndex {
  manifests?: {
    digest: string
    mediaType?: string
    artifactType?: string
    size?: number
    annotations?: Record<string, string>
  }[]
}
export default defineEventHandler(async (event) => {
  const { name, digest } = validated(digestQuerySchema, getQuery(event))
  const repo = repositoryPath(name)
  let index: ReferrerIndex
  let mode = 'api'
  try {
    index = (await (
      await registryFetch(event, `/v2/${repo}/referrers/${referencePath(digest)}`)
    ).json()) as ReferrerIndex
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode !== 404) throw error
    // OCI Distribution 1.1 fallback: clients maintain an index at the digest-derived tag.
    mode = 'tag'
    try {
      index = (await (
        await registryFetch(event, `/v2/${repo}/manifests/${digest.replace(':', '-')}`)
      ).json()) as ReferrerIndex
    } catch (fallbackError) {
      if ((fallbackError as { statusCode?: number }).statusCode === 404)
        return { supported: true, mode, referrers: [] }
      throw fallbackError
    }
  }
  return {
    supported: true,
    mode,
    referrers: (index.manifests || []).map((entry) => ({
      Digest: entry.digest,
      MediaType: entry.mediaType,
      ArtifactType: entry.artifactType,
      Size: entry.size,
      Annotations: Object.entries(entry.annotations || {}).map(([Key, Value]) => ({ Key, Value })),
    })),
  }
})
