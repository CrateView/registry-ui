import { createError } from 'h3'
import type { ZodType } from 'zod'

export function validated<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success)
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid request',
      data: {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    })
  return result.data
}
