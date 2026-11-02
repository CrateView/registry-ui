import { z } from 'zod'
export const themePreferenceSchema = z.enum(['system', 'light', 'dark'])
export const localePreferenceSchema = z.enum(['en', 'de'])
