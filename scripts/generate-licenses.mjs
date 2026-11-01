import { readFile, readdir, realpath, mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

async function optional(operation) {
  try {
    return await operation()
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) return undefined
    throw error
  }
}

function licenseName(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(licenseName).filter(Boolean).join(' OR ')
  return value?.type || ''
}

function projectUrl(metadata) {
  const repository = metadata.repository?.url || metadata.repository
  for (const candidate of [metadata.homepage, repository]) {
    if (typeof candidate !== 'string') continue
    try {
      const url = new URL(candidate.replace(/^git\+/, '').replace(/\.git$/, ''))
      if (['https:', 'http:'].includes(url.protocol)) return url.href
    } catch {
      // Invalid and non-web URLs are not exposed as project links.
    }
  }
  return ''
}

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const inside = (root, path) => {
  const local = relative(root, path)
  return local !== '..' && !local.startsWith('../') && !isAbsolute(local)
}

async function licenseFiles(directory, license) {
  const files = new Set()
  const documentName =
    /^(?:third[ _-]?party[ _-]?)?(?:licen[cs]es?|copying|copyright|notices?)(?:text)?(?:[._-]|$)/i
  async function scan(folder, includeAll = false) {
    for (const entry of (await optional(() => readdir(folder, { withFileTypes: true }))) || []) {
      const path = resolve(folder, entry.name)
      if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.'))
        await scan(path, includeAll || documentName.test(entry.name))
      else if (entry.isFile() && (includeAll || documentName.test(entry.name))) files.add(path)
    }
  }
  await scan(directory)
  const referenced = license.match(/^SEE LICEN[CS]E IN (.+)$/i)?.[1]
  if (referenced) files.add(resolve(directory, referenced))
  const root = await optional(() => realpath(directory))
  const documents = []
  for (const path of [...files].sort(compare)) {
    const actual = await optional(() => realpath(path))
    if (!root || !actual || !inside(root, actual)) continue
    const text = await optional(() => readFile(actual, 'utf8'))
    if (text !== undefined) documents.push({ file: relative(directory, path), text })
  }
  return documents
}

export async function collectLicenses(root) {
  const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'))
  if (!lock.packages) throw new Error('A package-lock.json with a packages map is required')
  const packages = new Map()
  for (const [path, entry] of Object.entries(lock.packages).sort(([a], [b]) => compare(a, b))) {
    if (!path.includes('node_modules/')) continue
    const locked = entry.link ? lock.packages[entry.resolved] : entry
    if (!locked?.version) throw new Error(`Missing locked version: ${path}`)
    const directory = resolve(root, entry.link ? entry.resolved : path)
    if (!inside(root, directory)) throw new Error(`Package path escapes project: ${path}`)
    const source = await optional(() => readFile(resolve(directory, 'package.json'), 'utf8'))
    const installed = source ? JSON.parse(source) : {}
    // Ignore stale installations: the lockfile describes the version being shipped.
    const metadata = installed.version === locked.version ? installed : {}
    const name = locked.name || metadata.name || path.split('node_modules/').at(-1)
    const license =
      licenseName(locked.license) || licenseName(metadata.license || metadata.licenses)
    const documents = metadata.version ? await licenseFiles(directory, license) : []
    const key = `${name}@${locked.version}`
    const existing = packages.get(key)
    if (existing) {
      for (const document of documents) {
        if (
          !existing.documents.some(
            (item) => item.file === document.file && item.text === document.text,
          )
        )
          existing.documents.push(document)
      }
      existing.license ||= license
      existing.url ||= projectUrl(metadata)
    } else {
      packages.set(key, {
        name,
        version: locked.version,
        license,
        url: projectUrl(metadata),
        documents,
      })
    }
  }
  return [...packages.values()].sort(
    (a, b) => compare(a.name, b.name) || compare(a.version, b.version),
  )
}

export async function generateLicenses(root) {
  const packages = await collectLicenses(root)
  const destination = resolve(root, 'public/dependency-licenses.json')
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, JSON.stringify(packages) + '\n')
  return packages
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const packages = await generateLicenses(fileURLToPath(new URL('..', import.meta.url)))
  console.log(`Generated licenses for ${packages.length} dependency versions`)
}
