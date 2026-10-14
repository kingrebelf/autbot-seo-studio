import sharp from 'sharp'
import fallback from './fallback-models.json'
import { textOf } from './base'
import type { AIProvider, ChatRequest, ChatResult, ImageRequest, ModelInfo } from './types'

/**
 * Canned responses so the whole app can be exercised without API keys.
 * Only visible when AUTBOT_DEV=1.
 */
const pick = (s: string, re: RegExp, d = ''): string => s.match(re)?.[1]?.trim() ?? d

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function mockJson(title: string, prompt: string): unknown {
  const topic =
    pick(prompt, /topic "([^"]+)"/i) || pick(prompt, /keyword: "([^"]+)"/i) || 'spring lawn aeration'
  const kw = pick(prompt, /Focus keyword: "([^"]+)"/i) || topic
  switch (title) {
    case 'research':
      return {
        keyword_options: [
          {
            keyword: topic,
            intent: 'learn',
            difficulty_for_small_site: 'medium',
            volume: null,
            volume_source: 'ai_estimate',
            why_it_fits: `People asking about ${topic} are close to hiring someone.`,
            cannibalization_risk: null
          },
          {
            keyword: `${topic} cost`,
            intent: 'compare',
            difficulty_for_small_site: 'low',
            volume: null,
            volume_source: 'ai_estimate',
            why_it_fits: 'Price questions come right before buying.',
            cannibalization_risk: null
          },
          {
            keyword: `${topic} near me`,
            intent: 'local',
            difficulty_for_small_site: 'low',
            volume: null,
            volume_source: 'ai_estimate',
            why_it_fits: 'Local searchers are ready to book.',
            cannibalization_risk: null
          },
          {
            keyword: `best time for ${topic}`,
            intent: 'learn',
            difficulty_for_small_site: 'low',
            volume: null,
            volume_source: 'ai_estimate',
            why_it_fits: 'Seasonal question you can answer with authority.',
            cannibalization_risk: null
          },
          {
            keyword: `${topic} vs alternatives`,
            intent: 'compare',
            difficulty_for_small_site: 'high',
            volume: null,
            volume_source: 'ai_estimate',
            why_it_fits: 'Comparison shoppers; harder to rank for.',
            cannibalization_risk: null
          }
        ],
        competitor_snapshot: [
          {
            title: `The complete guide to ${topic}`,
            url: 'https://example.com/guide',
            page_type: 'blog post',
            approx_words: 1800,
            covers: 'Basics, steps, timing',
            misses: 'Local prices and real examples'
          },
          {
            title: `${cap(topic)} services`,
            url: 'https://example.org/services',
            page_type: 'service page',
            approx_words: 700,
            covers: 'Service list and contact form',
            misses: 'Answers to common questions'
          }
        ],
        content_gap: [
          'Real local prices',
          'Before/after examples',
          'A simple checklist',
          'FAQ answering timing questions'
        ],
        questions: [
          `How much does ${topic} cost?`,
          `When is the best time for ${topic}?`,
          `How long does ${topic} take?`
        ],
        recommendation: {
          keyword: topic,
          content_type: 'blog post',
          why: `"${topic}" matches what your customers search right before they call. Competitors skip local prices, so a practical guide can stand out. It's worth your time.`,
          worth_it: true
        },
        sources: ['https://example.com/guide', 'https://example.org/services']
      }
    case 'brief':
      return {
        search_intent: 'learn, then hire',
        audience: 'Local homeowners and small-business customers',
        angle: 'A practical, honest guide with real local details',
        h1: `${cap(kw)}: A Practical Guide`,
        outline: [
          { heading: `What is ${kw}?`, level: 2, key_points: ['Plain-English definition', 'Who needs it'] },
          { heading: `Why ${kw} matters`, level: 2, key_points: ['Benefits', 'What happens if you skip it'] },
          { heading: 'Signs you need it', level: 3, key_points: ['Common signs'] },
          {
            heading: `How much does ${kw} cost?`,
            level: 2,
            key_points: ['Price factors', '[CONFIRM] our price']
          },
          { heading: 'Frequently asked questions', level: 2, key_points: ['Timing', 'Duration'] }
        ],
        questions: [`How long does ${kw} take?`, `When should I book ${kw}?`],
        internal_links: [],
        cta: 'Call us today for a free quote.',
        facts_needed: [
          { key: 'price', question: `What do you charge for ${kw}?` },
          { key: 'years', question: 'How many years have you been in business?' }
        ],
        secondary_keywords: [`${kw} cost`, `best time for ${kw}`]
      }
    case 'meta':
      return {
        seo_title: `${cap(kw)}: Costs, Timing and Tips`.slice(0, 60),
        meta_description:
          `Everything you need to know about ${kw}: what it costs, the best time to book, and how to get it done right. Read our honest local guide today.`.slice(
            0,
            155
          ),
        slug: slugify(kw),
        excerpt: `A practical guide to ${kw}.`,
        categories: ['Guides'],
        tags: [kw]
      }
    case 'meta_fix':
      return {
        seo_title: `${cap(kw)}: A Practical Guide`.slice(0, 60),
        meta_description:
          `Learn about ${kw}: costs, timing and what to expect, from a local team that does it every day. Get practical answers and a free quote.`.slice(
            0,
            155
          ),
        slug: slugify(kw)
      }
    case 'seo_pass':
      return {
        suggestions: [{ find: 'very important', replace: 'important', reason: 'Tighter wording' }],
        internal_links: [],
        link_backs: [],
        backlink_ideas: [
          { idea: 'Local chamber of commerce directory', why: 'Free, relevant local link' },
          { idea: 'Supplier "where to buy" page', why: 'Suppliers often list trusted pros' }
        ]
      }
    case 'fact_check':
      return {
        claims: [
          {
            sentence: 'Most lawns benefit from yearly care.',
            why: 'General claim that could be challenged',
            suggested_source: 'Your local university extension service'
          }
        ],
        brand_safety: [],
        robotic: [],
        ymyl: /dental|legal|law|medical|health|loan|tax|insurance|invest/i.test(prompt)
      }
    case 'image_prompts':
      return {
        slots: [
          { slot: 'featured', prompt: `A bright photo-style image illustrating ${kw}, no text, no logos` }
        ]
      }
    case 'image_text':
      return {
        filename: `${slugify(kw)}-photo.webp`,
        alt: `Illustration of ${kw}`.slice(0, 120),
        title: cap(kw),
        caption: `${cap(kw)} in action.`,
        description: `An image showing ${kw}, used in our guide.`
      }
    case 'mode_b':
      return {
        suggestions: [1, 2, 3, 4, 5].map((i) => ({
          title: `Suggested piece ${i}: ${cap(topic)} topic ${i}`,
          keyword: `${topic} idea ${i}`,
          content_type: i === 1 ? 'service page' : 'blog post',
          why: `Fills a gap your competitors leave open (#${i}).`,
          priority: i
        }))
      }
    case 'mode_c':
      return {
        suggestions: [
          {
            kind: 'title_meta',
            page_url: null,
            title: 'Rewrite title and meta on your top page',
            keyword: topic,
            why: 'High impressions but low clicks.',
            proposed_title: `${cap(topic)} | Free Quote`,
            proposed_meta: `Need ${topic}? Honest prices, fast service.`
          },
          {
            kind: 'supporting',
            page_url: null,
            title: `Supporting post: ${topic} checklist`,
            keyword: `${topic} checklist`,
            why: 'Supports a page ranking 4 to 20.',
            proposed_title: null,
            proposed_meta: null
          }
        ]
      }
    case 'mode_d':
      return {
        improvements: [
          { change: 'Added a pricing section', why: 'Searchers want prices' },
          { change: 'Added FAQ', why: 'Answers common questions' }
        ],
        focus_keyword: topic,
        title: `${cap(topic)} (updated)`,
        updated_html: `<h2>About ${topic}</h2><p>Updated introduction about ${topic}.</p><h2>${cap(topic)} prices</h2><p>[CONFIRM: your current prices]</p><h2>FAQ</h2><p>Answers to common questions about ${topic}.</p>`
      }
    case 'mode_e':
      return {
        pillar: { title: `The complete guide to ${topic}`, keyword: topic, why: 'Main page for the topic' },
        supporting: [
          { title: `${cap(topic)} cost explained`, keyword: `${topic} cost`, why: 'Price questions' },
          { title: `Best time for ${topic}`, keyword: `best time for ${topic}`, why: 'Timing questions' },
          {
            title: `${cap(topic)} mistakes to avoid`,
            keyword: `${topic} mistakes`,
            why: 'Problem-aware searchers'
          }
        ]
      }
    case 'mode_f': {
      const areas = pick(prompt, /Areas: ([^\n]+)/i, 'Springfield, Shelbyville').split(/,\s*/)
      return {
        pages: areas.map((a) => ({
          area: a,
          title: `${cap(topic)} in ${a}`,
          keyword: `${topic} ${a}`,
          local_angle: `Local soil, weather and neighbourhoods in ${a}.`
        }))
      }
    }
    case 'mode_g': {
      const start = new Date()
      const months = Array.from({ length: Number(pick(prompt, /next (\d+) months/i, '6')) }, (_, i) => {
        const d = new Date(start.getFullYear(), start.getMonth() + i + 1, 1)
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        return {
          month: m,
          focus: `Focus ${i + 1}`,
          why_now: 'Content goes up 2 to 3 months before the season people search for it.',
          main: { title: `Main page for month ${i + 1}`, keyword: `${topic} ${i + 1}` },
          supporting: [1, 2, 3].map((j) => ({
            title: `Supporting post ${i + 1}.${j}`,
            keyword: `${topic} ${i + 1} ${j}`
          }))
        }
      })
      return { months }
    }
    case 'alt_keywords':
      return {
        keywords: [`${topic} for beginners`, `${topic} cost in 2026`, `how often to do ${topic}`].map(
          (k) => ({ keyword: k, why: 'More specific, less competition' })
        )
      }
    case 'spar_conclusion':
      return {
        strategy_notes:
          'SEO is worth a modest, steady effort. Start with service pages for your top 3 money-makers, then one helpful post per week.'
      }
    default:
      return {}
  }
}

