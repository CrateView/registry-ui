import { describe, expect, it } from 'vitest'
import {
  accountSchemas,
  createAccountSchemas,
  userListSchema,
  imageQuerySchema,
  digestQuerySchema,
  repositoryQuerySchema,
  documentQuerySchema,
  monitoringQuerySchema,
} from '../shared/validation'
import { validated } from '../server/utils/validation'

describe('shared account schemas', () => {
  it('allows existing short passwords at login without weakening new account requirements', () => {
    expect(accountSchemas.login.parse({ username: 'admin', password: 'admin' }).password).toBe(
      'admin',
    )
    expect(
      accountSchemas.createUser.safeParse({ username: 'admin', password: 'admin' }).success,
    ).toBe(false)
    for (const body of [
      { username: '', password: 'admin' },
      { username: 'a:b', password: 'admin' },
      { username: 'admin', password: '' },
      { username: ['admin'], password: 'admin' },
    ])
      expect(accountSchemas.login.safeParse(body).success).toBe(false)
  })
  it('rejects invalid names, types, NUL, bcrypt truncation and injected role fields', () => {
    for (const body of [
      { username: '../admin', password: 'valid-password-123' },
      { username: 'admin', password: 123456789012 },
      { username: 'admin', password: 'é'.repeat(37) },
      { username: 'admin', password: 'a'.repeat(73) },
      { username: 'admin', password: 'valid-password\0' },
      { username: 'admin', password: 'valid-password-123', role: 'manager' },
      { username: 'admin', password: 'valid-password-123', grants: [] },
    ])
      expect(accountSchemas.createUser.safeParse(body).success).toBe(false)
    expect(
      accountSchemas.createUser.parse({ username: 'team.user_1', password: 'é'.repeat(36) })
        .password,
    ).toHaveLength(36)
  })
  it('validates confirmation on the right field and preserves password whitespace', () => {
    for (const schema of [accountSchemas.createUserForm, accountSchemas.passwordChangeForm]) {
      const value = {
        username: 'alice',
        currentPassword: 'admin',
        password: 'valid-password-123',
        confirmation: 'different-password',
      }
      const result = schema.safeParse(
        schema === accountSchemas.createUserForm
          ? { username: value.username, password: value.password, confirmation: value.confirmation }
          : {
              currentPassword: value.currentPassword,
              password: value.password,
              confirmation: value.confirmation,
            },
      )
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.issues.some((issue) => issue.path[0] === 'confirmation')).toBe(true)
    }
    expect(
      accountSchemas.passwordChange.parse({
        currentPassword: 'admin',
        password: '  valid-password  ',
      }).password,
    ).toBe('  valid-password  ')
    const localized = createAccountSchemas((key) => `localized:${key}`).createUser.safeParse({
      username: '../bad',
      password: 'valid-password-123',
    })
    expect(localized.success).toBe(false)
    if (!localized.success)
      expect(localized.error.issues[0]?.message).toBe('localized:usernameInvalid')
  })
  it('never accepts password hashes or credentials in user list responses', () => {
    expect(
      userListSchema.safeParse({ users: [{ username: 'alice', hash: '$2b$12$secret' }] }).success,
    ).toBe(false)
    expect(userListSchema.parse({ users: [{ username: 'alice' }] })).toEqual({
      users: [{ username: 'alice' }],
    })
  })
  it('bounds search inputs while allowing empty searches', () => {
    expect(accountSchemas.search.parse({ search: '' }).search).toBe('')
    for (const search of ['x'.repeat(513), 'a\nb', 'a\0b'])
      expect(accountSchemas.search.safeParse({ search }).success).toBe(false)
  })
})

describe('API validation', () => {
  it('rejects repeated parameters, traversal, malformed digests and unknown parameters', () => {
    expect(repositoryQuerySchema.safeParse({ name: ['team/image', 'secret/image'] }).success).toBe(
      false,
    )
    expect(repositoryQuerySchema.safeParse({ name: '../secret' }).success).toBe(false)
    expect(repositoryQuerySchema.safeParse({ name: 'team/image', summary: 'maybe' }).success).toBe(
      false,
    )
    expect(
      imageQuerySchema.safeParse({ name: 'team/image', reference: 'latest', arbitrary: 'x' })
        .success,
    ).toBe(false)
    expect(
      digestQuerySchema.safeParse({ name: 'team/image', digest: 'sha256:short' }).success,
    ).toBe(false)
    expect(
      documentQuerySchema.safeParse({ name: 'team/image', reference: 'latest', kind: 'config' })
        .success,
    ).toBe(false)
    expect(monitoringQuerySchema.safeParse({ range: ['24h', '7d'] }).success).toBe(false)
    expect(monitoringQuerySchema.parse({})).toEqual({ range: '24h' })
  })
  it('returns 400 with field errors without echoing submitted passwords', () => {
    try {
      validated(accountSchemas.createUser, { username: 'alice', password: 'secret' })
      expect.unreachable()
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 400, data: { issues: [{ path: 'password' }] } })
      expect(JSON.stringify(error)).not.toContain('secret')
    }
  })
})
