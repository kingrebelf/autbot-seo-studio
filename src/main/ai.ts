import type { z } from 'zod'
import { and, eq, gte, sql } from 'drizzle-orm'
import { getDb, schema } from './db'
import { getProvider, getTaskAssignment, connectedModels, effectiveCaps } from './providers/registry'
import { UserError, CancelledError, isAbort } from './errors'
import { log } from './logger'
import { jsonSchemaOf } from './pipeline/schemas'
import type { ChatRequest, ChatResult, ContentPart } from './providers/types'
import type { TaskKey } from '@shared/types'
import { TASKS } from '@shared/types'

export interface ModelRef {
  providerId: string
  modelId: string
}

export interface TaskContext {
  siteId?: number | null
  contentId?: number | null
  signal?: AbortSignal
  /** Per-content model override from the wizard's Advanced toggle. */
  override?: ModelRef | null
  /** Skip the budget guard (the user clicked "Continue anyway"). */
  budgetOverride?: boolean
}

export class BudgetPauseError extends UserError {
  constructor(
    public spent: number,
    public estimate: number,
    public cap: number
  ) {
    super(
      `This would take this site's AI spend past its monthly cap ($${spent.toFixed(2)} spent + about $${estimate.toFixed(2)} for this step, cap $${cap.toFixed(2)}). Click "Continue anyway" to go ahead, or raise the cap in Settings > Sites.`,
      'budget'
    )
  }
}

function modelRow(ref: ModelRef) {
  return getDb()
    .select()
    .from(schema.models)
    .where(and(eq(schema.models.providerId, ref.providerId), eq(schema.models.modelId, ref.modelId)))
    .get()
}

export function costOf(ref: ModelRef, inputTokens: number, outputTokens: number, images = 0): number {
  const m = modelRow(ref)
  const p = m?.prices ?? {}
  return (
    ((p.input ?? 0) * inputTokens) / 1e6 + ((p.output ?? 0) * outputTokens) / 1e6 + (p.image ?? 0) * images
  )
}

export function logUsage(
  ref: ModelRef,
  task: string,
  ctx: TaskContext,
  usage: { inputTokens: number; outputTokens: number },
  images = 0,
  reportedCost?: number
): number {
  const cost = reportedCost ?? costOf(ref, usage.inputTokens, usage.outputTokens, images)
  getDb()
    .insert(schema.aiUsage)
    .values({
      siteId: ctx.siteId ?? null,
      providerId: ref.providerId,
      modelId: ref.modelId,
      task,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      images,
      costUsd: cost,
      contentId: ctx.contentId ?? null
    })
    .run()
  return cost
}

export function monthSpend(siteId: number | null | undefined): number {
  const start = new Date()
  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  const conds = [gte(schema.aiUsage.createdAt, start.getTime())]
  if (siteId) conds.push(eq(schema.aiUsage.siteId, siteId))
  const r = getDb()
    .select({ total: sql<number>`coalesce(sum(${schema.aiUsage.costUsd}), 0)` })
    .from(schema.aiUsage)
    .where(and(...conds))
    .get()
  return r?.total ?? 0
}

export function budgetCap(siteId: number | null | undefined): number | null {
  if (!siteId) return null
  const s = getDb().select().from(schema.sites).where(eq(schema.sites.id, siteId)).get()
  const cap = (s?.settings as { monthlyBudgetUsd?: number | null } | null)?.monthlyBudgetUsd
  return typeof cap === 'number' && cap > 0 ? cap : null
}

/** Estimate cost and pause if it would pass the site's monthly cap. */
export function budgetGuard(
  ref: ModelRef,
  ctx: TaskContext,
  estInputTokens: number,
  estOutputTokens: number,
  images = 0
): void {
  if (ctx.budgetOverride) return
  const cap = budgetCap(ctx.siteId)
  if (cap === null) return
  const est = costOf(ref, estInputTokens, estOutputTokens, images)
  const spent = monthSpend(ctx.siteId)
  if (spent + est > cap) throw new BudgetPauseError(spent, est, cap)
}

export function resolveModels(task: TaskKey, ctx: TaskContext): ModelRef[] {
  const out: ModelRef[] = []
  if (ctx.override) out.push(ctx.override)
  const a = getTaskAssignment(task, ctx.siteId)
  if (a?.providerId && a.modelId) out.push({ providerId: a.providerId, modelId: a.modelId })
  if (a?.fallbackProviderId && a.fallbackModelId)
    out.push({ providerId: a.fallbackProviderId, modelId: a.fallbackModelId })
  if (!out.length) {
    // nothing assigned: use any connected model with the needed capabilities
    const t = TASKS.find((x) => x.key === task)!
    const m = connectedModels().find((x) => !x.hidden && t.needs.every((n) => x.caps.includes(n)))
    if (m) out.push({ providerId: m.providerId, modelId: m.modelId })
  }
  if (!out.length) {
    const label = TASKS.find((x) => x.key === task)?.label ?? task
    throw new UserError(
      `No AI model is set up for "${label}". Go to Settings > AI Models, connect a provider, and pick a model for this task.`,
      'no_model'
    )
  }
  return out
}

function modelSupports(ref: ModelRef, cap: 'webSearch' | 'json' | 'vision'): boolean {
  const m = modelRow(ref)
  return m ? effectiveCaps(m).includes(cap) : cap !== 'vision'
}

