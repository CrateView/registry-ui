import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export function validateReceipt(receipt, tag, registryRevision) {
  if (
    receipt.schema !== 1 ||
    receipt.tag !== tag ||
    receipt.registryRevision !== registryRevision ||
    !/^[a-f0-9]{40}$/.test(receipt.docsRevision)
  )
    throw new Error('Conflicting documentation promotion receipt')
  return receipt
}
export async function requestPromotion(tag) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag))
    throw new Error('Expected stable release tag')
  const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' }).trim()
  const revision = execFileSync('git', ['rev-list', '-n', '1', tag], { encoding: 'utf8' }).trim()
  const release = JSON.parse(gh(['release', 'view', tag, '--json', 'isDraft,isPrerelease,assets']))
  if (release.isDraft || release.isPrerelease) throw new Error('Cannot promote a preview release')
  const directory = await mkdtemp(join(tmpdir(), 'crateview-docs-request-'))
  try {
    const file = join(directory, 'docs-promotion.json')
    if (release.assets.some((asset) => asset.name === 'docs-promotion.json')) {
      gh(['release', 'download', tag, '--pattern', 'docs-promotion.json', '--dir', directory])
      validateReceipt(JSON.parse(await readFile(file, 'utf8')), tag, revision)
    } else {
      const docsRevision = execFileSync(
        'git',
        ['ls-remote', 'https://github.com/crateview/docs.git', 'refs/heads/main'],
        { encoding: 'utf8' },
      ).split(/\s/)[0]
      const receipt = validateReceipt(
        { schema: 1, tag, registryRevision: revision, docsRevision },
        tag,
        revision,
      )
      await writeFile(file, JSON.stringify(receipt, null, 2) + '\n')
      gh(['release', 'upload', tag, file]) // Never clobber a pinned request on retry.
    }
    const response = await fetch(
      'https://api.github.com/repos/crateview/website/actions/workflows/promote-docs.yml/dispatches',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.DOCS_PROMOTION_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main', inputs: { tag } }),
        signal: AbortSignal.timeout(30000),
      },
    )
    if (!response.ok)
      throw new Error(
        `Docs dispatch failed (${response.status}); receipt is durable, rerun Release or wait for reconciliation`,
      )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await requestPromotion(process.argv[2])
