import { monitoringService } from '../utils/monitoring'
export default defineNitroPlugin((nitroApp) => {
  const service = monitoringService()
  service.start()
  nitroApp.hooks.hook('close', () => {
    service.stop()
  })
})
