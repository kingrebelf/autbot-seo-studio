import sanitizeHtml from 'sanitize-html'

const ALLOWED = [
  'h1',
  'h2',
  'h3',
  'h4',
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'b',
  'i',
  'a',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'img',
  'br',
  'figure',
  'figcaption',
  'mark',
  'span'
]

/** Clean AI-written HTML: drop code fences, scripts, styles and anything outside the allowed tags. */
export function cleanHtml(raw: string): string {
  let s = raw.trim()
  const fence = s.match(/^```(?:html)?\s*([\s\S]*?)```\s*$/i)
  if (fence) s = fence[1]
  s = s.replace(/^```(?:html)?/i, '').replace(/```$/, '')
  return sanitizeHtml(s, {
    allowedTags: ALLOWED,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'data-image-id'],
      span: ['data-confirm', 'class'],
      mark: ['data-confirm'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'autbot-media'],
    allowedSchemesByTag: { img: ['http', 'https', 'autbot-media', 'data'] }
  }).trim()
}

export function stripTags(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim()
}
