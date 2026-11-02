import { z } from 'zod';
import { digestSchema, referenceSchema, repositorySchema } from '../auth/src/schemas.mjs';

// Pure Zod schemas shared with the independently packaged auth service.
export * from '../auth/src/schemas.mjs';

export const repositoryQuerySchema = z.strictObject({
  name: repositorySchema,
  summary: z.enum(['true', 'false']).optional(),
});
export const imageQuerySchema = z.strictObject({
  name: repositorySchema,
  reference: referenceSchema,
});
export const digestQuerySchema = z.strictObject({ name: repositorySchema, digest: digestSchema });
export const documentQuerySchema = z.discriminatedUnion('kind', [
  z.strictObject({
    name: repositorySchema,
    reference: referenceSchema,
    kind: z.literal('manifest'),
  }),
  z.strictObject({ name: repositorySchema, reference: digestSchema, kind: z.literal('config') }),
]);
export const monitoringQuerySchema = z.strictObject({ range: z.enum(['24h', '7d']).default('24h') });
export const pullDestinationSchema = z
  .string()
  .min(1, 'Path is required')
  .max(1024)
  .regex(/^[a-zA-Z0-9_./-]+$/, 'Use letters, digits, dots, slashes, underscores or hyphens for the destination path.');
