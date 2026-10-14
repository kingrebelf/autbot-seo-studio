import { and, eq, isNotNull, lte } from 'drizzle-orm'
import { getDb, schema } from '../db'
import { registerHandler } from './queue'
import { stepResearch, stepBrief, stepWrite, runChecks } from '../pipeline/steps'
import { modeB, modeC, modeD, modeE, modeF, modeG } from '../pipeline/modes'
import { generateOptions } from '../pipeline/images'
import { crawlSite } from '../research/crawler'
import { importWordPress, syncWordPressStatus, addLinkBacksAsDrafts } from '../publish/send'
import { pullGscRanks, checkRanksDataForSeo } from '../tracking/ranks'
import { gscConnected, inspectUrl } from '../indexing/gsc'
import { getSite, settingsOf, logActivity } from '../sites'
import { updateContent } from '../content'
import { notifyUser } from '../notify'

const THREE_DAYS = 3 * 86_400_000

export function registerAllHandlers(): void {
  registerHandler('research', stepResearch)
  registerHandler('brief', stepBrief)
  registerHandler('write', stepWrite)
  registerHandler('check', async (ctx) => {
    await runChecks(ctx)
    return { status: 'done' }
  })
  registerHandler('refresh', modeD)
  registerHandler('mode-b', modeB)
  registerHandler('mode-c', modeC)
  registerHandler('mode-e', modeE)
  registerHandler('mode-f', modeF)
  registerHandler('mode-g', modeG)
  registerHandler('images', async (ctx) => {
    const slots = (ctx.input.slots as { slot: string; prompt: string; count: number }[]) ?? []
    const done = (ctx.output.slotsDone as string[]) ?? []
    for (const s of slots) {
      if (done.includes(s.slot)) continue
      ctx.progress(
        'images',
        `Generating ${s.count} option${s.count === 1 ? '' : 's'} for ${s.slot === 'featured' ? 'the featured image' : s.slot}`
      )
      await generateOptions(ctx.contentId!, s.slot, s.prompt, s.count, ctx.signal)
      done.push(s.slot)
      ctx.save({ slotsDone: done })
    }
    return { status: 'done' }
  })
  registerHandler('crawl', async (ctx) => {
    const r = await crawlSite(ctx.siteId!, ctx.signal, (d, t, url) =>
      ctx.progress('crawl', `Reading page ${d + 1} of about ${t}: ${url}`)
    )
    logActivity(ctx.siteId, `Crawled your website: ${r.pages} pages`, '/health')
    return { status: 'done', output: r }
  })
  registerHandler('wp-import', async (ctx) => {
    ctx.progress('wp-import', 'Reading posts and pages from WordPress')
    return { status: 'done', output: { imported: await importWordPress(ctx.siteId!) } }
  })
  registerHandler('wp-sync', async (ctx) => ({
    status: 'done',
    output: { published: await syncWordPressStatus(ctx.siteId!) }
  }))
  registerHandler('gsc-pull', async (ctx) => {
    ctx.progress('gsc-pull', 'Pulling positions, clicks and impressions from Search Console')
    return {
      status: 'done',
      output: { rows: await pullGscRanks(ctx.siteId!, ctx.input.days as number | undefined) }
    }
  })
  registerHandler('rank-check', async (ctx) => {
    ctx.progress('rank-check', 'Checking exact positions with DataForSEO')
    return { status: 'done', output: { checked: await checkRanksDataForSeo(ctx.siteId!) } }
  })
  registerHandler('link-backs', async (ctx) => ({
    status: 'done',
    output: await addLinkBacksAsDrafts(ctx.contentId!)
  }))
  registerHandler('index-check', async (ctx) => {
    const site = getSite(ctx.siteId!)
    const prop = settingsOf(site).gscProperty
    if (!prop || !gscConnected()) return { status: 'done', output: { checked: 0 } }
    const due = getDb()
      .select()
      .from(schema.content)
      .where(
        and(
          eq(schema.content.siteId, site.id),
          isNotNull(schema.content.liveUrl),
          lte(schema.content.publishedAt, Date.now() - THREE_DAYS)
        )
      )
      .all()
      .filter(
        (c) =>
          !c.indexStatus ||
          (c.indexStatus !== 'Submitted and indexed' && (c.indexCheckedAt ?? 0) < Date.now() - 2 * 86_400_000)
      )
    let n = 0
    for (const c of due) {
      ctx.progress('index-check', `Checking if Google indexed ${c.liveUrl}`)
      const r = await inspectUrl(prop, c.liveUrl!)
      updateContent(c.id, { indexStatus: r.coverageState, indexCheckedAt: Date.now() })
      if (r.verdict === 'PASS' && c.indexStatus !== r.coverageState)
        notifyUser(
          site.id,
          'indexed',
          `Indexed by Google: ${c.title}`,
          r.coverageState,
          `/content/${c.id}`,
          false
        )
      n++
    }
    return { status: 'done', output: { checked: n } }
  })
}
