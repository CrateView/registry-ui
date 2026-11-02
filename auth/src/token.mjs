import { createPrivateKey, createPublicKey, X509Certificate, sign, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Failure, actionsFor, repositoryPattern } from './store.mjs'
import { scopesSchema } from './schemas.mjs'

export async function signer({ keyPath, certificatePath, issuer, service }) {
  if (!issuer || !service)
    throw new Error('AUTH_ISSUER and AUTH_SERVICE are required in token mode')
  const key = createPrivateKey(await readFile(keyPath))
  const certificate = new X509Certificate(await readFile(certificatePath))
  if (
    Date.parse(certificate.validFrom) > Date.now() ||
    Date.parse(certificate.validTo) <= Date.now()
  )
    throw new Error('Signing certificate is not currently valid')
  if (
    key.asymmetricKeyType !== 'rsa' ||
    key.asymmetricKeyDetails.modulusLength < 2048 ||
    !certificate.publicKey.equals(createPublicKey(key))
  )
    throw new Error('Matching RSA key/certificate (at least 2048 bits) required')
  return (subject, access) => {
    const now = Math.floor(Date.now() / 1000)
    const encode = (data) => Buffer.from(JSON.stringify(data)).toString('base64url')
    const header = encode({ typ: 'JWT', alg: 'RS256', x5c: [certificate.raw.toString('base64')] })
    const payload = encode({
      iss: issuer,
      aud: service,
      sub: subject,
      iat: now,
      nbf: now - 5,
      exp: now + 300,
      jti: randomUUID(),
      access,
    })
    const input = `${header}.${payload}`
    const token = `${input}.${sign('RSA-SHA256', Buffer.from(input), key).toString('base64url')}`
    return {
      token,
      access_token: token,
      expires_in: 300,
      issued_at: new Date(now * 1000).toISOString(),
    }
  }
}
export function scopedAccess(scopes, grants) {
  if (!scopesSchema.safeParse(scopes).success) throw new Failure(400, 'Invalid scopes')
  const result = new Map()
  for (const scope of scopes.flatMap((value) => value.split(' ').filter(Boolean))) {
    const [type, name, actions, extra] = scope.split(':')
    if (extra || !type || !name || !actions) throw new Failure(400, 'Invalid scope')
    if (type !== 'repository' || !repositoryPattern.test(name)) continue
    const allowed = actionsFor(grants, name)
    const granted = actions.split(',').filter((action) => allowed.includes(action))
    const existing = result.get(name) || { type, name, actions: [] }
    existing.actions = [...new Set([...existing.actions, ...granted])]
    result.set(name, existing)
  }
  return [...result.values()]
}
