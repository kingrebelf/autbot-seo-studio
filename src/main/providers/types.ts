import type { Capability } from '@shared/types'
export type { Capability }

export interface ModelInfo {
  id: string // provider's model id
  label: string // display name
  capabilities: Capability[]
  contextWindow?: number
  inputPricePerMTok?: number // USD, if known (user-editable in Settings > Usage & Costs)
  outputPricePerMTok?: number
  pricePerImage?: number
  /** Hidden by default (embedding, audio, moderation, deprecated...). */
  hidden?: boolean
}

export type ContentPart =
  { type: 'text'; text: string } | { type: 'image'; mimeType: string; dataBase64: string }

export interface ChatRequest {
  model: string
  system?: string
  messages: { role: 'user' | 'assistant'; content: string | ContentPart[] }[]
  jsonSchema?: object // when set, provider must return valid JSON matching it
  webSearch?: boolean // use the provider's built-in web search tool if it has one
  maxOutputTokens?: number
  temperature?: number // ignored by providers that don't support it
  signal?: AbortSignal
}

export interface ChatResult {
  text: string
  json?: unknown
  citations?: { url: string; title?: string }[]
  usage: { inputTokens: number; outputTokens: number }
  costUsd?: number
}

export interface ImageRequest {
  model: string
  prompt: string
  size: '1024x1024' | '1536x1024' | '1024x1536' | string
  n?: number
  signal?: AbortSignal
}

export interface AIProvider {
  id: string // 'openai', 'chatgpt-plan', 'anthropic', ...
  displayName: string
  authKind: 'apiKey' | 'oauth' | 'none'
  testConnection(): Promise<{ ok: boolean; message: string }>
  listModels(): Promise<ModelInfo[]>
  chat(req: ChatRequest, onToken?: (t: string) => void): Promise<ChatResult>
  generateImage?(req: ImageRequest): Promise<{ images: Buffer[]; costUsd?: number }>
}

/** Static description of a provider type, used to draw the Settings card. */
export interface ProviderMeta {
  id: string
  displayName: string
  authKind: 'apiKey' | 'oauth' | 'none'
  keyUrl?: string
  docsUrl?: string
  defaultBaseUrl?: string
  baseUrlEditable?: boolean
  keyOptional?: boolean
  local?: boolean
  devOnly?: boolean
  /** Custom endpoints can be added many times. */
  multi?: boolean
  blurb: string
  extraFields?: { key: string; label: string; placeholder?: string }[]
}

export interface ProviderConfig {
  connectionId: string
  baseUrl?: string
  apiKey?: string | null
  extra?: Record<string, unknown>
}
