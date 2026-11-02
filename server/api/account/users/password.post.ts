import { sameOrigin } from '../../../utils/registry'
import { accountRequest, requireUserAdministration } from '../../../utils/accounts'
import { validated } from '../../../utils/validation'
import { accountSchemas } from '../../../../shared/validation'
export default defineEventHandler(async (event) => {
  sameOrigin(event)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const identity = await requireUserAdministration(event)
  const body = validated(accountSchemas.createUser, await readBody(event))
  if (body.username === identity.username)
    throw createError({ statusCode: 403, statusMessage: 'User administration not allowed' })
  return accountRequest(event, 'users/password', body)
})
