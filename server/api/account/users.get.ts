import { accountRequest, requireUserAdministration } from '../../utils/accounts'
import { userListSchema } from '../../../shared/validation'
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await requireUserAdministration(event)
  const response = userListSchema.safeParse(await accountRequest(event, 'users/list'))
  if (!response.success)
    throw createError({ statusCode: 502, statusMessage: 'Invalid account service response' })
  return response.data
})
