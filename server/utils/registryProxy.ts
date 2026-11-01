import { proxyRequest, getRequestHeader, getRequestURL, setResponseHeader, type H3Event } from 'h3'
import { registrySession, upstreamOrigin } from './registry'
export async function registryProxy(event: H3Event) {
  const session = await registrySession(event)
  const authorization = getRequestHeader(event, 'authorization') || session.data.authorization
  const origin = upstreamOrigin(event)
  const publicOrigin = getRequestURL(event).origin
  // Preserve the raw encoded path/query, and pin the upstream origin.
  const options = {
    streamRequest: true,
    fetchOptions: { redirect: 'manual' as const },
    // Nitro's H3 v1 strips Accept by default; OCI media negotiation requires it.
    headers: {
      Accept: getRequestHeader(event, 'accept') || '*/*',
      ...(authorization ? { Authorization: authorization } : {}),
    },
    onResponse(proxyEvent: H3Event, response: Response) {
      const location = response.headers.get('location')
      if (!location) return
      const target = new URL(location, origin)
      // Rewrite only the registry's own redirects, never external blob-storage URLs.
      if (target.origin === origin)
        setResponseHeader(proxyEvent, 'Location', publicOrigin + target.pathname + target.search)
    },
  }
  return proxyRequest(event, origin + event.path, options)
}
