import { monitoringQuerySchema } from '../../../shared/validation'
import { validated } from '../../utils/validation'
import { monitoringService } from '../../utils/monitoring'
import { registryFetch, registrySession, upstreamOrigin } from '../../utils/registry'
import { accountMode, accountIdentity } from '../../utils/accounts'
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const service = monitoringService()
  if (!service.active) throw createError({ statusCode: 404, statusMessage: 'Monitoring disabled' })
  if (accountMode(event) === 'token' && !(await accountIdentity(event)).globalRead)
    throw createError({ statusCode: 403, statusMessage: 'Registry-wide read access required' })
  const { range } = validated(monitoringQuerySchema, getQuery(event))
  // Remember successful access in the encrypted session so an outage can still
  // be inspected. A fresh session must always authenticate against the upstream.
  const session = await registrySession(event)
  const origin = upstreamOrigin(event)
  try {
    const response = await registryFetch(event, '/v2/')
    await response.body?.cancel()
    if (session.data.monitoringAccess !== origin) await session.update({ monitoringAccess: origin })
  } catch (failure) {
    const code = (failure as { statusCode?: number }).statusCode
    if (code === 401 || code === 403) {
      await session.clear()
      throw failure
    }
    if ((code && code < 500) || session.data.monitoringAccess !== origin) throw failure
  }
  return service.overview(range)
})
