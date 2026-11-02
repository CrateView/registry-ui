import { accountSchemas } from '../../../shared/validation'
import { validated } from '../../utils/validation'
import { registrySession, sameOrigin, upstreamOrigin } from '../../utils/registry'
import { accountIdentity, accountMode, requireManagedRegistry } from '../../utils/accounts'
export default defineEventHandler(async (event) => {
  sameOrigin(event)
  const body = validated(accountSchemas.login, await readBody(event))
  const authorization = `Basic ${Buffer.from(`${body.username}:${body.password}`).toString('base64')}`
  if (accountMode(event) === 'token') {
    await requireManagedRegistry(event)
    await accountIdentity(event, authorization)
    const session = await registrySession(event)
    await session.clear()
    await session.update({ username: body.username, authorization })
    return { username: body.username }
  }
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
