import { describe, it, expect } from 'vitest'
import {
  checks,
  runSeoChecks,
  findConflicts,
  findDuplicates,
  isValidJsonLd,
  normalizeUrl,
  type SeoInput
} from '../../src/main/pipeline/seo-checks'

const SITE = 'https://greenlawns.example'
const KW = 'lawn aeration'

const INTRO = `<p>Lawn aeration is the simple job of pulling small plugs of soil out of your grass. It lets air, water and food reach the roots. We do it for homes all over town every spring and fall.</p>`
const GOOD_HTML = `${INTRO}
<h2>Why lawn aeration helps your grass</h2>
<p>Soil gets packed down when people walk on it. Hard soil keeps roots short and weak. When you open the soil, roots grow deep and the lawn stays green in hot weather. You can read more on our <a href="/services">lawn services page</a> or see the advice from the <a href="https://extension.example.edu/aeration">local extension office</a>.</p>
<h3>Signs your lawn needs it</h3>
<ul><li>Water runs off instead of soaking in.</li><li>The grass looks thin in busy spots.</li></ul>
<img src="https://greenlawns.example/img/plugs.webp" alt="Soil plugs on a green lawn">
<p>Most yards take less than an hour. We mark sprinkler heads first, so nothing gets broken. After we leave, water the yard well and keep mowing as normal. The small holes close up on their own within a couple of weeks.</p>
<h2>When to book</h2>
<p>Early fall is best for most cool grass. Spring works too. <a href="https://greenlawns.example/contact">Get in touch</a> and we will find a good day for you.</p>`

const META =
  'Lawn aeration helps grass breathe and grow thick. Learn what it costs, the best time to book, and how to get it done right this year.'

function base(over: Partial<SeoInput> = {}): SeoInput {
  return {
    html: GOOD_HTML,
    title: 'Lawn Aeration: A Practical Guide',
    seoTitle: 'Lawn Aeration: Costs, Timing and Practical Tips',
    metaDescription: META,
    slug: 'lawn-aeration',
    focusKeyword: KW,
    targetWords: null,
    siteUrl: SITE,
    pillarUrl: null,
    schemaJson: { '@context': 'https://schema.org', '@type': 'Article', headline: 'Lawn Aeration' },
    existingPages: [],
    dismissedConfirms: false,
    ...over
  }
}

function check(id: string, over: Partial<SeoInput> = {}) {
  const r = runSeoChecks(base(over)).checks.find((c) => c.id === id)
  if (!r) throw new Error(`no check ${id}`)
  return r
}

const words = (n: number, w = 'grass') => Array.from({ length: n }, () => w).join(' ')

describe('SEO check list', () => {
  it('has exactly the 19 deterministic checks, each covered below', () => {
    expect(checks.map((c) => c.id)).toEqual([
      'kw_title',
      'title_len',
      'meta_len',
      'kw_first100',
      'kw_h2',
      'density',
      'one_h1',
      'heading_order',
      'slug',
      'word_count',
      'internal_links',
      'external_links',
      'images_alt',
      'readability',
      'paragraph_length',
      'cannibalization',
      'duplicate',
      'confirm',
      'schema'
    ])
  })

  it('a well-optimised draft passes every check and scores 100', () => {
    expect(META.length).toBeGreaterThanOrEqual(120)
    expect(META.length).toBeLessThanOrEqual(158)
    const r = runSeoChecks(base())
    const notPass = r.checks.filter((c) => c.state !== 'pass').map((c) => `${c.id}: ${c.detail}`)
    expect(notPass).toEqual([])
    expect(r.score).toBe(100)
  })

  it('score drops with failures and warnings, weighted', () => {
    const r = runSeoChecks(base({ seoTitle: '', schemaJson: null }))
    expect(r.score).toBeLessThan(100)
    expect(r.score).toBeGreaterThan(0)
    const empty = runSeoChecks({ html: '' })
    expect(empty.score).toBeLessThan(50)
  })
})

