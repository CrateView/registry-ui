export const repoPath = (name: string) => `/image/${encodeURIComponent(name)}`
export const imagePath = (name: string, tag: string) =>
  `${repoPath(name)}/tag/${encodeURIComponent(tag)}`
