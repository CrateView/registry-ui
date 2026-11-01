import {
  readImage,
  repositoryPath,
  referencePath,
  paginatedList,
  registryFetch,
  mapLimit,
} from '../../utils/registry'
export default defineEventHandler(async (event) => {
  const name = String(getQuery(event).name || '')
  const reference = String(getQuery(event).reference || '')
  const image = await readImage(event, name, reference)
  let aliases: string[] = []
  const enabled = useRuntimeConfig(event).registryDeleteEnabled
  if (enabled === true || String(enabled) === 'true') {
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
    IsDeletable: enabled === true || String(enabled) === 'true',
  }
})