describe('kw_title', () => {
  it('passes when the SEO title contains the keyword (any case)', () => {
    expect(check('kw_title', { seoTitle: 'Everything About LAWN AERATION in Spring' }).state).toBe('pass')
  })
  it('fails when the keyword is missing from the title', () => {
    const r = check('kw_title', { seoTitle: 'Spring Grass Care: Costs and Timing Tips' })
    expect(r.state).toBe('fail')
    expect(r.detail).toContain(KW)
  })
  it('fails when there is no focus keyword', () => {
    expect(check('kw_title', { focusKeyword: null }).detail).toMatch(/Set a focus keyword/)
  })
  it('matches whole words only', () => {
    expect(check('kw_title', { seoTitle: 'Lawn Aerations and Other Things Explained Today' }).state).toBe(
      'fail'
    )
  })
})

describe('title_len', () => {
  it('passes 30 to 60 characters (inclusive)', () => {
    expect(check('title_len', { seoTitle: 'x'.repeat(30) }).state).toBe('pass')
    expect(check('title_len', { seoTitle: 'x'.repeat(60) }).state).toBe('pass')
  })
  it('warns when too short or too long', () => {
    expect(check('title_len', { seoTitle: 'x'.repeat(29) }).state).toBe('warn')
    expect(check('title_len', { seoTitle: 'x'.repeat(61) }).state).toBe('warn')
  })
  it('fails when empty', () => {
    expect(check('title_len', { seoTitle: '   ' }).state).toBe('fail')
  })
})

