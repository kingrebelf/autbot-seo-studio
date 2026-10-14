# Autbot SEO Studio

## What it is

Autbot SEO Studio is a free, open-source desktop app for Windows, macOS and Linux that lets a small-business owner run their own SEO content system. You connect the AI you already pay for (or a free local one), and the app does the research, planning, writing, checking and image work while you steer and approve.

![Screenshot: the Home dashboard with drafts waiting for review and keyword trends](docs/images/dashboard.png)
*(Screenshot placeholder. The image will be added once the interface is final.)*

## Who it's for

- **Small-business owners** who want to run their own SEO instead of paying an agency: a bakery, a dental office, a landscaper, a law firm, an online store, a plumber.
- **Builders** who want to fork it, add a provider, or adapt it for their clients. The code is MIT-licensed.

## Download

Get the latest installer from the **[Releases page](https://github.com/kingrebelf/autbot-seo-studio/releases/latest)**.

- **Windows:** download the `.exe` and run it. Windows SmartScreen may say "Windows protected your PC" because the app isn't code-signed. Click **More info**, then **Run anyway**.
- **macOS (Apple Silicon):** download the `.dmg`, open it, and drag the app to Applications. The app isn't signed with an Apple certificate, so the first time you open it macOS says it's from an "unidentified developer" (or "can't be checked for malicious software"). To open it:
  1. Try to open the app once, then click **Done** (or **OK**).
  2. Open **System Settings > Privacy & Security**, scroll down, and click **Open Anyway** next to the message about Autbot SEO Studio.
  3. Confirm with **Open**. You only need to do this once.

  On older macOS versions you can instead right-click (or Control-click) the app in Applications, choose **Open**, then click **Open** again. If macOS says the app "is damaged and can't be opened", open the Terminal app and run `xattr -cr "/Applications/Autbot SEO Studio.app"`, then open it again. This removes the "downloaded from the internet" flag; it doesn't change the app.
- **Linux:** download the `.AppImage`, make it executable (right-click > Properties > Allow executing, or `chmod +x Autbot*.AppImage`), and double-click it. On Debian or Ubuntu you can install the `.deb` instead: `sudo apt install ./autbot-seo-studio_*.deb`. The app stores keys in your system keyring, so you need GNOME Keyring or KWallet installed and unlocked (most desktops have one).

Intel Macs: the release only includes an Apple Silicon build for now. You can build your own from source (see below).

## Connect your AI

Consumer chat subscriptions are not all usable by outside apps. This table was accurate as of October 2026. Provider rules change, so check [docs/CONNECT-AI.md](docs/CONNECT-AI.md) for the latest notes and step-by-step instructions for each one.

| Provider | Use your chat subscription in this app? | How this app connects |
|---|---|---|
| **ChatGPT (OpenAI)** | **Yes**, for eligible Plus and Pro plans, through OpenAI's official "Sign in with ChatGPT" for open-source apps. Usage counts against the plan's limits. | "Sign in with ChatGPT" button, **or** an OpenAI API key |
| **Claude (Anthropic)** | **No.** Anthropic's terms only allow Free/Pro/Max logins inside Claude's own apps and Claude Code. Using them in other apps breaks their terms. | Anthropic API key (pay-as-you-go from the Claude Console) |
| **Gemini (Google)** | **No.** Google says using Gemini CLI / Google AI Pro logins in third-party software violates its terms. | Gemini API key from Google AI Studio (has a free tier) |
| **Grok (xAI)** | **Not supported in this app yet.** Some partner apps offer SuperGrok sign-in, but xAI hasn't published it as an open program for any developer. | xAI API key |
| **Muse Spark (Meta)** | **No subscription link.** Meta offers Muse Spark through its Meta Model API (developer preview, US accounts at launch). | Meta Model API key |
| **Local models** | Free, private, runs on your computer. | Ollama or LM Studio (no key) |
| **OpenRouter** | One key, hundreds of models from all the companies above. | OpenRouter API key |

You can also connect any **custom OpenAI-compatible endpoint** (name, address, and an optional key).

The app only uses official API keys and official sign-in programs. It never copies logins from other apps or scrapes chat websites.

## Your first piece of content in 10 minutes

1. **Install and open the app** (see Download above).
2. **Tell it about your business.** The first-run setup asks for your business name, website, what you sell, where you serve, your main services, your tone of voice, and anything the AI must never say or promise.
3. **Connect an AI.** Paste an API key and click **Test**, click **Sign in with ChatGPT**, or start Ollama or LM Studio on your computer. See [docs/CONNECT-AI.md](docs/CONNECT-AI.md).
4. **Check your models.** The app picks a model for each task (research, writing, fact-checking and so on). You can change any of them later in **Settings > AI Models**.
5. **Choose where content goes.** Connect WordPress with an application password ([docs/CONNECT-WORDPRESS.md](docs/CONNECT-WORDPRESS.md)), or pick **Export files** to get a ready-to-paste file set for Wix, Squarespace, Shopify, Webflow or a static site.
6. **(Optional) Connect Google Search Console** so the app can see what you already rank for ([docs/CONNECT-GOOGLE.md](docs/CONNECT-GOOGLE.md)). You can skip this and do it later.
7. **Go to New Content** and click **"I have a topic in mind."** Type something your customers search for, like "spring lawn aeration" or "dental implants cost".
8. **Pick a direction.** The app shows keyword options, what competitors cover, and its recommendation. Choose a keyword, the type of page, and the length.
9. **Review the brief**, answer any "facts I need from you" questions (prices, warranties, years in business), and click **Write it**.
10. **Check the draft.** Look at the SEO score, fix anything flagged, tick off the claims to verify, then tick the review checklist and click **Send to WordPress as Draft** (or **Export**). Open the draft in WordPress, read it once more, and publish it yourself.

For a slower, step-by-step walkthrough, see [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md).

## What it costs to run

- **The app is free.** No subscription, no account, no paid tier.
- **You pay your AI provider directly**, at their prices (or through your ChatGPT plan's limits). With local models through Ollama or LM Studio, AI costs nothing.
- **Optional data services** cost whatever they charge: DataForSEO (pay-as-you-go keyword volumes and rank checks), Serper.dev or Brave Search (search results; free tiers available). Google Search Console, Bing Webmaster Tools, Google Autocomplete suggestions and IndexNow are free.
- **Settings > Usage & Costs** shows what you've spent by provider, model, task and site. You can set a monthly budget cap per site; the app pauses and asks before going over it.

## Safety

- **Drafts only.** The app never publishes to your live website. WordPress posts are always created as drafts, and the code is written so it cannot send any other status. Refreshing an existing page creates a separate "[Refresh]" draft; your live page is never changed. A human always clicks publish.
- **Keys stay on your computer.** API keys, passwords and sign-in tokens are encrypted with your operating system's secure storage and kept in a separate file in the app's data folder. They are never stored in the database, never written to logs, and never included in backups or exports. Each key is only ever sent to the provider it belongs to.
- **No tracking.** No telemetry, no analytics, no phoning home. The app only talks to the services you connect, your own website, the links in your drafts (to check they still work), Google Autocomplete suggestions (on by default; turn it off in **Settings > Data Sources**), and, when you check for updates, the GitHub Releases page for this app.
- **The AI doesn't invent numbers.** If no data source provides search volume, the app says "Volume: unknown" and labels any judgment as an "AI estimate".
- **You check the facts.** Anything the AI doesn't know about your business becomes a `[CONFIRM: ...]` placeholder that blocks sending until you fill it in or dismiss it. Health, legal and financial topics get an extra warning.

## Build from source / contribute

You need [Node.js 22](https://nodejs.org) and Git.

```bash
git clone https://github.com/kingrebelf/autbot-seo-studio.git
cd autbot-seo-studio
npm install        # installs dependencies and rebuilds native modules for Electron
npm run dev        # starts the app with hot reload
npm run dev:mock   # same, with AUTBOT_DEV=1: shows the Mock provider (canned replies, no keys needed)
npm test           # unit tests (Vitest, run inside Electron's Node) + Electron smoke test (Playwright)
npm run lint       # ESLint + Prettier check
npm run typecheck  # TypeScript strict mode, main and renderer
npm run build      # typecheck + electron-vite build + installers for your current OS (in release/<version>/)
```

On Linux, the smoke test needs a display. On a headless machine use `xvfb-run -a npm test`.

Useful pointers:

- **Add an AI provider:** [docs/ADD-A-PROVIDER.md](docs/ADD-A-PROVIDER.md).
- **Why things are the way they are:** [DECISIONS.md](DECISIONS.md).
- **Rename a fork:** change `APP_NAME` in `src/shared/constants.ts` (and `productName` in `package.json` and `electron-builder.yml`).
- **Releases:** pushing a tag like `v1.2.0` runs `.github/workflows/release.yml`, which builds Windows, macOS and Linux installers and attaches them to a GitHub Release.
- **Bugs:** please use **Settings > About > Export logs** and attach the file to your issue. Secrets are redacted from it. Never paste API keys into an issue.

### Ideas for contributors

These are out of scope for version 1. Pull requests are welcome:

- Auto-publishing on a schedule. (Deliberately left out: a human publishes. A contribution here would need to keep that choice with the owner.)
- Google Business Profile posts.
- Social media post generation from each article.
- Multi-user/team accounts and cloud sync.
- Shopify, Webflow, Ghost and Wix direct publishing. (The file-set export covers them for now.)
- Translation into multiple languages per site.
- Additional subscription sign-ins, if providers officially open them to open-source apps.

## Credits

Made by Autbot. Companion to the book *Fire the Agency* and the Fire the Agency Playbook.

## License

MIT. See [LICENSE](LICENSE).
