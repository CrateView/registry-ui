import MarkdownIt from 'markdown-it'
import { describe, expect, it } from 'vitest'
import { getCodeHighlighter, highlightCode, plainCode } from '../app/utils/highlighting'

const highlighter = await getCodeHighlighter()

describe('syntax highlighting', () => {
  it('reuses the highlighter', () => {
    expect(getCodeHighlighter()).toBe(getCodeHighlighter())
  })
  it('distinguishes JSON keys, strings and literals in dark mode', () => {
    const { tokens } = highlighter.codeToTokens('{"name":"crateview","size":2,"enabled":true}', {
      lang: 'json',
      theme: 'one-dark-pro',
    })
    const color = (content: string) =>
      tokens.flat().find((token) => token.content === content)?.color

    expect(color('"name"')).toBe('#E06C75')
    expect(color('"crateview"')).toBe('#98C379')
    expect(color('2')).toBe('#D19A66')
    expect(color('true')).toBe('#D19A66')
    expect(highlightCode(highlighter, '{}', 'json')).toContain('github-light one-dark-pro')
  })
  for (const [language, code] of [
    ['json', '{"name": "crateview", "enabled": true}'],
    ['sh', 'docker pull example.com/team/image:latest'],
    ['yaml', 'services:\n  registry: {}'],
    ['dockerfile', 'FROM alpine:latest'],
    ['dotenv', 'NUXT_REGISTRY_UPSTREAM=https://example.com'],
    ['js', 'const enabled = true'],
    ['ts', 'const enabled: boolean = true'],
    ['html', '<div>Hello</div>'],
    ['css', 'body { color: red; }'],
    ['sql', 'SELECT * FROM images'],
    ['md', '# Heading'],
  ]) {
    it(`highlights ${language} with both color palettes`, () => {
      const html = highlightCode(highlighter, code!, language)
      expect(html).toContain('--shiki-light:')
      expect(html).toContain('--shiki-dark:')
      expect(html).toContain('<code>')
    })
  }
  it('escapes untrusted text and falls back for missing or unknown languages', () => {
    const code = '<script>alert("x")</script> & text'
    for (const language of ['', 'unknown', 'constructor', '__proto__']) {
      const html = highlightCode(highlighter, code, language)
      expect(html).toBe(plainCode(code))
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
      expect(html).toContain('&amp;')
    }
    expect(highlightCode(highlighter, code, 'html')).not.toContain('<script>')
  })
  it('preserves empty input, whitespace and long lines', () => {
    for (const code of ['', '  leading\n\ntrailing  \n', 'x'.repeat(10000)]) {
      const html = highlightCode(highlighter, code, 'bash')
      expect(html.replace(/<[^>]*>/g, '')).toBe(code)
    }
  })
})

it('highlights Markdown fences without enabling raw HTML or unsafe links', () => {
  const parser = new MarkdownIt({
    html: false,
    linkify: true,
    highlight: (code, language) => highlightCode(highlighter, code, language),
  })
  const html = parser.render(
    '```json\n{"enabled": true}\n```\n<script>alert(1)</script>\n[bad](javascript:alert(1))\n\n`inline`',
  )
  expect(html).toContain('--shiki-light:')
  expect(html).toContain('&lt;script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('href="javascript:')
  expect(html).toContain('<code>inline</code>')
})
