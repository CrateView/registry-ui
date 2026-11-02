import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { Store, Failure, actionsFor, repositoryPattern } from './store.mjs'
import { signer, scopedAccess } from './token.mjs'
import { internalSchemas } from './schemas.mjs'

function basic(value) {
  if (typeof value !== 'string' || !/^Basic [A-Za-z0-9+/]+={0,2}$/i.test(value))
    throw new Failure(401, 'Invalid credentials')
  const decoded = Buffer.from(value.slice(6), 'base64').toString('utf8')
  const colon = decoded.indexOf(':')
  if (colon < 1) throw new Failure(401, 'Invalid credentials')
  return [decoded.slice(0, colon), decoded.slice(colon + 1)]
}
async function body(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 1024 * 1024) throw new Failure(413, 'Request too large')
    chunks.push(chunk)
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value
  } catch {
    throw new Failure(400, 'Invalid JSON body')
  }
}
export async function authServer(config) {
  if (!['htpasswd', 'token'].includes(config.mode))
    throw new Error('AUTH_MODE must be htpasswd or token')
  if (!config.managementSecret || config.managementSecret.length < 32)
    throw new Error('AUTH_MANAGEMENT_SECRET requires at least 32 characters')
  const store = new Store(config.directory)
  // Validate existing files at startup; never silently replace malformed account data.
  await store.accounts()
  await store.permissions()
  const issue = config.mode === 'token' ? await signer(config) : undefined
  const failures = new Map()
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Content-Type', 'application/json')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    const address = request.socket.remoteAddress
    try {
      const url = new URL(request.url, 'http://auth.internal')
      const internal = url.pathname.startsWith('/internal/')
      if (url.pathname === '/health' && request.method === 'GET') {
        response.end('{"ok":true}')
        return
      }
      if (!internal && !(url.pathname === '/token' && request.method === 'GET' && issue))
        throw new Failure(404, 'Not found')
      if (internal) {
        if (request.method !== 'POST') throw new Failure(405, 'Method not allowed')
        const given = Buffer.from(request.headers.authorization || '')
        const expected = Buffer.from(`Bearer ${config.managementSecret}`)
        if (given.length !== expected.length || !timingSafeEqual(given, expected))
          throw new Failure(401, 'Invalid service credentials')
      }
      const window = failures.get(address)
      if (window && window.expires > Date.now() && window.count >= 30)
        throw new Failure(429, 'Too many failed logins; retry later')
      const schema = internal ? internalSchemas[url.pathname] : undefined
      if (internal && !schema) throw new Failure(404, 'Not found')
      const parsed = internal ? schema.safeParse(await body(request)) : undefined
      if (parsed && !parsed.success)
        throw new Failure(400, parsed.error.issues[0]?.message || 'Invalid request')
      const input = parsed?.data
      const credentials = internal ? input.authorization : request.headers.authorization
      const [username, password] = basic(credentials)
      const { grants } = await store.identity(username, password, config.mode === 'token')
      let output
      if (!internal) {
        if (url.searchParams.get('service') !== config.service)
          throw new Failure(400, 'Invalid token audience')
        // Docker login requests offline_token. Without a refresh token in the
        // response, clients retain Basic credentials and request fresh access tokens.
        output = issue(username, scopedAccess(url.searchParams.getAll('scope'), grants))
      } else if (url.pathname === '/internal/login') {
        output = {
          username,
          mode: config.mode,
          globalRead: grants.some((grant) => grant.pattern === '*'),
        }
      } else if (url.pathname === '/internal/users/list') {
        const users = [...(await store.accounts()).entries.keys()]
          .sort()
          .map((username) => ({ username }))
        output = {
          users:
            config.mode === 'token'
              ? await Promise.all(
                  users.map(async (user) => ({
                    ...user,
                    grants: await store.grants(user.username),
                  })),
                )
              : users,
        }
      } else if (url.pathname === '/internal/password') {
        if (typeof input.currentPassword !== 'string')
          throw new Failure(400, 'Current password required')
        await store.setPassword(username, input.password, {
          currentPassword: input.currentPassword,
        })
        output = { ok: true }
      } else if (url.pathname === '/internal/users') {
        await store.setPassword(input.username, input.password, { create: true })
        output = { username: input.username }
      } else if (url.pathname === '/internal/filter' && issue) {
        if (
          !Array.isArray(input.repositories) ||
          input.repositories.length > 1000 ||
          input.repositories.some(
            (name) => typeof name !== 'string' || !repositoryPattern.test(name),
          )
        )
          throw new Failure(400, 'Invalid repositories')
        output = {
          repositories: input.repositories.filter((name) =>
            actionsFor(grants, name).includes('pull'),
          ),
        }
      } else if (url.pathname === '/internal/access' && issue) {
        if (typeof input.repository !== 'string' || !repositoryPattern.test(input.repository))
          throw new Failure(400, 'Invalid repository')
        output = { actions: actionsFor(grants, input.repository) }
      } else if (url.pathname === '/internal/token' && issue) {
        // Catalog access is reserved for the trusted backend. Never expose this token to a browser.
        const access =
          input.catalog === true
            ? [{ type: 'registry', name: 'catalog', actions: ['*'] }]
            : scopedAccess(input.scopes || [], grants)
        output = issue(username, access)
      } else throw new Failure(404, 'Not found')
      response.end(JSON.stringify(output))
    } catch (error) {
      const status = error instanceof Failure ? error.status : 503
      if (status === 401) {
        const now = Date.now()
        const window = failures.get(address)
        if (!window || window.expires < now) {
          if (failures.size >= 10000) failures.delete(failures.keys().next().value)
          failures.set(address, { expires: now + 60000, count: 1 })
        } else window.count++
        response.setHeader('WWW-Authenticate', 'Basic realm="Crateview"')
      }
      response.statusCode = status
      response.end(
        JSON.stringify({
          error: error instanceof Failure ? error.message : 'Account service unavailable',
        }),
      )
    }
  })
  server.requestTimeout = 15000
  server.headersTimeout = 10000
  return server
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await authServer({
    mode: process.env.AUTH_MODE || 'htpasswd',
    directory: process.env.AUTH_DATA_DIR || '/data',
    managementSecret: process.env.AUTH_MANAGEMENT_SECRET,
    issuer: process.env.AUTH_ISSUER,
    service: process.env.AUTH_SERVICE,
    keyPath: process.env.AUTH_KEY_PATH,
    certificatePath: process.env.AUTH_CERTIFICATE_PATH,
  })
  server.listen(Number(process.env.PORT || 8080), process.env.HOST || '127.0.0.1')
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close())
}
