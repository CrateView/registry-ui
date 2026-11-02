import { getRequestWebStream } from 'h3'
import { monitoringService } from '../../utils/monitoring'
import { parseManifestEvents, validBearer } from '../../utils/monitoring-core'
export default defineEventHandler(async (event) => {
  const service = monitoringService()
  if (!service.active) throw createError({ statusCode: 404, statusMessage: 'Monitoring disabled' })
  if (!validBearer(getHeader(event, 'authorization'), service.config.monitoringWebhookSecret))
    throw createError({ statusCode: 401, statusMessage: 'Invalid notification secret' })
  const limit = 1048576
  if (Number(getHeader(event, 'content-length')) > limit)
    throw createError({ statusCode: 413, statusMessage: 'Notification envelope too large' })
  const stream = getRequestWebStream(event)
  if (!stream) throw createError({ statusCode: 400, statusMessage: 'Notification body required' })
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw createError({ statusCode: 413, statusMessage: 'Notification envelope too large' })
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  let events
  try {
    events = parseManifestEvents(JSON.parse(raw))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid notification envelope' })
  }
  try {
    service.saveEvents(events)
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Monitoring storage unavailable' })
  }
  setResponseStatus(event, 204)
  return null
})
