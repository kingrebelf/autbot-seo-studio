import * as cheerio from 'cheerio'
import type { BusinessProfile } from '@shared/types'

export interface SchemaInput {
  type: string
  title: string
  description?: string | null
  url?: string | null
  html: string
  profile: Partial<BusinessProfile>
  siteUrl: string
  image?: string | null
  datePublished?: string | null
  keyword?: string | null
}

/** Questions (headings ending in "?") followed by their answer text. */
export function extractFaq(html: string): { q: string; a: string }[] {
  const $ = cheerio.load(html || '', null, false)
  const out: { q: string; a: string }[] = []
  $('h2,h3,h4').each((_, el) => {
    const q = $(el).text().trim()
    if (!q.endsWith('?')) return
    const parts: string[] = []
    let n = $(el).next()
    while (n.length && !/^h[1-6]$/i.test(n[0].tagName)) {
      const t = n.text().trim()
      if (t) parts.push(t)
      n = n.next()
    }
    if (parts.length) out.push({ q, a: parts.join(' ').slice(0, 1000) })
  })
  return out
}

function howToSteps(html: string): string[] {
  const $ = cheerio.load(html || '', null, false)
  const steps: string[] = []
  $('ol')
    .first()
    .find('li')
    .each((_, li) => {
      const t = $(li).text().trim()
      if (t) steps.push(t)
    })
  return steps
}

/** Build JSON-LD for the piece: Article/BlogPosting, Service, Product, HowTo, FAQPage, LocalBusiness. */
export function buildSchema(i: SchemaInput): Record<string, unknown> {
  const graph: Record<string, unknown>[] = []
  const business = {
    '@type':
      i.profile.serviceArea && !/online|nationwide/i.test(i.profile.serviceArea)
        ? 'LocalBusiness'
        : 'Organization',
    '@id': `${i.siteUrl.replace(/\/$/, '')}/#business`,
    name: i.profile.name || undefined,
    url: i.siteUrl,
    ...(i.profile.serviceArea && !/online|nationwide/i.test(i.profile.serviceArea)
      ? { areaServed: i.profile.serviceArea }
      : {})
  }
  graph.push(business)
  const common = {
    name: i.title,
    headline: i.title,
    description: i.description || undefined,
    url: i.url || undefined,
    image: i.image || undefined
  }
  const t = i.type.toLowerCase()
  if (t.includes('product')) {
    graph.push({
      '@type': 'Product',
      name: i.title,
      description: i.description || undefined,
      image: i.image || undefined,
      brand: { '@id': business['@id'] }
    })
  } else if (t.includes('service') || t.includes('location') || t.includes('landing')) {
    graph.push({
      '@type': 'Service',
      name: i.title,
      description: i.description || undefined,
      serviceType: i.keyword || i.title,
      provider: { '@id': business['@id'] },
      areaServed: i.profile.serviceArea || undefined,
      url: i.url || undefined
    })
  } else if (t.includes('how-to')) {
    const steps = howToSteps(i.html)
    graph.push({
      '@type': 'HowTo',
      name: i.title,
      description: i.description || undefined,
      step: steps.map((s, n) => ({ '@type': 'HowToStep', position: n + 1, text: s }))
    })
    graph.push({
      '@type': 'Article',
      ...common,
      author: { '@id': business['@id'] },
      publisher: { '@id': business['@id'] },
      datePublished: i.datePublished || undefined
    })
  } else {
    graph.push({
      '@type': t.includes('blog') ? 'BlogPosting' : 'Article',
      ...common,
      author: { '@id': business['@id'] },
      publisher: { '@id': business['@id'] },
      datePublished: i.datePublished || undefined
    })
  }
  const faq = extractFaq(i.html)
  if (faq.length)
    graph.push({
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a }
      }))
    })
  return JSON.parse(JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })) as Record<
    string,
    unknown
  >
}
