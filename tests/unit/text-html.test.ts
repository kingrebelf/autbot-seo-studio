import { describe, it, expect } from 'vitest'
import {
  normalize,
  words,
  countPhrase,
  containsPhrase,
  slugify,
  jaccard,
  shingles,
  titleSimilarity,
  fleschReadingEase
} from '../../src/main/pipeline/text'
import { analyze, isInternal, hostOf, htmlToText } from '../../src/main/pipeline/html'
import { cleanHtml, stripTags } from '../../src/main/pipeline/sanitize'
import { insertLink, groupOutline } from '../../src/main/pipeline/steps'
import { htmlToPlain, htmlToMarkdown, toCsv, localizeImages } from '../../src/main/publish/export'
import { buildSchema, extractFaq } from '../../src/main/pipeline/schema-jsonld'
import { friendlyMessage, UserError, CancelledError, isAbort } from '../../src/main/errors'
import { parseJsonLoose } from '../../src/main/providers/base'

describe('text helpers', () => {
  it('normalize lowercases, strips accents, apostrophes and punctuation', () => {
    expect(normalize("  Café's   BEST—lawn!! ")).toBe('cafes best lawn')
    expect(words('Hello, world')).toEqual(['hello', 'world'])
    expect(words('')).toEqual([])
  })
  it('countPhrase counts whole-word, case-insensitive occurrences', () => {
    expect(countPhrase('Lawn care. lawn CARE; lawncare', 'lawn care')).toBe(2)
    expect(countPhrase('anything', '')).toBe(0)
    expect(containsPhrase('Best lawn aeration tips', 'Lawn Aeration')).toBe(true)
    expect(containsPhrase('aerations', 'aeration')).toBe(false)
  })
  it('slugify drops stop words and caps length', () => {
    expect(slugify('How to Aerate Your Lawn in the Spring!')).toBe('aerate-lawn-spring')
    expect(slugify('x '.repeat(100)).length).toBeLessThanOrEqual(75)
    expect(slugify('a'.repeat(80) + ' b')).not.toMatch(/-$/)
  })
  it('jaccard and shingles', () => {
    expect(jaccard(new Set([1, 2]), new Set([2, 3]))).toBeCloseTo(1 / 3)
    expect(jaccard(new Set(), new Set())).toBe(1)
    expect(shingles('one two three four five six').size).toBe(2)
    expect([...shingles('one two')]).toEqual(['one two'])
    expect(titleSimilarity('The Best Lawn Care', 'best lawn care')).toBe(1)
  })
  it('fleschReadingEase ranks plain text higher than dense text', () => {
    expect(fleschReadingEase('The cat sat on the mat. It was fun.')).toBeGreaterThan(80)
    expect(
      fleschReadingEase(
        'Notwithstanding considerable methodological heterogeneity, interdisciplinary investigations substantiate.'
      )
    ).toBeLessThan(30)
    expect(fleschReadingEase('')).toBe(100)
  })
})

