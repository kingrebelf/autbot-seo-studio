/** Small text helpers shared by the SEO checks (pure functions, unit-tested). */

export const STOP_WORDS = new Set(
  'a an and are as at be but by for from how in into is it of on or our so that the this to was what when where which who why with your you'.split(
    ' '
  )
)

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function words(s: string): string[] {
  const n = normalize(s)
  return n ? n.split(' ') : []
}

/** Count non-overlapping occurrences of a phrase (word-boundary aware). */
export function countPhrase(text: string, phrase: string): number {
  const t = ` ${normalize(text)} `
  const p = normalize(phrase)
  if (!p) return 0
  let count = 0
  let i = 0
  const needle = ` ${p} `
  while ((i = t.indexOf(needle, i)) !== -1) {
    count++
    i += needle.length - 1
  }
  return count
}

export function containsPhrase(text: string, phrase: string): boolean {
  return countPhrase(text, phrase) > 0
}

export function slugify(s: string): string {
  return normalize(s)
    .split(' ')
    .filter((w) => w && !STOP_WORDS.has(w))
    .join('-')
    .slice(0, 75)
    .replace(/-+$/, '')
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (!a.size && !b.size) return 1
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

export function shingles(s: string, n = 5): Set<string> {
  const w = words(s)
  const out = new Set<string>()
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '))
  if (w.length < n && w.length) out.add(w.join(' '))
  return out
}

export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(words(a).filter((w) => !STOP_WORDS.has(w)))
  const tb = new Set(words(b).filter((w) => !STOP_WORDS.has(w)))
  return jaccard(ta, tb)
}

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  const m = stripped.match(/[aeiouy]{1,2}/g)
  return Math.max(1, m ? m.length : 1)
}

/** Flesch reading ease (higher is easier; 60+ is plain English). */
export function fleschReadingEase(text: string): number {
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0).length || 1
  const w = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []
  if (!w.length) return 100
  const syl = w.reduce((n, x) => n + syllables(x), 0)
  return Math.round((206.835 - 1.015 * (w.length / sentences) - 84.6 * (syl / w.length)) * 10) / 10
}
