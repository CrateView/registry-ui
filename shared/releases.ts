export interface Release {
  version: string
  publishedAt: string | null
  markdown: string
  url: string
}

export function stableVersion(tag: string): string | null {
  return /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
    tag,
  )
    ? tag.replace(/^v/, '')
    : null
}

export function compareVersions(a: string, b: string): number {
  const left = a.split('+')[0]!.split('.').map(BigInt)
  const right = b.split('+')[0]!.split('.').map(BigInt)
  for (let i = 0; i < 3; i++) {
    if (left[i]! > right[i]!) return 1
    if (left[i]! < right[i]!) return -1
  }
  return 0
}
