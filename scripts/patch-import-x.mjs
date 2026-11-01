// minimatch 11 fixes GHSA-g3hv-75wg-m249 but removes makeRe.
// import-x only needs test(), so preserve its rule using the safe matcher API.
// Remove when eslint-plugin-import-x supports minimatch 11 natively.
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
const require = createRequire(import.meta.url)
const root = dirname(require.resolve('eslint-plugin-import-x/package.json'))
const path = join(root, 'lib/rules/no-internal-modules.js')
const source = await readFile(path, 'utf8')
const before = "import { makeRe } from 'minimatch';"
const after =
  "import { minimatch } from 'minimatch';\nconst makeRe = (pattern) => ({ test: (path) => minimatch(path, pattern) });"
if (source.includes(before)) await writeFile(path, source.replace(before, after))
else if (!source.includes(after)) throw new Error('Review import-x minimatch compatibility patch')
