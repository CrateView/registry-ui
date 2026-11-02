import { getRequestHeader, type H3Event } from 'h3'
import { registrySession, upstreamOrigin } from './registry'

export interface AccountIdentity {
  username: string
  mode: 'htpasswd' | 'token'
  globalRead: boolean
}
export function accountMode(event: H3Event) {
  const mode = useRuntimeConfig(event).authMode
  return mode === 'htpasswd' || mode === 'token' ? mode : 'off'
}
export function canCreateUser(allowed: string, username: string) {
  return (
    Boolean(username) &&
    allowed
      .split(',')
      .map((value) => value.trim())
      .some((value) => value === '*' || value === username)
  )
}
export function managedChallenge(event: H3Event, challenge: string) {
  const config = useRuntimeConfig(event)
  if (!config.authServiceUrl || !config.authServiceSecret) return false
  if (accountMode(event) === 'htpasswd') return /^Basic\s/i.test(challenge)
  if (accountMode(event) !== 'token' || !config.authTokenRealm || !/^Bearer\s/i.test(challenge))
    return false
  return /\brealm="([^"]+)"/i.exec(challenge)?.[1] === config.authTokenRealm
}
export async function requireManagedRegistry(event: H3Event) {
  const response = await fetch(upstreamOrigin(event) + '/v2/', {
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  })
  await response.body?.cancel()
  if (
    response.status !== 401 ||
    !managedChallenge(event, response.headers.get('www-authenticate') || '')
  )
    throw createError({
      statusCode: 409,
      statusMessage: 'Registry authentication does not match account service configuration',
    })
}
export async function accountRequest<T>(
  event: H3Event,
  path: string,
  body: Record<string, unknown> = {},
  authorization?: string,
): Promise<T> {
  const config = useRuntimeConfig(event)
  if (accountMode(event) === 'off' || !config.authServiceUrl || !config.authServiceSecret)
    throw createError({ statusCode: 404, statusMessage: 'User management disabled' })
  const url = new URL(config.authServiceUrl)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw createError({ statusCode: 500, statusMessage: 'Invalid account service URL' })
  const credentials = authorization ?? (await registrySession(event)).data.authorization
  if (!credentials) throw createError({ statusCode: 401, statusMessage: 'Sign-in required' })
  let response: Response
  try {
    response = await fetch(url.origin + '/internal/' + path, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.authServiceSecret}`,
      },
      body: JSON.stringify({ ...body, authorization: credentials }),
    })
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Account service unavailable' })
  }
  if (!response.ok) {
    if (response.status === 401) await (await registrySession(event)).clear()
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    throw createError({
      statusCode: response.status,
      statusMessage: payload.error || 'Account service request failed',
    })
  }
  return response.json() as Promise<T>
}
export async function accountIdentity(event: H3Event, authorization?: string) {
  const identity = await accountRequest<AccountIdentity>(event, 'login', {}, authorization)
  if (identity.mode !== accountMode(event))
    throw createError({ statusCode: 409, statusMessage: 'Account service mode mismatch' })
  return identity
}
export async function requireUserAdministration(event: H3Event) {
  await requireManagedRegistry(event)
  const identity = await accountIdentity(event)
  const session = await registrySession(event)
  if (
    identity.username !== session.data.username ||
    !canCreateUser(useRuntimeConfig(event).userCreationAllowedUsers, identity.username)
  )
    throw createError({ statusCode: 403, statusMessage: 'User administration not allowed' })
  return identity
}
export function scopeForPath(path: string, method = 'GET') {
  const pathname = new URL(path, 'http://registry.internal').pathname
  const match = /^\/v2\/(.+)\/(?:manifests|blobs|tags|referrers)(?:\/|$)/.exec(
    decodeURIComponent(pathname),
  )
  if (!match) return []
  const action = method === 'DELETE' ? 'delete' : ['GET', 'HEAD'].includes(method) ? 'pull' : 'push'
  const scopes = [`repository:${match[1]}:${action}`]
  const from = new URL(path, 'http://registry.internal').searchParams.get('from')
  if (from) scopes.push(`repository:${from}:pull`)
  return scopes
}
export async function registryAuthorization(
  event: H3Event,
  path: string,
  method = 'GET',
  catalog = false,
) {
  const explicit = getRequestHeader(event, 'authorization')
  // Docker handles the public Bearer challenge itself; never exchange or elevate client credentials.
  if (explicit) return explicit
  const credentials = (await registrySession(event)).data.authorization
  if (accountMode(event) !== 'token' || !credentials) return credentials
  const scopes = scopeForPath(path, method)
  const cache = (event.context.accountTokens ||= new Map<string, string>()) as Map<string, string>
  const key = JSON.stringify({ scopes, catalog })
  const cached = cache.get(key)
  if (cached) return cached
  const result = await accountRequest<{ token: string }>(event, 'token', {
    scopes,
    catalog,
  })
  const authorization = `Bearer ${result.token}`
  cache.set(key, authorization)
  return authorization
}
