const accents = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
]
const neutrals = ['slate', 'gray', 'zinc', 'neutral', 'stone']
export function resolveTheme(
  base: { primary: string; neutral: string; radius: string; fontFamily: string },
  overrides: {
    themePrimary?: string
    themeNeutral?: string
    themeRadius?: string
    themeFontFamily?: string
  },
) {
  const primary = overrides.themePrimary || base.primary
  const neutral = overrides.themeNeutral || base.neutral
  const radius = overrides.themeRadius || base.radius
  const fontFamily = overrides.themeFontFamily || base.fontFamily
  if (!accents.includes(primary)) throw new Error(`Invalid theme primary: ${primary}`)
  if (!neutrals.includes(neutral)) throw new Error(`Invalid theme neutral: ${neutral}`)
  if (!/^\d*\.?\d+(rem|px)$/.test(radius)) throw new Error(`Invalid theme radius: ${radius}`)
  if (/[;{}<>]/.test(fontFamily)) throw new Error('Invalid theme font family')
  return { primary, neutral, radius, fontFamily }
}
export function safeUrl(value?: string) {
  if (!value) return ''
  if (value.startsWith('/') && !value.startsWith('//')) return value
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}