function mockWrite(prompt: string): string {
  const kw = pick(prompt, /Focus keyword: "([^"]+)"/i, 'your topic')
  const section = pick(prompt, /Now write ONLY this section:\s*([^\n]+)/i)
  const para = (n: number) =>
    `<p>${cap(kw)} is something our customers ask about every week. Here is a clear, practical explanation (part ${n}) written for real people, with the details that matter when you are deciding what to do next.</p>`
  if (/Now write ONLY the introduction/i.test(prompt))
    return `<p>If you are wondering about ${kw}, this guide gives you straight answers: what it is, what it costs, and how to get it done right.</p>${para(0)}`
  if (/Now write ONLY the closing call to action/i.test(prompt))
    return `<h2>Ready to get started?</h2><p>${pick(prompt, /call to action: ([^\n]+)/i, 'Get in touch today.')}</p>`
  if (section) {
    const level = /^###/.test(section) ? 'h3' : 'h2'
    const heading = section.replace(/^#+\s*/, '')
    return `<${level}>${heading}</${level}>${para(1)}${para(2)}<ul><li>Tip about ${kw}</li><li>Another useful point</li></ul>`
  }
  if (/Rewrite/i.test(prompt))
    return pick(prompt, /Text to rewrite:\s*([\s\S]+)$/i, 'Rewritten text.').replace(/\bvery\b/g, '')
  return `<p>Mock answer about ${kw}.</p>`
}

