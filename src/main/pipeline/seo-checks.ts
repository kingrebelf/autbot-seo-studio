import { analyze, type Analysis } from './html'
import {
  containsPhrase,
  countPhrase,
  fleschReadingEase,
  normalize,
  words,
  STOP_WORDS,
  shingles,
  jaccard,
  titleSimilarity
} from './text'
import type { SeoCheckResult, CheckState } from '@shared/types'

/**
 * Deterministic SEO checks (Section 7.6). Pure code, no AI. Every check has a unit test.
 */
export interface ExistingPage {
  url: string
  title?: string | null
  h1?: string | null
  focusKeyword?: string | null
  paragraphs?: string[] | null
}

export interface SeoInput {
  html: string
  title?: string | null
  seoTitle?: string | null
  metaDescription?: string | null
  slug?: string | null
  focusKeyword?: string | null
  targetWords?: number | null
  siteUrl?: string
  pillarUrl?: string | null
  schemaJson?: unknown
  /** Other pages on the site (crawl + other content), excluding this piece. */
  existingPages?: ExistingPage[]
  dismissedConfirms?: boolean
  /** The URL this piece refreshes (Mode D); ignored for cannibalization. */
  refreshOfUrl?: string | null
}

type Check = (i: SeoInput, a: Analysis) => Omit<SeoCheckResult, 'id' | 'label' | 'weight' | 'fixable'>

const r = (state: CheckState, detail: string) => ({ state, detail })

