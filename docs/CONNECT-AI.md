# Connect your AI

Autbot SEO Studio doesn't come with an AI of its own. You connect one you already have, or a free local one. You only need one to get started. Connecting two or more lets the app use a different model for fact-checking than for writing, which gives you a second opinion.

All AI connections live in **Settings > AI Models** (and step 2 of the first-run setup). Each provider has a card with:

- a status dot: **Connected**, **Not connected**, or **Error**
- a **Get a key** link that opens the provider's official page in your browser
- a password field for the key (or a sign-in button)
- a **Test** button, which checks the connection and loads the provider's list of models
- a **Disconnect** button, which deletes the stored key from your computer

Keys and sign-in tokens are encrypted with your operating system's secure storage (Keychain on macOS, the Data Protection API on Windows, GNOME Keyring or KWallet on Linux). They are never stored in the app's database, never written to the logs, and never included in backups. Each key is only sent to the provider it belongs to.

---

## About subscriptions

Consumer chat subscriptions are not all usable by outside apps. **This table was accurate as of October 2026.** It may have changed since then; check the provider's own terms if in doubt.

| Provider | Use your chat subscription in this app? | How this app connects |
|---|---|---|
| **ChatGPT (OpenAI)** | **Yes**, for eligible Plus and Pro plans, through OpenAI's official "Sign in with ChatGPT" for open-source apps. Usage counts against the plan's limits. | "Sign in with ChatGPT" button, **or** an OpenAI API key |
| **Claude (Anthropic)** | **No.** Anthropic's terms only allow Free/Pro/Max logins inside Claude's own apps and Claude Code. Using them in other apps breaks their terms. | Anthropic API key (pay-as-you-go from the Claude Console) |
| **Gemini (Google)** | **No.** Google says using Gemini CLI / Google AI Pro logins in third-party software violates its terms. | Gemini API key from Google AI Studio (has a free tier) |
| **Grok (xAI)** | **Not supported in this app yet.** Some partner apps offer SuperGrok sign-in, but xAI hasn't published it as an open program for any developer. | xAI API key |
| **Muse Spark (Meta)** | **No subscription link.** Meta offers Muse Spark through its Meta Model API (developer preview, US accounts at launch). | Meta Model API key |
| **Local models** | Free, private, runs on your computer. | Ollama or LM Studio (no key) |
| **OpenRouter** | One key, hundreds of models from all the companies above. | OpenRouter API key |

> **Provider rules change.** If a provider officially opens subscription sign-in to open-source apps, add it as a new auth method in `src/main/providers/` (see [ADD-A-PROVIDER.md](ADD-A-PROVIDER.md)).

The app only uses official API keys and official sign-in programs. It will never copy a login from another app (such as Claude Code, Gemini CLI or Codex CLI), read browser cookies, or scrape a chat website. Pull requests that do this will not be accepted.

**API keys cost money per use.** API accounts are billed separately from chat subscriptions. Most providers let you set a monthly spending limit on their website; it's a good idea to set one. Inside the app, **Settings > Usage & Costs** shows what you've spent, and each site can have a monthly budget cap.

---

## Which one should I pick?

- **You already pay for ChatGPT Plus or Pro:** try **Sign in with ChatGPT** first. If your plan isn't eligible, use an OpenAI API key.
- **You want the best writing and don't mind paying per use:** Anthropic Claude or OpenAI with an API key.
- **You want to start for free:** a Google Gemini key from AI Studio (free tier, with limits), or a local model with Ollama or LM Studio.
- **You want to try many models with one account:** OpenRouter.
- **You want images:** OpenAI (API key), Google Gemini, or xAI. Anthropic does not make images, and image generation is not offered through the ChatGPT plan sign-in.

---

## ChatGPT plan (Sign in with ChatGPT)

Uses OpenAI's official "Sign in with ChatGPT" program for open-source apps. Usage counts against your plan's limits; there's no separate bill.

1. In **Settings > AI Models**, find the **ChatGPT plan (Sign in with ChatGPT)** card and click **Sign in with ChatGPT**.
2. Your web browser opens on OpenAI's sign-in page. Sign in with the account that has your Plus or Pro plan and approve access for Autbot SEO Studio.
3. The browser shows "You are signed in". Close the tab and go back to the app.
4. The app runs a short test request. A green dot means it worked.

Good to know:

- The app listens for the sign-in reply on your own computer only (`127.0.0.1`). Nothing passes through any Autbot server; there isn't one.
- If you see **"Your ChatGPT plan isn't eligible for use in other apps. You can use an OpenAI API key instead."**, your plan or region isn't part of the program. Use an OpenAI API key (below) instead.
- If you see **"Your ChatGPT plan's limit for this app is used up..."**, wait for the limit to reset, or switch that task to another model in **Settings > AI Models**.
- Plan usage doesn't support some settings, such as temperature. The app leaves them out automatically.
- Image generation isn't available through the plan. For images, connect another provider.
- If sign-in expires, the app asks you to click **Sign in with ChatGPT** again. **Disconnect** removes the stored tokens.

## OpenAI (API key)

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys) (or click **Get a key** on the card) and sign in or create an account.
2. Add a payment method and some credit under **Billing**. New accounts can't use the API without it.
3. Click **Create new secret key**, give it a name like "Autbot SEO Studio", and copy the key. It starts with `sk-`. You can only see it once.
4. Paste it into the **OpenAI (API key)** card and click **Test**.

Gives you text, structured output, web search, image understanding, and image generation.

## Anthropic Claude (API key)

