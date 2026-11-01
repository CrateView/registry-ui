import { registrySession, sameOrigin, upstreamOrigin } from '../../utils/registry'
export default defineEventHandler(async (event) => {
  sameOrigin(event)
  const body = await readBody<{ username?: string; password?: string }>(event)
  if (!body.username || !body.password || body.username.includes(':'))
    throw createError({ statusCode: 400, statusMessage: 'Username and password required' })
  const authorization = `Basic ${Buffer.from(`${body.username}:${body.password}`).toString('base64')}`
  const response = await fetch(upstreamOrigin(event) + '/v2/', {
    headers: { Authorization: authorization },
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok)
    throw createError({ statusCode: response.status, statusMessage: 'Registry sign-in failed' })
  const session = await registrySession(event)
  await session.clear()
  await session.update({ username: body.username, authorization })
  return { username: body.username }
})
