# Add an AI provider

This guide is for contributors. It explains how to add a new AI provider (or a new way to sign in to an existing one) to Autbot SEO Studio.

Ground rules first:

- **Official access only.** Use the provider's official API keys or an official OAuth program they publish for third-party apps. Never copy tokens from another app (Claude Code, Gemini CLI, Codex CLI and so on), read browser cookies, or scrape a chat website. Pull requests that do this will be closed.
- **Never hardcode model names** in provider code, prompts or UI. Models come from the provider's list-models endpoint at runtime. The only place model names may appear is `src/main/providers/fallback-models.json` (see below).
- **Secrets go to their own provider only.** A key must only ever be sent to the host it belongs to. No telemetry.
- **Plain-English errors.** Every error a user can see must say what went wrong and what to do next.

All provider code lives in `src/main/providers/` and runs in the Electron main process. The renderer never sees keys and never makes network calls.

---

## 1. Implement `AIProvider`

The interface is in `src/main/providers/types.ts`:

```ts
export interface AIProvider {
  id: string // the connection id, e.g. 'anthropic' or 'custom-abc123'
  displayName: string
  authKind: 'apiKey' | 'oauth' | 'none'
  testConnection(): Promise<{ ok: boolean; message: string }>
  listModels(): Promise<ModelInfo[]>
  chat(req: ChatRequest, onToken?: (t: string) => void): Promise<ChatResult>
  generateImage?(req: ImageRequest): Promise<{ images: Buffer[]; costUsd?: number }>
}
```

Create `src/main/providers/<your-provider>.ts` with a class whose constructor takes a `ProviderConfig`:

```ts
export interface ProviderConfig {
  connectionId: string
  baseUrl?: string
  apiKey?: string | null // decrypted by the registry; never log it
  extra?: Record<string, unknown> // non-secret per-connection settings
}
```

What each method must do:

- **`testConnection()`** returns `{ ok, message }`; it should not throw. Check that a key is present (if needed), then make the cheapest real request that proves the key works (listing models is usually enough; if the model list is public or may come from the fallback file, send a tiny chat request instead, as `meta.ts` and `openrouter.ts` do). The `message` is shown on the Settings card.
- **`listModels()`** calls the provider's list-models endpoint and maps each model to `ModelInfo`: `id`, `label`, `capabilities`, and where known `contextWindow` and prices in USD per million tokens (`inputPricePerMTok`, `outputPricePerMTok`) or per image (`pricePerImage`). Set `hidden: true` for embedding, audio, moderation and deprecated models. Use the helpers in `capabilities.ts`:
  - `mergeCaps(reported, modelId)` combines what the provider reports with the name rules in `model-capabilities.json`.
  - `shouldHide(modelId)` applies the hide rules from the same file.
- **`chat(req, onToken)`**
  - Send `req.system` and `req.messages`. Messages may contain `ContentPart[]` with images (`{ type: 'image', mimeType, dataBase64 }`) for vision models.
  - If `req.jsonSchema` is set, use the provider's native structured-output mode when it has one (pass the schema through `strictSchema()` from `base.ts` if the mode is strict). Otherwise use `systemWithJson(req, false)` to append a "return only JSON" instruction. Either way, fill `ChatResult.json` with `parseJsonLoose(text)`. The caller (`runChat` in `src/main/ai.ts`) validates it with zod and sends one repair request if it doesn't match.
  - If `req.webSearch` is true and the provider has a built-in web search tool, turn it on and return the sources in `citations`.
  - Respect `req.maxOutputTokens`. Ignore `req.temperature` if the model doesn't support it.
  - Pass `req.signal` to every `fetch` so **Cancel** works.
  - Stream when you can and call `onToken(delta)` for each text delta. The writing step streams into the editor.
  - Return `usage: { inputTokens, outputTokens }`. Return `costUsd` only if the provider reports an exact cost (OpenRouter does); otherwise the app calculates it from the model's prices.
- **`generateImage(req)`** (optional): only add it if the provider can generate images. Return raw image `Buffer`s; the app converts them to WebP and resizes them.

Wrap errors with `providerError('<Name>', e)` from `base.ts`. It turns HTTP 401/403/404/429/400/5xx and network failures into plain-English `UserError`s with a next step. Throw your own `UserError` (from `src/main/errors.ts`) for provider-specific cases, like `ollama.ts` does for "Ollama isn't running".

### Use the shared helpers

You rarely need to start from scratch:

| If the provider... | Reuse |
|---|---|
| speaks OpenAI's **Responses API** | `responsesChat`, `openaiImages`, `listOpenAIStyleModels` in `openai-responses.ts` (used by OpenAI, ChatGPT plan, xAI and Meta) |
| speaks OpenAI's **Chat Completions API** | `OpenAICompatibleProvider` in `openai-compatible.ts` (used by OpenRouter, LM Studio and custom endpoints); subclass it like `openrouter.ts` |
| has its own API | write the HTTP calls yourself, like `anthropic.ts`, `gemini.ts` or `ollama.ts` |

