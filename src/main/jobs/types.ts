export interface JobCtx {
  jobId: number
  siteId: number | null
  contentId: number | null
  signal: AbortSignal
  input: Record<string, unknown>
  output: Record<string, unknown>
  /** Update the job's visible step/progress line. */
  progress(step: string, message?: string): void
  /** Stream writing tokens to the editor. */
  token(chunk: string): void
  /** Persist part of the output now (so work survives a restart). */
  save(patch: Record<string, unknown>): void
  budgetOverride: boolean
}

export type JobResult =
  | { status: 'done'; output?: Record<string, unknown> }
  | { status: 'waiting_for_user'; step: string; output?: Record<string, unknown> }

export type JobHandler = (ctx: JobCtx) => Promise<JobResult>