export const checks: { id: string; label: string; weight: number; fixable: boolean; run: Check }[] = [
  {
    id: 'kw_title',
    label: 'Focus keyword in SEO title',
    weight: 8,
    fixable: true,
    run: (i) => {
      if (!i.focusKeyword) return r('fail', 'Set a focus keyword first.')
      return containsPhrase(i.seoTitle ?? '', i.focusKeyword)
        ? r('pass', 'The SEO title contains the focus keyword.')
        : r('fail', `Add "${i.focusKeyword}" to the SEO title.`)
    }
  },
  {
    id: 'title_len',
    label: 'SEO title length',
    weight: 6,
    fixable: true,
    run: (i) => {
      const n = (i.seoTitle ?? '').trim().length
      if (n >= 30 && n <= 60) return r('pass', `${n} characters (30 to 60 is ideal).`)
      return r(n === 0 ? 'fail' : 'warn', `${n} characters. Aim for 30 to 60 so Google shows it in full.`)
    }
  },
  {
    id: 'meta_len',
    label: 'Meta description',
    weight: 8,
    fixable: true,
    run: (i) => {
      const m = (i.metaDescription ?? '').trim()
      const n = m.length
      const hasKw = i.focusKeyword ? containsPhrase(m, i.focusKeyword) : false
      if (!n) return r('fail', 'Write a meta description (120 to 158 characters, with the focus keyword).')
      if (n >= 120 && n <= 158 && hasKw) return r('pass', `${n} characters and includes the keyword.`)
      if (n >= 120 && n <= 158) return r('warn', `${n} characters, but it doesn't include the focus keyword.`)
      return r(
        'warn',
        `${n} characters. Aim for 120 to 158${hasKw ? '' : ', and include the focus keyword'}.`
      )
    }
  },
  {
    id: 'kw_first100',
    label: 'Keyword in first 100 words',
    weight: 8,
    fixable: true,
    run: (i, a) =>
      i.focusKeyword && containsPhrase(a.first100, i.focusKeyword)
        ? r('pass', 'The keyword appears early, where readers and Google expect it.')
        : r('fail', 'Mention the focus keyword in the first 100 words.')
  },
  {
    id: 'kw_h2',
    label: 'Keyword in at least one H2',
    weight: 6,
    fixable: true,
    run: (i, a) =>
      i.focusKeyword && a.headings.some((h) => h.level === 2 && containsPhrase(h.text, i.focusKeyword!))
        ? r('pass', 'At least one H2 heading uses the keyword.')
        : r('fail', 'Use the focus keyword (naturally) in at least one H2 heading.')
  },
  {
    id: 'density',
    label: 'Keyword density',
    weight: 6,
    fixable: true,
    run: (i, a) => {
      if (!i.focusKeyword || !a.wordCount) return r('warn', 'No keyword or no text yet.')
      const d = (countPhrase(a.text, i.focusKeyword) * words(i.focusKeyword).length * 100) / a.wordCount
      const pct = Math.round(d * 100) / 100
      if (d >= 0.5 && d <= 2.5) return r('pass', `${pct}% (0.5% to 2.5% is natural).`)
      return r(
        'warn',
        d < 0.5
          ? `${pct}%. Use the keyword a little more.`
          : `${pct}%. That's too often; it can read as keyword stuffing.`
      )
    }
  },
  {
    id: 'one_h1',
    label: 'One H1 only',
    weight: 5,
    fixable: true,
    run: (i, a) => {
      // The piece's title becomes the H1 on the page; the body should have no other H1.
      const total = a.h1Count + (i.title ? 1 : 0)
      if (total === 1) return r('pass', 'Exactly one H1.')
      if (total === 0) return r('fail', 'Add a title (it becomes the H1).')
      return r('fail', `Found ${total} H1 headings. Change the extra ones in the body to H2.`)
    }
  },
  {
    id: 'heading_order',
    label: 'Heading order',
    weight: 4,
    fixable: true,
    run: (i, a) => {
      let prev = i.title ? 1 : 0
      for (const h of a.headings) {
        if (prev && h.level > prev + 1)
          return r('fail', `"${h.text}" jumps from H${prev} to H${h.level}. Don't skip levels.`)
        prev = h.level
      }
      return r('pass', 'Headings go in order without skipping levels.')
    }
  },
  {
    id: 'slug',
    label: 'URL slug',
    weight: 5,
    fixable: true,
    run: (i) => {
      const s = (i.slug ?? '').trim()
      if (!s) return r('fail', 'Set a URL slug.')
      const problems: string[] = []
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s))
        problems.push('use only lowercase letters, numbers and hyphens')
      if (s.length > 75 || s.split('-').length > 8) problems.push('make it shorter')
      const kwTokens = words(i.focusKeyword ?? '').filter((w) => !STOP_WORDS.has(w))
      if (kwTokens.length && !kwTokens.every((t) => s.split('-').includes(t)))
        problems.push('include the focus keyword')
      if (s.split('-').filter((w) => STOP_WORDS.has(w)).length > 1)
        problems.push('remove stop words like "the", "and", "of"')
      return problems.length
        ? r('warn', `Slug: ${problems.join('; ')}.`)
        : r('pass', 'Short, lowercase, hyphenated and contains the keyword.')
    }
  },
  {
    id: 'word_count',
    label: 'Word count vs target',
    weight: 5,
    fixable: true,
    run: (i, a) => {
      if (!i.targetWords) return r('pass', `${a.wordCount} words (no fixed target).`)
      const ratio = a.wordCount / i.targetWords
      if (ratio >= 0.8 && ratio <= 1.2) return r('pass', `${a.wordCount} words (target ${i.targetWords}).`)
      return r('warn', `${a.wordCount} words; the target is ${i.targetWords} (within 20% is fine).`)
    }
  },
  {
    id: 'internal_links',
    label: 'Internal links',
    weight: 6,
    fixable: true,
    run: (i, a) => {
      const internal = a.links.filter((l) => l.internal)
      if (internal.length < 2)
        return r(
          'fail',
          `${internal.length} internal link${internal.length === 1 ? '' : 's'}. Link to at least 2 other pages on your site.`
        )
      if (i.pillarUrl) {
        const p = normalizeUrl(i.pillarUrl)
        if (!internal.some((l) => normalizeUrl(l.href, i.siteUrl) === p))
          return r('fail', 'This piece is part of a set: link to the pillar page.')
      }
      return r('pass', `${internal.length} internal links.`)
    }
  },
  {
    id: 'external_links',
    label: 'External links',
    weight: 3,
    fixable: false,
    run: (_i, a) => {
      const ext = a.links.filter((l) => !l.internal && /^https?:/i.test(l.href))
      if (ext.length) return r('pass', `${ext.length} link${ext.length === 1 ? '' : 's'} to outside sources.`)
      const citesFacts =
        /\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\s?%|\bstud(?:y|ies)\b|\baccording to\b|\bresearch shows\b|\bstatistic/i.test(
          a.text
        )
      return citesFacts
        ? r('warn', 'You cite facts or numbers. Link to at least one authoritative source.')
        : r('pass', 'No cited facts that need an outside source.')
    }
  },
  {
    id: 'images_alt',
    label: 'Images have alt text',
    weight: 5,
    fixable: true,
    run: (_i, a) => {
      const missing = a.images.filter((im) => !im.alt).length
      if (!a.images.length) return r('pass', 'No images in the body.')
      return missing
        ? r('fail', `${missing} image${missing === 1 ? ' is' : 's are'} missing alt text.`)
        : r('pass', 'All images have alt text.')
    }
  },
  {
    id: 'readability',
    label: 'Readability',
    weight: 5,
    fixable: true,
    run: (_i, a) => {
      const f = fleschReadingEase(a.text)
      return f >= 50
        ? r('pass', `Flesch reading ease ${f} (50+ is easy enough).`)
        : r('warn', `Flesch reading ease ${f}. Use shorter sentences and simpler words.`)
    }
  },
  {
    id: 'paragraph_length',
    label: 'Paragraph length',
    weight: 4,
    fixable: true,
    run: (_i, a) => {
      const long = a.paragraphs.filter((p) => p.split(/\s+/).length > 120).length
      return long
        ? r('warn', `${long} paragraph${long === 1 ? ' is' : 's are'} over 120 words. Break them up.`)
        : r('pass', 'Paragraphs are a readable length.')
    }
  },
  {
    id: 'cannibalization',
    label: 'Cannibalization',
    weight: 6,
    fixable: false,
    run: (i) => {
      const hit = findConflicts(
        i.focusKeyword ?? '',
        i.seoTitle || i.title || '',
        i.existingPages ?? [],
        i.refreshOfUrl
      )
      return hit.length
        ? r(
            'fail',
            `Another page already targets this: ${hit
              .map((h) => h.url)
              .slice(0, 3)
              .join(', ')}. Improve that page instead, or pick a more specific keyword.`
          )
        : r('pass', 'No other page on the site targets this keyword.')
    }
  },
  {
    id: 'duplicate',
    label: 'Duplicate content',
    weight: 4,
    fixable: true,
    run: (i, a) => {
      const dup = findDuplicates(a.paragraphs, i.existingPages ?? [], i.refreshOfUrl)
      return dup.length
        ? r(
            'fail',
            `${dup.length} paragraph${dup.length === 1 ? '' : 's'} closely match ${dup[0].url}. Rewrite them in fresh words.`
          )
        : r('pass', 'No paragraphs copied from other pages on the site.')
    }
  },
  {
    id: 'confirm',
    label: 'Unresolved [CONFIRM]',
    weight: 6,
    fixable: false,
    run: (i, a) => {
      if (!a.confirms.length) return r('pass', 'No placeholders left.')
      if (i.dismissedConfirms)
        return r(
          'warn',
          `${a.confirms.length} placeholder(s) dismissed. Make sure they're removed from the text.`
        )
      return r(
        'fail',
        `${a.confirms.length} fact${a.confirms.length === 1 ? '' : 's'} to confirm: ${a.confirms.slice(0, 3).join('; ')}.`
      )
    }
  },
  {
    id: 'schema',
    label: 'Schema present',
    weight: 5,
    fixable: true,
    run: (i) =>
      isValidJsonLd(i.schemaJson)
        ? r('pass', 'Valid JSON-LD schema.')
        : r('fail', 'No valid JSON-LD schema yet. Click Fix it to generate it.')
  }
]

