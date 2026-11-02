import { sameOrigin } from '../../utils/registry'
import { accountRequest, requireUserAdministration } from '../../utils/accounts'
import { validated } from '../../utils/validation'
import { accountSchemas } from '../../../shared/validation'
export default defineEventHandler(async (event) => {
  sameOrigin(event)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await requireUserAdministration(event)
  const body = validated(accountSchemas.createUser, await readBody(event))
  return accountRequest(event, 'users', body)
})
