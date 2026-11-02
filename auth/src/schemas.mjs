import { z } from 'zod'

export const repositoryPattern =
  /^[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*)*$/
export const repositorySchema = z.string().min(1).max(255).regex(repositoryPattern)
export const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
export const referenceSchema = z.union([digestSchema, z.string().regex(/^[\w][\w.-]{0,127}$/)])
export const usernameSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/, 'Invalid username')
export const grantSchema = z.strictObject({
  pattern: z
    .string()
    .max(257)
    .refine(
      (value) => value === '*' || repositorySchema.safeParse(value.replace(/\/\*$/, '')).success,
    ),
  role: z.enum(['reader', 'writer', 'manager']),
})
export const permissionsSchema = z.strictObject({
  version: z.literal(1),
  users: z.record(usernameSchema, z.array(grantSchema)),
})
const messages = {
  fieldRequired: 'This field is required.',
  usernameInvalid:
    'Use 1–128 letters, digits, dots, underscores or hyphens; start with a letter or digit.',
  loginUsernameInvalid: 'Invalid username.',
  passwordRequirements: 'At least 12 characters, at most 72 UTF-8 bytes.',
  passwordInvalid: 'Password must contain no NUL characters and at most 72 UTF-8 bytes.',
  passwordMismatch: 'Passwords do not match.',
  searchInvalid: 'Enter at most 512 characters without control characters.',
}
const hasControlCharacters = (value) =>
  [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
/** @param {(key: string) => string} [message] */
export function createAccountSchemas(message = (key) => messages[key] || key) {
  const required = () =>
    z.string({ error: message('fieldRequired') }).min(1, message('fieldRequired'))
  const currentPassword = required().refine(
    (value) => !value.includes('\0') && new TextEncoder().encode(value).length <= 72,
    message('passwordInvalid'),
  )
  const password = required()
    .min(12, message('passwordRequirements'))
    .refine(
      (value) => !value.includes('\0') && new TextEncoder().encode(value).length <= 72,
      message('passwordRequirements'),
    )
  const username = required().regex(
    /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/,
    message('usernameInvalid'),
  )
  const login = z.strictObject({
    username: required()
      .max(256, message('loginUsernameInvalid'))
      .refine(
        (value) => !value.includes(':') && !hasControlCharacters(value),
        message('loginUsernameInvalid'),
      ),
    password: currentPassword,
  })
  const createUser = z.strictObject({ username, password })
  const passwordChange = z.strictObject({ currentPassword, password })
  const createUserForm = createUser
    .extend({ confirmation: required() })
    .refine((value) => value.password === value.confirmation, {
      path: ['confirmation'],
      message: message('passwordMismatch'),
    })
  const passwordChangeForm = passwordChange
    .extend({ confirmation: required() })
    .refine((value) => value.password === value.confirmation, {
      path: ['confirmation'],
      message: message('passwordMismatch'),
    })
  const search = z.strictObject({
    search: z
      .string()
      .max(512, message('searchInvalid'))
      .refine((value) => !hasControlCharacters(value), message('searchInvalid')),
  })
  return { login, createUser, createUserForm, passwordChange, passwordChangeForm, password, search }
}
export const accountSchemas = createAccountSchemas()
export const scopesSchema = z.array(z.string().max(1024)).max(100)
const authorization = z.string().min(1).max(8192)
export const internalSchemas = {
  '/internal/login': z.strictObject({ authorization }),
  '/internal/users/list': z.strictObject({ authorization }),
  '/internal/users': accountSchemas.createUser.extend({ authorization }),
  '/internal/users/password': accountSchemas.createUser.extend({ authorization }),
  '/internal/users/delete': z.strictObject({ authorization, username: usernameSchema }),
  '/internal/password': accountSchemas.passwordChange.extend({ authorization }),
  '/internal/filter': z.strictObject({
    authorization,
    repositories: z.array(repositorySchema).max(1000),
  }),
  '/internal/access': z.strictObject({ authorization, repository: repositorySchema }),
  '/internal/token': z.strictObject({
    authorization,
    scopes: scopesSchema.default([]),
    catalog: z.boolean().default(false),
  }),
}
export const userListSchema = z.strictObject({
  users: z.array(
    z.strictObject({ username: usernameSchema, grants: z.array(grantSchema).optional() }),
  ),
})
