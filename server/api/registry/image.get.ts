import { imageQuerySchema } from '../../../shared/validation'
import { validated } from '../../utils/validation'
import {
  readImage,
  repositoryPath,
  referencePath,
  paginatedList,
  registryFetch,
  mapLimit,
} from '../../utils/registry'
import { accountMode, accountRequest } from '../../utils/accounts'
export default defineEventHandler(async (event) => {
  const { name, reference } = validated(imageQuerySchema, getQuery(event))
  const image = await readImage(event, name, reference)
  let aliases: string[] = []
  const enabled = useRuntimeConfig(event).registryDeleteEnabled
  let canDelete = enabled === true || String(enabled) === 'true'
  if (canDelete && accountMode(event) === 'token') {
    const access = await accountRequest<{ actions: string[] }>(event, 'access', {
      repository: name,
    })
    canDelete = access.actions.includes('delete')
  }
  if (canDelete) {
    const tags = await paginatedList(event, `/v2/${repositoryPath(name)}/tags/list`, 'tags')
    const matches = await mapLimit(tags, async (tag) => {
      const response = await registryFetch(
        event,
        `/v2/${repositoryPath(name)}/manifests/${referencePath(tag)}`,
        { method: 'HEAD' },
      )
      return response.headers.get('docker-content-digest') === image.Digest ? tag : ''
    })
    aliases = matches.filter(Boolean)
  }
  return {
    ...image,
    AffectedTags: aliases,
    IsDeletable: canDelete,
  }
})
