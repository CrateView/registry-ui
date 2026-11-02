import { z } from 'zod';
import { supportedLocales } from './locales';

export const themePreferenceSchema = z.enum(['system', 'light', 'dark']);
export const localePreferenceSchema = z.enum(supportedLocales.map((locale) => locale.code));
