import * as cheerio from 'cheerio'

export interface Analysis {
  text: string
  wordCount: number
  headings: { level: number; text: string }[]
  paragraphs: string[]
  links: { href: string; text: string; internal: boolean }[]
  images: { src: string; alt: string }[]
  h1Count: number
  first100: string
  confirms: string[]
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function isInternal(href: string, siteUrl: string): boolean {
  if (!href) return false
  if (href.startsWith('/') && !href.startsWith('//')) return true
  if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false
  const h = hostOf(href)
  return Boolean(h) && h === hostOf(siteUrl)
}

export const CONFIRM_RE = /\[CONFIRM:\s*([^\]]*)\]/gi

export function analyze(html: string, siteUrl = ''): Analysis {
  const $ = cheerio.load(html || '', null, false)
  const headings: Analysis['headings'] = []
  $('h1,h2,h3,h4,h5,h6').each((_, el) => {
    headings.push({ level: Number(el.tagName.slice(1)), text: $(el).text().trim() })
  })
  const paragraphs: string[] = []
  $('p,li,blockquote,td').each((_, el) => {
    if (el.tagName === 'p' || $(el).find('p').length === 0) {
      const t = $(el).text().trim()
      if (t) paragraphs.push(t)
    }
  })
  const links: Analysis['links'] = []
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    links.push({ href, text: $(el).text().trim(), internal: isInternal(href, siteUrl) })
  })
  const images: Analysis['images'] = []
  $('img').each((_, el) => {
    images.push({ src: $(el).attr('src') ?? '', alt: ($(el).attr('alt') ?? '').trim() })
  })
  // block-level text joined with spaces so words don't run together
  $('h1,h2,h3,h4,h5,h6,p,li,td,th,blockquote,br,div').each((_, el) => {
    $(el).append(' ')
  })
  const text = $.root().text().replace(/\s+/g, ' ').trim()
  const wordList = text.split(/\s+/).filter(Boolean)
  const confirms = [...html.matchAll(CONFIRM_RE)].map((m) => m[1].trim())
  return {
    text,
    wordCount: wordList.length,
    headings,
    paragraphs,
    links,
    images,
    h1Count: headings.filter((h) => h.level === 1).length,
    first100: wordList.slice(0, 100).join(' '),
    confirms
  }
}

/** Plain text of an HTML string. */
export function htmlToText(html: string): string {
  return analyze(html).text
}
