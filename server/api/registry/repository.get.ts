import { paginatedList, repositoryPath, mapLimit, readImage } from '../../utils/registry'
export default defineEventHandler(async (event) => {
  const name = String(getQuery(event).name || '')
  const tags = await paginatedList(event, `/v2/${repositoryPath(name)}/tags/list`, 'tags')
  const summaryOnly = getQuery(event).summary === 'true'
  const selected = summaryOnly
    ? [tags.includes('latest') ? 'latest' : tags.toSorted()[0]].filter(
        (tag): tag is string => !!tag,
      )
    : tags
  const images = await mapLimit(selected, (tag) => readImage(event, name, tag))
  const unique = new Map(
    images.flatMap((image) =>
      image.Manifests.map(
        (manifest) =>
          [`${manifest.Platform.Os}/${manifest.Platform.Arch}`, manifest.Platform] as const,
      ),
    ),
  )
  return {
    Summary: {
      Name: name,
      TagCount: tags.length,
      Platforms: [...unique.values()],
      RepresentativeImage: images[0],
      Size: String(
        [...new Map(images.map((image) => [image.Digest, image])).values()].reduce(
          (sum, image) => sum + Number(image.Size),
          0,
        ),
      ),
    },
    Images: images,
  }
})
