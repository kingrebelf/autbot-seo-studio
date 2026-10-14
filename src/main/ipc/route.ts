import { z } from 'zod'

export interface Route<I extends z.ZodType, O> {
  input: I
  handler: (input: z.infer<I>) => Promise<O> | O
}

/** Define one IPC route: a zod schema for its input and the handler. */
export function route<I extends z.ZodType, O>(
  input: I,
  handler: (input: z.infer<I>) => Promise<O> | O
): Route<I, O> {
  return { input, handler }
}

export const none = z.undefined().optional()
export const siteIdInput = z.object({ siteId: z.number().int().positive() })
export const idInput = z.object({ id: z.number().int().positive() })
