import { enabled } from '../../utils/monitoring-core'
import { registrySession, upstreamOrigin } from '../../utils/registry'
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const session = await registrySession(event)
  const origin = upstreamOrigin(event)
  const monitoringEnabled = enabled(useRuntimeConfig(event).monitoringEnabled)
  const deleteEnabled = enabled(useRuntimeConfig(event).registryDeleteEnabled)
  const headers = session.data.authorization
    ? { Authorization: session.data.authorization }
    : undefined
  let response: Response
  try {
    response = await fetch(origin + '/v2/', {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    if (monitoringEnabled && session.data.monitoringAccess === origin)
      return {
        monitoringEnabled,
        auth: Boolean(session.data.username),
        authType: 'none',
        user: session.data.username || '',
        deleteEnabled,
        probeFailed: true,
      }
    throw createError({ statusCode: 502, statusMessage: 'Registry unavailable' })
  }
  await response.body?.cancel()
  const challenge = response.headers.get('www-authenticate') || ''
  if (response.status >= 500 && monitoringEnabled && session.data.monitoringAccess === origin)
    return {
      monitoringEnabled,
      auth: Boolean(session.data.username),
      authType: 'none',
      user: session.data.username || '',
      deleteEnabled,
      probeFailed: true,
    }
  if (response.status === 403) await session.clear()
  if (response.status !== 401 && !response.ok)
    throw createError({
      statusCode: 502,
      statusMessage: `Registry unavailable (${response.status})`,
    })
  if (response.status === 401 && (session.data.authorization || session.data.monitoringAccess))
    await session.clear()
  if (response.ok && monitoringEnabled && session.data.monitoringAccess !== origin)
    await session.update({ monitoringAccess: origin })
  return {
    monitoringEnabled,
    auth: response.status === 401,
    authType: /^Basic /i.test(challenge)
      ? 'basic'
      : response.status === 401
        ? 'unsupported'
        : 'none',
    user: response.ok ? session.data.username || '' : '',
    deleteEnabled,
  }
})