export interface RunChatOpts<S extends z.ZodType | undefined> {
  task: TaskKey
  system?: string
  prompt: string | ContentPart[]
  history?: ChatRequest['messages']
  schema?: S
  webSearch?: boolean
  maxOutputTokens?: number
  temperature?: number
  onToken?: (t: string) => void
}

export interface RunChatResult<T> {
  text: string
  data: T
  citations: { url: string; title?: string }[]
  model: ModelRef
}

const estTokens = (s: string) => Math.ceil(s.length / 4)

async function callOnce(ref: ModelRef, req: ChatRequest, onToken?: (t: string) => void): Promise<ChatResult> {
  const p = getProvider(ref.providerId)
  try {
    return await p.chat(req, onToken)
  } catch (e) {
    // Drop optional features some models reject, then retry once.
    if (e instanceof UserError && e.code === 'bad_request') {
      if (req.temperature !== undefined && /temperature/i.test(e.message))
        return p.chat({ ...req, temperature: undefined }, onToken)
      if (req.webSearch) {
        log.warn(`Retrying ${ref.modelId} without web search`)
        return p.chat({ ...req, webSearch: false }, onToken)
      }
    }
    throw e
  }
}

/**
 * Run one AI step for a task: picks the assigned model (then the fallback), applies the
 * budget guard, validates structured output with zod (one repair request on failure), and
 * logs usage.
 */
export async function runChat<S extends z.ZodType | undefined = undefined>(
  opts: RunChatOpts<S>,
  ctx: TaskContext = {}
): Promise<RunChatResult<S extends z.ZodType ? z.infer<S> : undefined>> {
  const refs = resolveModels(opts.task, ctx)
  const jsonSchema = opts.schema ? jsonSchemaOf(opts.schema) : undefined
  let lastErr: unknown
  for (const ref of refs) {
    if (ctx.signal?.aborted) throw new CancelledError()
    const promptText =
      typeof opts.prompt === 'string' ? opts.prompt : JSON.stringify(opts.prompt).slice(0, 20000)
    budgetGuard(ref, ctx, estTokens((opts.system ?? '') + promptText), opts.maxOutputTokens ?? 2000)
    const req: ChatRequest = {
      model: ref.modelId,
      system: opts.system,
      messages: [...(opts.history ?? []), { role: 'user', content: opts.prompt }],
      jsonSchema,
      webSearch: Boolean(opts.webSearch && modelSupports(ref, 'webSearch')),
      maxOutputTokens: opts.maxOutputTokens,
      temperature: opts.temperature,
      signal: ctx.signal
    }
    try {
      const r = await callOnce(ref, req, opts.onToken)
      logUsage(ref, opts.task, ctx, r.usage, 0, r.costUsd)
      let data: unknown = undefined
      if (opts.schema) {
        let parsed = opts.schema.safeParse(r.json)
        if (!parsed.success) {
          log.warn(
            `Invalid JSON from ${ref.modelId}; sending repair request`,
            parsed.error.issues.slice(0, 5)
          )
          const repair = await callOnce(ref, {
            ...req,
            webSearch: false,
            messages: [
              ...req.messages,
              { role: 'assistant', content: r.text || '(empty)' },
              {
                role: 'user',
                content: `Return only valid JSON matching this schema:\n${JSON.stringify(jsonSchema)}`
              }
            ]
          })
          logUsage(ref, opts.task, ctx, repair.usage, 0, repair.costUsd)
          parsed = opts.schema.safeParse(repair.json)
          if (!parsed.success)
            throw new UserError(
              `The AI model (${ref.modelId}) didn't return its answer in the expected format, even after a second try. Try again, or pick a stronger model for this task in Settings > AI Models.`,
              'bad_json'
            )
        }
        data = parsed.data
      }
      return { text: r.text, data: data as never, citations: r.citations ?? [], model: ref }
    } catch (e) {
      if (isAbort(e) || ctx.signal?.aborted) throw new CancelledError()
      if (e instanceof BudgetPauseError) throw e
      lastErr = e
      log.warn(`Model ${ref.providerId}/${ref.modelId} failed for ${opts.task}; trying fallback if any`, e)
    }
  }
  throw lastErr instanceof Error ? lastErr : new UserError('The AI request failed. Try again.')
}

export async function runImage(
  prompt: string,
  size: string,
  n: number,
  ctx: TaskContext = {}
): Promise<{ images: Buffer[]; model: ModelRef }> {
  const refs = resolveModels('imageGen', ctx)
  let lastErr: unknown
  for (const ref of refs) {
    const p = getProvider(ref.providerId)
    if (!p.generateImage) continue
    budgetGuard(ref, ctx, 0, 0, n)
    try {
      const r = await p.generateImage({ model: ref.modelId, prompt, size, n, signal: ctx.signal })
      logUsage(ref, 'imageGen', ctx, { inputTokens: 0, outputTokens: 0 }, r.images.length, r.costUsd)
      return { images: r.images, model: ref }
    } catch (e) {
      if (isAbort(e) || ctx.signal?.aborted) throw new CancelledError()
      if (e instanceof BudgetPauseError) throw e
      lastErr = e
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new UserError(
        'No image model is connected. Connect a provider with image generation (OpenAI, Gemini, xAI or OpenRouter) in Settings > AI Models.'
      )
}