export function normalizeUrl(u: string, base?: string): string {
  try {
    const x = new URL(u, base || 'https://x.invalid')
    return (x.hostname.replace(/^www\./, '') + x.pathname).replace(/\/+$/, '').toLowerCase()
  } catch {
    return u.replace(/\/+$/, '').toLowerCase()
  }
}

/** Pages that already target this keyword, or have a near-identical title. */
export function findConflicts(
  keyword: string,
  title: string,
  pages: ExistingPage[],
  ignoreUrl?: string | null
): ExistingPage[] {
  const kw = normalize(keyword)
  const ign = ignoreUrl ? normalizeUrl(ignoreUrl) : null
  return pages.filter((p) => {
    if (ign && normalizeUrl(p.url) === ign) return false
    if (kw && p.focusKeyword && normalize(p.focusKeyword) === kw) return true
    if (kw && words(kw).length >= 2 && (normalize(p.title ?? '') === kw || normalize(p.h1 ?? '') === kw))
      return true
    if (
      kw &&
      words(kw).length >= 2 &&
      (containsPhrase(p.title ?? '', kw) || containsPhrase(p.h1 ?? '', kw)) &&
      titleSimilarity(p.title ?? p.h1 ?? '', kw) >= 0.6
    )
      return true
    if (title && p.title && titleSimilarity(title, p.title) >= 0.8) return true
    return false
  })
}