export class MockProvider implements AIProvider {
  id = 'mock'
  displayName = 'Mock provider (dev only)'
  authKind = 'none' as const
  async testConnection() {
    return { ok: true, message: 'Mock provider ready. It returns canned responses for testing.' }
  }
  async listModels(): Promise<ModelInfo[]> {
    const [writer, researcher, image, vision] = fallback.mock as string[]
    return [
      {
        id: researcher,
        label: 'Mock researcher',
        capabilities: ['text', 'json', 'webSearch', 'longContext'],
        contextWindow: 200000,
        inputPricePerMTok: 1,
        outputPricePerMTok: 2
      },
      {
        id: writer,
        label: 'Mock writer',
        capabilities: ['text', 'json'],
        contextWindow: 100000,
        inputPricePerMTok: 1,
        outputPricePerMTok: 2
      },
      { id: image, label: 'Mock image', capabilities: ['imageGen'], pricePerImage: 0.01 },
      {
        id: vision,
        label: 'Mock vision',
        capabilities: ['text', 'json', 'vision'],
        contextWindow: 50000,
        inputPricePerMTok: 0.5,
        outputPricePerMTok: 1
      }
    ]
  }
  async chat(req: ChatRequest, onToken?: (t: string) => void): Promise<ChatResult> {
    const prompt = [req.system ?? '', ...req.messages.map((m) => textOf(m.content))].join('\n')
    const title = (req.jsonSchema as { title?: string } | undefined)?.title
    let text: string
    let json: unknown
    if (req.jsonSchema) {
      json = mockJson(title ?? '', prompt)
      text = JSON.stringify(json)
    } else if (/strategy|SEO worth it|marketing spend/i.test(prompt) && !/Focus keyword/.test(prompt)) {
      text =
        'Based on your numbers, SEO looks worth a steady, modest effort. What share of your leads come from Google today?'
    } else text = mockWrite(prompt)
    if (onToken)
      for (const chunk of text.match(/.{1,40}/gs) ?? []) {
        if (req.signal?.aborted) throw new Error('aborted')
        onToken(chunk)
      }
    if (process.env.AUTBOT_MOCK_DELAY_MS)
      await new Promise((r) => setTimeout(r, Number(process.env.AUTBOT_MOCK_DELAY_MS)))
    if (req.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    return {
      text,
      json,
      usage: { inputTokens: Math.ceil(prompt.length / 4), outputTokens: Math.ceil(text.length / 4) }
    }
  }
  async generateImage(req: ImageRequest): Promise<{ images: Buffer[] }> {
    const [w, h] = (req.size
      .match(/^(\d+)x(\d+)$/)
      ?.slice(1)
      .map(Number) ?? [1024, 1024]) as [number, number]
    const images: Buffer[] = []
    for (let i = 0; i < (req.n ?? 1); i++) {
      const hue = (i * 70 + req.prompt.length * 13) % 360
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g"><stop offset="0" stop-color="hsl(${hue},70%,55%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,40%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="rgba(255,255,255,0.35)"/></svg>`
      images.push(await sharp(Buffer.from(svg)).png().toBuffer())
    }
    return { images }
  }
}
