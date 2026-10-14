/** Minimal robots.txt parser: groups by user-agent, longest-match Allow/Disallow. */
export interface Robots {
  sitemaps: string[]
  isAllowed(path: string): boolean
}

export function parseRobots(txt: string, agent = 'AutbotSEOStudio'): Robots {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = []
  const sitemaps: string[] = []
  let cur: (typeof groups)[number] | null = null
  let lastWasAgent = false
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const val = line.slice(idx + 1).trim()
    if (key === 'sitemap') {
      sitemaps.push(val)
      continue
    }
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] }
        groups.push(cur)
      }
      cur.agents.push(val.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (!cur) continue
    if (key === 'allow' || key === 'disallow') cur.rules.push({ allow: key === 'allow', path: val })
  }
  const a = agent.toLowerCase()
  const mine = groups.filter((g) => g.agents.some((x) => x !== '*' && a.includes(x)))
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules)
  const toRe = (p: string) =>
    new RegExp(
      '^' +
        p
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\\\$$/, '$')
    )
  return {
    sitemaps,
    isAllowed(path: string) {
      let best: { allow: boolean; len: number } | null = null
      for (const r of rules) {
        if (r.path === '') continue
        if (toRe(r.path).test(path)) {
          if (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))
            best = { allow: r.allow, len: r.path.length }
        }
      }
      return best ? best.allow : true
    }
  }
}