/** Paragraphs over 40 words that closely match a paragraph on another page (5-word shingles, Jaccard). */
export function findDuplicates(
  paragraphs: string[],
  pages: ExistingPage[],
  ignoreUrl?: string | null,
  threshold = 0.5
): { paragraph: string; url: string; similarity: number }[] {
  const ign = ignoreUrl ? normalizeUrl(ignoreUrl) : null
  const others = pages
    .filter((p) => !(ign && normalizeUrl(p.url) === ign))
    .flatMap((p) =>
      (p.paragraphs ?? [])
        .filter((x) => x.split(/\s+/).length > 20)
        .map((x) => ({ url: p.url, sh: shingles(x) }))
    )
  const out: { paragraph: string; url: string; similarity: number }[] = []
  for (const para of paragraphs) {
    if (para.split(/\s+/).length <= 40) continue
    const sh = shingles(para)
    for (const o of others) {
      const sim = jaccard(sh, o.sh)
      if (sim >= threshold) {
        out.push({ paragraph: para, url: o.url, similarity: sim })
        break
      }
    }
  }
  return out
}

export function isValidJsonLd(v: unknown): boolean {
  let x = v
  if (typeof x === 'string') {
    try {
      x = JSON.parse(x)
    } catch {
      return false
    }
  }
  const items = Array.isArray(x)
    ? x
    : x && typeof x === 'object' && Array.isArray((x as { '@graph'?: unknown[] })['@graph'])
      ? (x as { '@graph': unknown[] })['@graph']
      : [x]
  if (!items.length) return false
  const ctx =
    x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>)['@context'] : undefined
  return items.every((it) => {
    if (!it || typeof it !== 'object') return false
    const o = it as Record<string, unknown>
    const c = o['@context'] ?? ctx
    return typeof c === 'string' && /schema\.org/.test(c) && typeof o['@type'] === 'string'
  })
}

export function runSeoChecks(input: SeoInput): {
  score: number
  checks: SeoCheckResult[]
  analysis: Analysis
} {
  const a = analyze(input.html, input.siteUrl)
  const results: SeoCheckResult[] = checks.map((c) => ({
    id: c.id,
    label: c.label,
    weight: c.weight,
    fixable: c.fixable,
    ...c.run(input, a)
  }))
  const total = results.reduce((n, c) => n + c.weight, 0)
  const got = results.reduce(
    (n, c) => n + c.weight * (c.state === 'pass' ? 1 : c.state === 'warn' ? 0.5 : 0),
    0
  )
  return { score: Math.round((got / total) * 100), checks: results, analysis: a }
}
