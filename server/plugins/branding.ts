import { initializeBranding } from '../utils/branding'

export default defineNitroPlugin(() => {
  initializeBranding(useRuntimeConfig())
})
