import { registrySession, upstreamOrigin } from '../../utils/registry'
export default defineEventHandler(async (event) => {
  const session = await registrySession(event)
  const headers = session.data.authorization
    ? { Authorization: session.data.authorization }
    : undefined
  const response = await fetch(upstreamOrigin(event) + '/v2/', {
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  })
  const challenge = response.headers.get('www-authenticate') || ''
  if (response.status !== 401 && !response.ok)
    throw createError({
      statusCode: 502,
      statusMessage: `Registry unavailable (${response.status})`,
    })
  if (response.status === 401 && session.data.authorization) await session.clear()
  return {
    auth: response.status === 401,
    authType: /^Basic /i.test(challenge)
      ? 'basic'
      : response.status === 401
        ? 'unsupported'
        : 'none',
    user: response.ok ? session.data.username || '' : '',
    deleteEnabled:
      useRuntimeConfig(event).registryDeleteEnabled === true ||
      String(useRuntimeConfig(event).registryDeleteEnabled) === 'true',
  }
})