describe('html helpers', () => {
  it('analyze extracts headings, paragraphs, links, images, confirms and word count', () => {
    const a = analyze(
      '<h1>T</h1><p>One two <a href="/x">three</a></p><h2>Sub</h2><ul><li>Item [CONFIRM: price]</li></ul><img src="a.png" alt=" Hi "><a href="https://other.example">o</a>',
      'https://site.example'
    )
    expect(a.headings).toEqual([
      { level: 1, text: 'T' },
      { level: 2, text: 'Sub' }
    ])
    expect(a.h1Count).toBe(1)
    expect(a.paragraphs).toEqual(['One two three', 'Item [CONFIRM: price]'])
    expect(a.links.map((l) => l.internal)).toEqual([true, false])
    expect(a.images).toEqual([{ src: 'a.png', alt: 'Hi' }])
    expect(a.confirms).toEqual(['price'])
    expect(a.text).not.toMatch(/twothree|Subitem/i)
    expect(a.wordCount).toBe(a.text.split(' ').length)
    // global regex must not keep state between calls
    expect(analyze('<p>[CONFIRM: a]</p>').confirms).toEqual(['a'])
    expect(analyze('<p>[CONFIRM: a]</p>').confirms).toEqual(['a'])
  })
  it('isInternal / hostOf', () => {
    expect(isInternal('/about', 'https://a.example')).toBe(true)
    expect(isInternal('//cdn.example/x', 'https://a.example')).toBe(false)
    expect(isInternal('https://www.a.example/x', 'https://a.example')).toBe(true)
    expect(isInternal('mailto:x@a.example', 'https://a.example')).toBe(false)
    expect(isInternal('#top', 'https://a.example')).toBe(false)
    expect(hostOf('not a url')).toBe('')
    expect(htmlToText('<p>a</p><p>b</p>')).toBe('a b')
  })
  it('cleanHtml strips scripts, styles, events and code fences', () => {
    const out = cleanHtml(
      '```html\n<h2 onclick="x()">Hi</h2><script>alert(1)</script><style>p{}</style><p>ok <a href="javascript:alert(1)">bad</a></p>\n```'
    )
    expect(out).toBe('<h2>Hi</h2><p>ok <a>bad</a></p>')
    expect(cleanHtml('<img src="autbot-media://img/3" data-image-id="3" alt="x">')).toContain(
      'autbot-media://img/3'
    )
    expect(stripTags('<p>a <b>b</b></p>')).toBe('a b')
  })
  it('insertLink links the first unlinked occurrence only', () => {
    expect(insertLink('<p>Read our lawn care guide.</p>', 'lawn care', '/care')).toBe(
      '<p>Read our <a href="/care">lawn care</a> guide.</p>'
    )
    expect(insertLink('<p><a href="/x">lawn care</a></p>', 'lawn care', '/care')).toBeNull()
    expect(insertLink('<p>nothing</p>', '', '/care')).toBeNull()
  })
  it('groupOutline nests H3s under their H2', () => {
    const g = groupOutline([
      { heading: 'A', level: 2, key_points: [] },
      { heading: 'A1', level: 3, key_points: [] },
      { heading: 'B', level: 2, key_points: [] }
    ])
    expect(g.map((s) => [s.heading, s.children.map((c) => c.heading)])).toEqual([
      ['A', ['A1']],
      ['B', []]
    ])
  })
  it('export converters', () => {
    expect(htmlToPlain('<h2>Hi &amp; bye</h2><ul><li>a</li><li>b</li></ul>')).toBe('HI & BYE\n\n- a\n- b')
    expect(htmlToPlain('<h3>Tips &lt;2026&gt;</h3><p>Tom &amp;amp; Jerry</p>')).toBe(
      'TIPS <2026>\n\nTom &amp; Jerry'
    )
    expect(htmlToMarkdown('<h2>Hi</h2><p><strong>b</strong></p>')).toBe('## Hi\n\n**b**')
    expect(toCsv([['a', 'b,c', 'say "hi"']])).toBe('a,"b,c","say ""hi"""\n')
    expect(localizeImages('<img src="autbot-media://img/7">', [{ id: 7, filename: 'x.webp' } as never])).toBe(
      '<img src="images/x.webp">'
    )
  })
  it('FAQ schema is built from question headings', () => {
    const html = '<h2>How long does it take?</h2><p>About an hour.</p><h2>Other</h2><p>x</p>'
    expect(extractFaq(html)).toEqual([{ q: 'How long does it take?', a: 'About an hour.' }])
    const s = buildSchema({
      type: 'blog post',
      title: 'T',
      html,
      profile: { name: 'Biz' },
      siteUrl: 'https://a.example',
      url: 'https://a.example/t'
    }) as unknown
    expect(JSON.stringify(s)).toMatch(/FAQPage/)
  })
})

describe('errors', () => {
  it('turns technical errors into plain English with a next step', () => {
    expect(friendlyMessage(new Error('getaddrinfo ENOTFOUND x'))).toMatch(/internet connection/)
    expect(friendlyMessage(new Error('connect ECONNREFUSED'))).toMatch(/refused/)
    expect(friendlyMessage(new Error('SQLITE_BUSY'))).toMatch(/busy/)
    expect(friendlyMessage(new Error('weird'))).toMatch(/Export logs/)
    expect(friendlyMessage(new UserError('Be nice.'))).toBe('Be nice.')
    expect(friendlyMessage(new CancelledError())).toMatch(/Cancelled/)
    expect(isAbort(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true)
    expect(isAbort(new UserError('Sign-in was cancelled.'))).toBe(false)
  })
  it('parseJsonLoose pulls JSON out of chatty replies', () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(parseJsonLoose('Sure! Here it is: {"a":[1,2]} hope that helps')).toEqual({ a: [1, 2] })
    expect(parseJsonLoose('nothing')).toBeUndefined()
  })
})