1. Go to [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) (the Claude Console) and sign in or create an account. This is separate from a Claude.ai chat subscription.
2. Add credit under **Billing**.
3. Click **Create Key**, name it, and copy it. It starts with `sk-ant-`.
4. Paste it into the **Anthropic Claude** card and click **Test**.

Gives you text, structured output, web search and image understanding. Claude does not generate images.

## Google Gemini (API key from AI Studio)

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and sign in with a Google account.
2. Click **Create API key**. If asked, pick or create a Google Cloud project.
3. Copy the key. It usually starts with `AIza`.
4. Paste it into the **Google Gemini** card and click **Test**.

Gemini has a free tier with lower limits. For heavier use, turn on billing for the project in AI Studio. Gives you text, structured output, Google Search grounding, image understanding, and image generation with Gemini image models.

## xAI Grok (API key)

1. Go to [console.x.ai](https://console.x.ai) and sign in or create an account.
2. Add credit, then open **API Keys** and create a key. Copy it (it starts with `xai-`).
3. Paste it into the **xAI Grok** card and click **Test**.

Gives you text, structured output, live search, image understanding and Grok image models. A SuperGrok subscription can't be used here (see the table above).

## Meta Muse Spark (Meta Model API key)

1. Go to [ai.developer.meta.com](https://ai.developer.meta.com/) and sign in. At launch, the Meta Model API is a developer preview for US accounts.
2. Create an API key and copy it.
3. Paste it into the **Meta Muse Spark** card and click **Test**.

The card also has the **base address** (prefilled with `https://api.meta.ai/v1`), the **auth header name** (default `authorization`) and the **auth value prefix** (default `Bearer `). Leave these alone unless Meta's documentation says otherwise. If Meta's model list can't be read, the app falls back to a short built-in list of model names and proves the key with a tiny test request.

## OpenRouter (API key)

1. Go to [openrouter.ai/keys](https://openrouter.ai/keys) and sign in.
2. Add credit, then click **Create Key** and copy it (it starts with `sk-or-`).
3. Paste it into the **OpenRouter** card and click **Test**.

One key gives you models from many companies. OpenRouter's model list includes prices, so cost tracking works out of the box. Web search is available through OpenRouter's search plugin on models that support it.

## Ollama (local, free)

Runs models on your own computer. Nothing leaves your machine. Local models are free and private, but usually slower and less accurate than the big online ones. A computer with 16 GB of memory or more helps.

1. Download and install Ollama from [ollama.com/download](https://ollama.com/download). Open it so it runs in the background.
2. Download a model. Open a terminal (Command Prompt on Windows, Terminal on Mac) and run `ollama pull` followed by a model name from [ollama.com/library](https://ollama.com/library). Pick a general chat model; a vision-capable model can also write image alt text.
3. In the **Ollama (local)** card, click **Test**. Your downloaded models appear.

If you see **"Ollama isn't running. Install it from ollama.com, then click Test."**, start Ollama and try again. If it says Ollama is running but has no models, do step 2. The default address is `http://127.0.0.1:11434`; change it on the card only if you run Ollama somewhere else.

## LM Studio (local, free)

1. Download LM Studio from [lmstudio.ai](https://lmstudio.ai) and install it.
2. In LM Studio, download a model from its search screen.
3. Start the local server: open the **Developer** (or **Local Server**) tab and click **Start Server**. Load a model.
4. In the **LM Studio (local)** card, click **Test**.

The default address is `http://127.0.0.1:1234/v1`. If the card says LM Studio isn't running, start its local server and click **Test** again.

## Custom OpenAI-compatible endpoint

For any other service or server that speaks the OpenAI API (for example a company AI gateway, vLLM, or another hosted service).

1. In **Settings > AI Models**, add a **Custom OpenAI-compatible endpoint**. You can add as many as you like.
2. Give it a **Name** you'll recognise.
3. Enter the **base address**, including the version part, for example `https://my-server.example.com/v1`. The app adds `/models` and `/chat/completions` to it.
4. Paste a **key** if the service needs one (it's optional).
5. Click **Test**.

## Mock provider (developers only)

When the app is started with `AUTBOT_DEV=1` (for example `npm run dev:mock`), a **Mock provider** card appears. It returns canned replies so you can try every screen without a key. It's hidden in normal use.

---

## After connecting

- **Models:** after a successful Test, the app loads the provider's current model list. It never relies on hardcoded model names. Embedding, audio, moderation and old models are hidden; turn on **Show all models** to see them. Click **Refresh models** any time.
- **Capabilities:** each model is tagged with what it can do (text, structured output, images in, images out, web search, long documents). Tags come from the provider where it says, otherwise from simple name rules. You can override any tag in Settings.
- **Tasks:** the app assigns a model to each task (research, writing, SEO pass, fact-check, image generation, image descriptions, quick tasks) and a fallback model if one is available. If a model fails, the app tries the fallback, then shows a plain-English error. Change any of these in **Settings > AI Models**.
- **Per piece:** in the New Content wizard, the **Advanced** toggle lets you pick a different model for just that piece.
- **Prices:** prices per million tokens are filled in where the provider publishes them. You can edit them in **Settings > Usage & Costs** so spending estimates match your account.

## Common problems

| Message says | What to do |
|---|---|
| "...didn't accept your key or sign-in" | Copy the whole key again with no spaces, or create a new key, then click **Test**. |
| "...out of credit or over its quota" | Add credit or raise your limit on the provider's website, or switch the task to another model. |
| "...getting too many requests right now" | Wait a minute and try again. The app already retries a few times on its own. |
| "...couldn't find that model" | Click **Refresh models** and pick a model from the list. |
| "...secure key storage isn't available" (Linux) | Install and unlock a keyring such as GNOME Keyring or KWallet, then restart the app. |
