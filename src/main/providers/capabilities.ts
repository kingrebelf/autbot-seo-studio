import rulesJson from './model-capabilities.json'
import type { Capability } from './types'

interface Rule {
  pattern: string
  add?: Capability[]
  remove?: Capability[]
  hide?: boolean
}

const rules = (rulesJson as { rules: Rule[] }).rules.map((r) => ({ ...r, re: new RegExp(r.pattern, 'i') }))

/** Guess capabilities from a model id using model-capabilities.json. */
export function guessCapabilities(modelId: string): { capabilities: Capability[]; hidden: boolean } {
  const caps = new Set<Capability>()
  let hidden = false
  for (const r of rules) {
    if (!r.re.test(modelId)) continue
    r.add?.forEach((c) => caps.add(c))
    r.remove?.forEach((c) => caps.delete(c))
    if (r.hide) hidden = true
  }
  return { capabilities: [...caps], hidden }
}

/** Merge provider-reported capabilities with guesses. Provider data wins where given. */
export function mergeCaps(reported: Capability[] | undefined, modelId: string): Capability[] {
  const g = guessCapabilities(modelId).capabilities
  if (!reported || reported.length === 0) return g
  return [
    ...new Set([...reported, ...g.filter((c) => c === 'webSearch' || c === 'longContext' || c === 'toolUse')])
  ]
}

export function shouldHide(modelId: string): boolean {
  return guessCapabilities(modelId).hidden
}