For HTTP, use `fetchWithRetry` / `fetchJson` from `src/main/http.ts`. They add a timeout, cancellation through `signal`, and exponential backoff on 429 and 5xx (up to 4 tries, honouring `retry-after`), and throw `HttpError` for other non-2xx responses. Use `readSSE` for server-sent-event streams and `readNDJSON` for newline-delimited JSON streams.

### OAuth providers

If the provider has an official OAuth program for third-party apps, follow `openai-chatgpt-plan.ts` and `src/main/indexing/gsc.ts`:

- Start the loopback listener with `startLoopback()` from `src/main/oauth.ts` **before** opening the browser. It listens on `127.0.0.1` (never `localhost`).
- Use PKCE (`pkce()`), a random `state`, and (for OpenID Connect) a `nonce`; verify them on the callback.
- Open the browser with `rt().openExternal(url)`.
- Store tokens with `setSecretJson()` from `src/main/secrets.ts`, refresh them automatically, and clear them when the refresh token is rejected.
- Add an IPC route for the sign-in button (see `providers.signInChatGPT` in `src/main/ipc/providers.ts`).

## 2. Register it

Open `src/main/providers/registry.ts`.

**a. Add a `ProviderMeta` entry to `PROVIDER_METAS`.** This drives the Settings card:

```ts
{
  id: 'acme',                         // provider type id, used in build() below
  displayName: 'Acme AI',
  authKind: 'apiKey',                 // 'apiKey' | 'oauth' | 'none'
  keyUrl: 'https://console.acme.example/keys', // the official "Get a key" page
  docsUrl: 'https://docs.acme.example',        // optional
  defaultBaseUrl: 'https://api.acme.example/v1', // optional
  baseUrlEditable: false,             // show an editable address field
  keyOptional: false,                 // key field may be left empty
  local: false,                       // runs on the user's computer
  multi: false,                       // can be added more than once (like custom endpoints)
  devOnly: false,                     // only visible with AUTBOT_DEV=1
  blurb: 'One plain sentence about cost and what it can do.',
  extraFields: []                     // extra non-secret fields: { key, label, placeholder }
}
```

Values from `extraFields` end up in `ProviderConfig.extra`. Never put secrets there: `extra` is stored in the database. The API key is stored separately, encrypted with Electron `safeStorage`, and decrypted by `getProvider()` when your class is built.

**b. Add a case to `build()`:**

```ts
case 'acme':
  return new AcmeProvider(cfg)
```

That's all the wiring. Saving the key, Test, Disconnect, model refresh, the model table, capability overrides, task auto-fill and usage logging are handled by the registry and `src/main/ai.ts`.

## 3. Capabilities: `model-capabilities.json`

`src/main/providers/model-capabilities.json` holds simple, editable rules that tag models by name when the provider's model list doesn't say what a model can do:

```json
{ "pattern": "image|dall-e|imagen", "add": ["imageGen"], "remove": ["json", "webSearch", "toolUse"] }
```

- `pattern` is a case-insensitive regular expression matched against the model id.
- `add` / `remove` change the capability set. Capabilities are `text`, `json`, `vision`, `webSearch`, `imageGen`, `longContext`, `toolUse`.
- `hide: true` hides matching models by default (users can turn on **Show all models**).
- Rules run in order, so later rules can undo earlier ones.

If your provider's model ids follow a new naming scheme, add or extend a pattern here rather than special-casing names in code. Prefer the provider's own metadata when it has any (Ollama's `/api/show` and OpenRouter's model list do). Users can override any capability flag per model in **Settings > AI Models**.

Tasks pick models by capability (see `TASKS` in `src/shared/types.ts`): research, SEO and fact-check need `text` + `json`, image generation needs `imageGen`, image descriptions need `vision`.

## 4. Fallback models: `fallback-models.json`

`src/main/providers/fallback-models.json` is **the only place model names are hardcoded**. Use it only if the provider's list-models endpoint is missing or unreliable:

```json
{
  "meta": ["..."],
  "acme": ["acme-large", "acme-small"]
}
```

Read it in `listModels()` as a last resort (see `meta.ts`), and log a warning when you do. Keep the list short and easy to update.

## 5. Test it

- Add unit tests in `tests/unit/`. The shared harness in `tests/unit/helpers.ts` gives you a temporary data folder, a stand-in cipher for secrets, and a `fetch` stub so no test touches the network. Test at least: the request body your provider sends (including JSON mode and web search), parsing of a streamed reply, `listModels()` mapping, and that a 401 becomes a plain-English error.
- The secret-scanning test checks that no key ends up in the database, logs, exports or backups. Make sure yours doesn't either: don't put keys in URLs if the provider accepts a header, and never pass them to `log.*`.
- Run `npm run lint`, `npm run typecheck` and `npm test`.
- Try it for real with `npm run dev`: connect, **Test**, **Refresh models**, assign the model to a task, and run Mode A end to end.
- For quick UI work without keys, `npm run dev:mock` shows the Mock provider (`mock.ts`).

## 6. Document it

- Add a section to `docs/CONNECT-AI.md`: where to get a key (link the official page), what it costs, what it can do, and common errors.
- If it's a new **subscription** sign-in, update the "About subscriptions" table in `docs/CONNECT-AI.md` and the README, with the date.
- If you made a judgement call (for example, the provider's docs were unclear), add an entry to `DECISIONS.md`.