describe('meta_len', () => {
  it('passes 120 to 158 characters with the keyword', () => {
    expect(check('meta_len').state).toBe('pass')
  })
  it('warns when the right length but the keyword is missing', () => {
    const m = META.replace('Lawn aeration', 'Core plugging')
    const r = check('meta_len', { metaDescription: m })
    expect(r.state).toBe('warn')
    expect(r.detail).toMatch(/doesn't include the focus keyword/)
  })
  it('warns when too short or too long', () => {
    expect(check('meta_len', { metaDescription: 'Lawn aeration in short.' }).state).toBe('warn')
    expect(check('meta_len', { metaDescription: `${META} ${META}` }).state).toBe('warn')
  })
  it('fails when missing', () => {
    expect(check('meta_len', { metaDescription: null }).state).toBe('fail')
  })
})

describe('kw_first100', () => {
  it('passes when the keyword is in the first 100 words', () => {
    expect(check('kw_first100').state).toBe('pass')
  })
  it('fails when the keyword only appears after 100 words', () => {
    const html = `<p>${words(120)}</p><h2>About lawn aeration</h2><p>Lawn aeration text.</p>`
    expect(check('kw_first100', { html }).state).toBe('fail')
  })
  it('fails without a keyword', () => {
    expect(check('kw_first100', { focusKeyword: '' }).state).toBe('fail')
  })
})

describe('kw_h2', () => {
  it('passes when an H2 contains the keyword', () => {
    expect(check('kw_h2').state).toBe('pass')
  })
  it('fails when the keyword is only in an H3 or body text', () => {
    const html = `<p>Lawn aeration intro.</p><h2>Why it helps</h2><h3>Lawn aeration signs</h3>`
    expect(check('kw_h2', { html }).state).toBe('fail')
  })
})

describe('density', () => {
  it('passes between 0.5% and 2.5%', () => {
    const r = check('density')
    expect(r.state).toBe('pass')
    expect(r.detail).toMatch(/%/)
  })
  it('warns when too low', () => {
    const html = `<p>Lawn aeration. ${words(800)}</p>`
    const r = check('density', { html })
    expect(r.state).toBe('warn')
    expect(r.detail).toMatch(/a little more/)
  })
  it('warns when stuffed', () => {
    const html = `<p>${Array.from({ length: 20 }, () => 'lawn aeration is good').join('. ')}</p>`
    const r = check('density', { html })
    expect(r.state).toBe('warn')
    expect(r.detail).toMatch(/stuffing/)
  })
  it('warns when there is no keyword or no text', () => {
    expect(check('density', { focusKeyword: null }).state).toBe('warn')
    expect(check('density', { html: '' }).state).toBe('warn')
  })
})

describe('one_h1', () => {
  it('passes with the title as the only H1', () => {
    expect(check('one_h1').state).toBe('pass')
  })
  it('passes with no title and exactly one H1 in the body', () => {
    expect(check('one_h1', { title: null, html: `<h1>Lawn aeration</h1>${GOOD_HTML}` }).state).toBe('pass')
  })
  it('fails with an extra H1 in the body', () => {
    const r = check('one_h1', { html: `<h1>Another title</h1>${GOOD_HTML}` })
    expect(r.state).toBe('fail')
    expect(r.detail).toMatch(/Found 2 H1/)
  })
  it('fails with no H1 at all', () => {
    expect(check('one_h1', { title: '' }).state).toBe('fail')
  })
})

describe('heading_order', () => {
  it('passes H1 > H2 > H3', () => {
    expect(check('heading_order').state).toBe('pass')
  })
  it('fails when jumping from the H1 title straight to an H3', () => {
    const r = check('heading_order', { html: '<h3>Too deep</h3><p>x</p>' })
    expect(r.state).toBe('fail')
    expect(r.detail).toMatch(/H1 to H3/)
  })
  it('fails when an H2 is followed by an H4', () => {
    expect(check('heading_order', { html: '<h2>A</h2><h4>B</h4>' }).state).toBe('fail')
  })
  it('allows going back up a level', () => {
    expect(check('heading_order', { html: '<h2>A</h2><h3>B</h3><h2>C</h2>' }).state).toBe('pass')
  })
})

describe('slug', () => {
  it('passes a short lowercase hyphenated slug with the keyword', () => {
    expect(check('slug', { slug: 'lawn-aeration-cost' }).state).toBe('pass')
  })
  it('fails when empty', () => {
    expect(check('slug', { slug: '' }).state).toBe('fail')
  })
  it('warns on uppercase or underscores', () => {
    expect(check('slug', { slug: 'Lawn_Aeration' }).detail).toMatch(/lowercase/)
  })
  it('warns when too long', () => {
    expect(check('slug', { slug: 'lawn-aeration-one-two-three-four-five-six-seven' }).detail).toMatch(
      /shorter/
    )
  })
  it('warns when the keyword is missing', () => {
    expect(check('slug', { slug: 'grass-care' }).detail).toMatch(/include the focus keyword/)
  })
  it('warns on several stop words', () => {
    expect(check('slug', { slug: 'the-lawn-aeration-and-you' }).detail).toMatch(/stop words/)
  })
})

describe('word_count', () => {
  it('passes with no target', () => {
    expect(check('word_count').state).toBe('pass')
  })
  it('passes within 20% of the target', () => {
    const html = `<p>${words(1000)}</p>`
    expect(check('word_count', { html, targetWords: 900 }).state).toBe('pass')
    expect(check('word_count', { html, targetWords: 1200 }).state).toBe('pass')
  })
  it('warns when far from the target', () => {
    const r = check('word_count', { html: `<p>${words(300)}</p>`, targetWords: 1500 })
    expect(r.state).toBe('warn')
    expect(r.detail).toMatch(/target is 1500/)
  })
})

describe('internal_links', () => {
  it('passes with 2+ internal links (relative or same host, www-insensitive)', () => {
    expect(check('internal_links').state).toBe('pass')
    const html = '<p><a href="https://www.greenlawns.example/a">a</a> <a href="/b">b</a></p>'
    expect(check('internal_links', { html }).state).toBe('pass')
  })
  it('fails with fewer than 2 internal links', () => {
    const html = '<p><a href="/a">a</a> <a href="https://other.example/x">x</a> <a href="#top">top</a></p>'
    const r = check('internal_links', { html })
    expect(r.state).toBe('fail')
    expect(r.detail).toMatch(/^1 internal link\./)
  })
  it('fails when part of a set and the pillar page is not linked', () => {
    const r = check('internal_links', { pillarUrl: `${SITE}/lawn-care-guide/` })
    expect(r.state).toBe('fail')
    expect(r.detail).toMatch(/pillar/)
  })
  it('passes when the pillar is linked', () => {
    const html = `${GOOD_HTML}<p>See the <a href="/lawn-care-guide">full guide</a>.</p>`
    expect(check('internal_links', { html, pillarUrl: `${SITE}/lawn-care-guide/` }).state).toBe('pass')
  })
})

describe('external_links', () => {
  it('passes with an outside link', () => {
    expect(check('external_links').state).toBe('pass')
  })
  it('warns when facts or numbers are cited without a source', () => {
    const html = '<p>According to a recent study, 45% of lawns are compacted. <a href="/x">x</a></p>'
    expect(check('external_links', { html }).state).toBe('warn')
  })
  it('passes when there is nothing to cite', () => {
    const html = '<p>We love green grass. <a href="mailto:hi@greenlawns.example">Email us</a></p>'
    expect(check('external_links', { html }).state).toBe('pass')
  })
})

describe('images_alt', () => {
  it('passes when every image has alt text', () => {
    expect(check('images_alt').state).toBe('pass')
  })
  it('passes when there are no images', () => {
    expect(check('images_alt', { html: '<p>No pictures.</p>' }).detail).toMatch(/No images/)
  })
  it('fails when an image has empty or missing alt', () => {
    const r = check('images_alt', {
      html: '<img src="a.webp" alt=" "><img src="b.webp"><img src="c.webp" alt="ok">'
    })
    expect(r.state).toBe('fail')
    expect(r.detail).toMatch(/2 images are missing alt text/)
  })
})

describe('readability', () => {
  it('passes plain English', () => {
    expect(check('readability').state).toBe('pass')
  })
  it('warns on dense, long-worded sentences', () => {
    const html =
      '<p>Comprehensive agronomic evaluations consistently demonstrate that mechanical decompaction methodologies substantially ameliorate rhizosphere oxygenation characteristics, consequently facilitating considerably enhanced photosynthetic productivity throughout predominantly temperate meteorological circumstances and heterogeneous edaphic conditions.</p>'
    const r = check('readability', { html })
    expect(r.state).toBe('warn')
    expect(r.detail).toMatch(/shorter sentences/)
  })
})

describe('paragraph_length', () => {
  it('passes short paragraphs', () => {
    expect(check('paragraph_length').state).toBe('pass')
  })
  it('warns on a paragraph over 120 words', () => {
    const r = check('paragraph_length', { html: `<p>${words(130)}</p><p>short</p>` })
    expect(r.state).toBe('warn')
    expect(r.detail).toMatch(/1 paragraph is over 120 words/)
  })
})

describe('cannibalization', () => {
  it('passes when no other page targets the keyword', () => {
    expect(
      check('cannibalization', {
        existingPages: [{ url: `${SITE}/mowing`, title: 'Mowing services', focusKeyword: 'lawn mowing' }]
      }).state
    ).toBe('pass')
  })
  it('fails when another page has the same focus keyword', () => {
    const r = check('cannibalization', {
      existingPages: [{ url: `${SITE}/aeration`, title: 'Our services', focusKeyword: 'Lawn Aeration' }]
    })
    expect(r.state).toBe('fail')
    expect(r.detail).toContain(`${SITE}/aeration`)
  })
  it('fails when another page title is the keyword', () => {
    expect(
      check('cannibalization', { existingPages: [{ url: `${SITE}/a`, title: 'Lawn aeration' }] }).state
    ).toBe('fail')
  })
  it('fails when another page has a near-identical title', () => {
    const r = check('cannibalization', {
      focusKeyword: 'core plugs',
      existingPages: [{ url: `${SITE}/b`, title: 'Lawn Aeration: Costs, Timing and Practical Tips!' }]
    })
    expect(r.state).toBe('fail')
  })
  it('ignores the page being refreshed (Mode D)', () => {
    const r = check('cannibalization', {
      refreshOfUrl: `${SITE}/aeration/`,
      existingPages: [{ url: `${SITE}/aeration`, focusKeyword: KW }]
    })
    expect(r.state).toBe('pass')
  })
  it('findConflicts is exported for the choose step', () => {
    expect(findConflicts(KW, '', [{ url: '/x', focusKeyword: KW }])).toHaveLength(1)
    expect(findConflicts('', '', [{ url: '/x', focusKeyword: KW }])).toHaveLength(0)
  })
})

describe('duplicate', () => {
  const para =
    'Our team arrives early with a core aerator and walks every part of the lawn in neat rows so that each square foot is covered, then we leave the soil plugs on top where they break down and feed the grass for weeks afterwards.'
  it('passes when no paragraph is copied', () => {
    expect(check('duplicate', { existingPages: [{ url: `${SITE}/x`, paragraphs: [para] }] }).state).toBe(
      'pass'
    )
  })
  it('fails when a long paragraph closely matches another page', () => {
    const html = `${GOOD_HTML}<p>${para}</p>`
    const r = check('duplicate', {
      html,
      existingPages: [{ url: `${SITE}/other`, paragraphs: [para.replace('neat rows', 'tidy rows')] }]
    })
    expect(r.state).toBe('fail')
    expect(r.detail).toContain(`${SITE}/other`)
  })
  it('ignores short paragraphs and the refreshed page', () => {
    const html = `${GOOD_HTML}<p>${para}</p>`
    expect(
      check('duplicate', {
        html,
        refreshOfUrl: `${SITE}/other`,
        existingPages: [{ url: `${SITE}/other`, paragraphs: [para] }]
      }).state
    ).toBe('pass')
    expect(
      findDuplicates(['short words only here'], [{ url: '/x', paragraphs: ['short words only here'] }])
    ).toEqual([])
  })
})

describe('confirm', () => {
  it('passes with no placeholders', () => {
    expect(check('confirm').state).toBe('pass')
  })
  it('fails with unresolved [CONFIRM: ...] placeholders', () => {
    const r = check('confirm', {
      html: `${GOOD_HTML}<p>We charge [CONFIRM: price per visit] and have [CONFIRM: years] years.</p>`
    })
    expect(r.state).toBe('fail')
    expect(r.detail).toMatch(/2 facts to confirm: price per visit; years/)
  })
  it('only warns once dismissed', () => {
    expect(check('confirm', { html: '<p>[CONFIRM: price]</p>', dismissedConfirms: true }).state).toBe('warn')
  })
})

describe('schema', () => {
  it('passes valid JSON-LD (object, string, array or @graph)', () => {
    expect(check('schema').state).toBe('pass')
    expect(isValidJsonLd(JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage' }))).toBe(true)
    expect(
      isValidJsonLd({
        '@context': 'https://schema.org',
        '@graph': [{ '@type': 'Article' }, { '@type': 'FAQPage' }]
      })
    ).toBe(true)
    expect(isValidJsonLd([{ '@context': 'http://schema.org', '@type': 'Article' }])).toBe(true)
  })
  it('fails when missing, unparseable, or not schema.org', () => {
    expect(check('schema', { schemaJson: null }).state).toBe('fail')
    expect(check('schema', { schemaJson: '{not json' }).state).toBe('fail')
    expect(
      check('schema', { schemaJson: { '@context': 'https://example.com', '@type': 'Article' } }).state
    ).toBe('fail')
    expect(check('schema', { schemaJson: { '@context': 'https://schema.org' } }).state).toBe('fail')
    expect(isValidJsonLd([])).toBe(false)
  })
})

describe('normalizeUrl', () => {
  it('ignores www, trailing slashes and case', () => {
    expect(normalizeUrl('https://WWW.Example.com/Path/')).toBe(normalizeUrl('http://example.com/path'))
    expect(normalizeUrl('/path/', 'https://example.com')).toBe('example.com/path')
  })
})
