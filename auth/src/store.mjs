import { mkdir, readFile, rename, rm, open } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { compare, hash } from 'bcryptjs'
import { accountSchemas, usernameSchema, permissionsSchema, grantSchema } from './schemas.mjs'
export { repositoryPattern } from './schemas.mjs'

export class Failure extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
export const roles = {
  reader: ['pull'],
  writer: ['pull', 'push'],
  manager: ['pull', 'push', 'delete'],
}
const dummyHash = '$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
export function validUsername(value) {
  if (!usernameSchema.safeParse(value).success) throw new Failure(400, 'Invalid username')
  return value
}
function validPassword(value) {
  if (!accountSchemas.password.safeParse(value).success)
    throw new Failure(400, 'Password must have at least 12 characters and at most 72 UTF-8 bytes')
}
function validGrant(grant) {
  return grantSchema.safeParse(grant).success
}
export function actionsFor(grants, repository) {
  return [
    ...new Set(
      grants
        .filter(
          ({ pattern }) =>
            pattern === '*' ||
            pattern === repository ||
            (pattern.endsWith('/*') && repository.startsWith(pattern.slice(0, -1))),
        )
        .flatMap(({ role }) => roles[role]),
    ),
  ]
}
export class Store {
  constructor(directory) {
    this.directory = directory
  }
  async read(name, fallback) {
    try {
      return await readFile(join(this.directory, name), 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') return fallback
      throw error
    }
  }
  async accounts() {
    const raw = await this.read('htpasswd', '')
    const entries = new Map()
    for (const line of raw.split('\n').filter((line) => line && !line.startsWith('#'))) {
      const colon = line.indexOf(':')
      const username = line.slice(0, colon)
      const digest = line.slice(colon + 1).replace(/\r$/, '')
      validUsername(username)
      if (colon < 1 || !/^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(digest) || entries.has(username))
        throw new Failure(503, 'Invalid htpasswd file')
      entries.set(username, digest)
    }
    return { raw, entries }
  }
  async authenticate(username, password) {
    return (await this.identity(username, password)).username
  }
  async identity(username, password, withGrants = false) {
    const { entries } = await this.accounts()
    const digest = entries.get(username)
    // Bind permissions to the account generation whose password is checked.
    // A concurrent delete/recreate must not issue old credentials with new grants.
    const grants = withGrants ? await this.grants(username) : []
    const usable = typeof password === 'string' && Buffer.byteLength(password) <= 72
    const matches = await compare(usable ? password : '', digest || dummyHash)
    if (!digest || !usable || !matches || (await this.accounts()).entries.get(username) !== digest)
      throw new Failure(401, 'Invalid credentials')
    return { username, grants }
  }
  async permissions() {
    const data = JSON.parse(await this.read('permissions.json', '{"version":1,"users":{}}'))
    if (!permissionsSchema.safeParse(data).success)
      throw new Failure(503, 'Invalid permissions file')
    return data
  }
  async grants(username) {
    const { users } = await this.permissions()
    return Object.hasOwn(users, username) ? users[username] : []
  }
  async atomic(name, value) {
    const temp = join(this.directory, `.${name}.${randomUUID()}`)
    try {
      const file = await open(temp, 'wx', 0o600)
      try {
        await file.writeFile(value)
        await file.sync()
      } finally {
        await file.close()
      }
      await rename(temp, join(this.directory, name))
      const directory = await open(this.directory, 'r')
      try {
        await directory.sync()
      } finally {
        await directory.close()
      }
    } finally {
      await rm(temp, { force: true })
    }
  }
  async locked(operation) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const lock = join(this.directory, '.writer.lock')
    const deadline = Date.now() + 5000
    for (;;) {
      try {
        await mkdir(lock, { mode: 0o700 })
        break
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
        if (Date.now() >= deadline) throw new Failure(503, 'Account store locked; retry later')
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
    }
    try {
      return await operation()
    } finally {
      await rm(lock, { recursive: true, force: true })
    }
  }
  async setPassword(username, password, { create = false, currentPassword } = {}) {
    validUsername(username)
    validPassword(password)
    return this.locked(async () => {
      const { raw, entries } = await this.accounts()
      if (create && entries.has(username)) throw new Failure(409, 'Username already exists')
      if (!create && !entries.has(username)) throw new Failure(404, 'User not found')
      if (currentPassword !== undefined) await this.authenticate(username, currentPassword)
      // New accounts must never inherit grants left behind for an older account.
      if (create) {
        const permissions = await this.permissions()
        delete permissions.users[username]
        await this.atomic('permissions.json', JSON.stringify(permissions, null, 2) + '\n')
      }
      const digest = await hash(password, 12)
      const lines = raw.split('\n').filter((line) => line && !line.startsWith(`${username}:`))
      lines.push(`${username}:${digest}`)
      await this.atomic('htpasswd', lines.join('\n') + '\n')
    })
  }
  async remove(username) {
    validUsername(username)
    return this.locked(async () => {
      const { raw, entries } = await this.accounts()
      if (!entries.has(username)) throw new Failure(404, 'User not found')
      // Remove authentication first so a partial failure cannot grant access.
      await this.atomic(
        'htpasswd',
        raw
          .split('\n')
          .filter((line) => line && !line.startsWith(`${username}:`))
          .join('\n') + '\n',
      )
      const permissions = await this.permissions()
      delete permissions.users[username]
      await this.atomic('permissions.json', JSON.stringify(permissions, null, 2) + '\n')
    })
  }
  async grant(username, pattern, role) {
    validUsername(username)
    if (!validGrant({ pattern, role })) throw new Failure(400, 'Invalid grant')
    return this.locked(async () => {
      if (!(await this.accounts()).entries.has(username)) throw new Failure(404, 'User not found')
      const permissions = await this.permissions()
      const grants = Object.hasOwn(permissions.users, username) ? permissions.users[username] : []
      permissions.users[username] = [
        ...grants.filter((grant) => grant.pattern !== pattern),
        { pattern, role },
      ]
      await this.atomic('permissions.json', JSON.stringify(permissions, null, 2) + '\n')
    })
  }
  async revoke(username, pattern) {
    validUsername(username)
    return this.locked(async () => {
      const permissions = await this.permissions()
      const grants = Object.hasOwn(permissions.users, username) ? permissions.users[username] : []
      permissions.users[username] = grants.filter((grant) => grant.pattern !== pattern)
      await this.atomic('permissions.json', JSON.stringify(permissions, null, 2) + '\n')
    })
  }
}
