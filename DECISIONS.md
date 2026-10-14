# Decisions

Where the build spec was unclear, or where the real world didn't match it, we picked the simplest option that works for a non-technical small-business owner and wrote it down here. Each entry says what we chose and why. Newest entries go at the bottom of their section.

---

## Platform and build

### Electron pinned to ~42.11.14 and better-sqlite3 to ~12.11.1
*2026-10-14*

The spec asks for "Electron (latest stable)". We pin Electron with a tilde (`~42.11.14`) and better-sqlite3 to `~12.11.1` because that pair has **prebuilt native binaries**. Building better-sqlite3 from source needs Electron's headers and a C++ toolchain, which fails on many contributor machines and makes CI slow and fragile. `npm install` runs `electron-builder install-app-deps`, which downloads the matching prebuilt binary. Upgrade both together, and only to versions that have prebuilds.

### Unit tests run under Electron-as-Node
*2026-10-14*

Native modules are compiled for one runtime ABI. After `install-app-deps`, better-sqlite3 is built for Electron, so it won't load in plain Node. `npm run test:unit` runs Vitest through `scripts/run-electron-node.cjs`, which starts Electron's bundled Node with `ELECTRON_RUN_AS_NODE=1`. Tests then load exactly the same native binaries the app ships with. Electron-specific APIs (safeStorage, dialogs, notifications, shell) are injected through `src/main/runtime.ts`, so the main-process code runs in tests with stand-ins (for example a reversible fake cipher in `tests/unit/helpers.ts`).

### Packaging with electron-builder; unsigned installers; no auto-update
*2026-10-14*

- Windows: NSIS installer (`.exe`), not one-click, so users can choose the install folder.
- macOS: `.dmg`, **unsigned** (`identity: null`). We don't have an Apple Developer certificate and the spec allows unsigned builds. The README explains "Open Anyway" in Privacy & Security, and the `xattr -cr` fallback for when macOS reports an unsigned download as "damaged".
- Linux: `.AppImage` and `.deb`, category Office. The `.deb` recommends `gnome-keyring`, because Electron's safeStorage needs a keyring on Linux.
- `publish: null`: no auto-update. **Settings > About > Check for updates** reads the GitHub Releases API and shows a download link. It never downloads or installs anything (spec 13).
- Native modules (`better-sqlite3`, `sharp`, `@img/*`) are unpacked from the asar archive so the OS can load them.
- `build/icon.png` is listed in `files` because the main process sets the window icon from that path; electron-builder doesn't pack the build-resources folder by default.

### Release builds: x64 on Windows and Linux, Apple Silicon on macOS
*2026-10-14*

The release workflow builds on GitHub's `windows-latest`, `macos-latest` and `ubuntu-latest` runners, each for its own architecture. `macos-latest` is Apple Silicon, so the `.dmg` is arm64 only. Cross-building an Intel Mac build from an arm64 runner would need sharp's x64 binaries, which `npm ci` doesn't install on arm64. Intel Mac users can build from source. Each job runs `npm ci`, `npm run typecheck`, `electron-vite build`, then `electron-builder --<platform> --publish never`, and `softprops/action-gh-release@v2` attaches the `.exe`, `.dmg`, `.AppImage` and `.deb` to the release for the tag. Tags containing a hyphen (for example `v1.1.0-beta.1`) are marked as pre-releases.

### CI on Linux only, with xvfb
*2026-10-14*

`.github/workflows/ci.yml` runs lint, typecheck and `xvfb-run -a npm test` (unit tests plus the Electron smoke test) on Ubuntu for every push and pull request. The smoke test launches a real Electron window, so it needs a virtual display. Ubuntu 24.04 blocks the unprivileged user namespaces Chromium's sandbox uses, so CI relaxes that AppArmor setting first. Windows and macOS are exercised by the release workflow.

### Icons generated from one SVG
*2026-10-14*

`build/icon.svg` is the source. `npm run icons` (`scripts/make-icons.cjs`) renders it with sharp and writes `build/icon.png` (1024), `build/icon.ico` (PNG-compressed entries at 16, 32, 48, 64, 128, 256) and `build/icon.icns` (PNG entries ic07 to ic10, 128 to 1024), plus a copy at `resources/icon.png`. We write the ICO and ICNS containers ourselves so no extra icon tool is needed. The mark is a neutral rising-bar chart with an upward arrow, so forks can reuse or replace it easily.

### Database migrations bundled as raw SQL
*2026-10-14*

Drizzle Kit generates SQL migrations into `src/main/db/migrations/` (`npm run db:generate`). Instead of shipping the migrations folder as loose files and finding it at runtime (which differs between dev, asar and each OS), `src/main/db/migrate.ts` imports them with Vite's `import.meta.glob('...?raw')`, so they're compiled into the main bundle. A small runner applies each pending migration in its own transaction and records it in a `__migrations` table.

### One constant for the app name
*2026-10-14*

`APP_NAME`, `APP_ID` and `GITHUB_REPO` live in `src/shared/constants.ts`. Forks change those (plus `productName` in `package.json` and `electron-builder.yml`). The repo is `kingrebelf/autbot-seo-studio`; update checks and issue links use it.

---

## Security and privacy

### Single typed IPC channel, validated with zod
*2026-10-14*

Instead of one `ipcMain.handle` per feature, the main process registers one channel (`api`) that takes a route name and an input. Every route is declared in `src/main/ipc/*.ts` with a zod schema for its input. `dispatch()` validates the input, runs the handler, and turns any error into `{ ok: false, error }` with a plain-English message (stack traces go to the log file, never the UI). The preload bridge exposes this as `window.api.*`, and the renderer's types are derived from the route table, so a typo in a route name or input is a compile error. One channel means there is exactly one place where untrusted input enters the main process.

The window uses `contextIsolation: true`, `nodeIntegration: false` and `sandbox: true`. Links open in the user's browser; navigation away from the app is blocked. Only one copy of the app can run at a time.

### Secrets in a safeStorage-encrypted file, never in SQLite
*2026-10-14*

API keys, OAuth tokens, the WordPress application password, data-source keys and the Google client secret are encrypted with Electron `safeStorage` (the OS keychain) and stored in `secrets.bin.json` in the data folder, written atomically with owner-only permissions. The database only stores a reference (`secret_ref`) to each one. Reasons:

- Backups (zip of database + images) and exports can never contain a secret, because secrets aren't in either.
- A user who shares their database for a bug report doesn't leak keys.
- The ciphertext is tied to this computer's keychain, so a copied file is useless elsewhere.

If secure storage isn't available (some Linux setups without a keyring), the app refuses to save the key and says how to fix it, rather than storing it in plain text. Backups say clearly that keys must be reconnected after a restore.

### Logs redact secrets
*2026-10-14*

Every secret the app decrypts is registered with the logger, and every log line is scrubbed of those exact values plus common key and token patterns (`sk-...`, `sk-ant-...`, `xai-...`, `AIza...`, `Bearer ...`, `access_token=...` and so on). At start-up the app decrypts all stored secrets once so redaction works from the first line. **Export logs** runs the same redaction again. The log rotates at 5 MB.

### No telemetry
*2026-10-14*

The app sends nothing to Autbot or anyone else. Network calls go only to the services the user connects, the user's own website, links inside drafts (to check they work), Google Autocomplete suggestions (on by default, can be turned off, rate-limited to 1 request per second), IndexNow (when a key is set), and the GitHub Releases API when the user checks for updates. There is no analytics library and no crash reporter.

### Local images served through a custom `autbot-media://` protocol
*2026-10-14*

Images live in the data folder, outside the app bundle. With `sandbox: true` and a strict Content-Security-Policy, the renderer can't load `file://` paths, and we don't want to expose arbitrary files. The main process registers a privileged `autbot-media://` scheme that only serves images by their database id. Draft HTML stores images as `autbot-media://<id>`. When sending to WordPress the app swaps in the uploaded media URLs, and when exporting it rewrites them to `images/<seo-filename>`.

---

## AI providers

### Sign in with ChatGPT, per developers.openai.com/siwc
*2026-10-14*

Implemented as documented (spec 5.3.1): loopback redirect on `127.0.0.1` with the listener started before the browser opens, PKCE S256 with `state` and `nonce`, `client_id=dynamic_agent_client` with `ext_agent_host_id` and `agent_name_hint` on first sign-in, then the issued `oaiapp_...` client id saved in the connection row and reused (with `id_token_hint` and `login_hint`). Details we added or chose:

- The id token's signature is verified against OpenAI's published keys (JWKS), and its issuer, audience, expiry and nonce are checked.
- `ext_agent_host_id` is a random UUID per installation, saved with the connection.
- The loopback tries port 1455 first and falls back to any free port (only the port may change between sign-ins).
- Before any request, the app checks the granted scopes include `chatgpt.tokens.use.direct`. If not, it shows: "Your ChatGPT plan isn't eligible for use in other apps. You can use an OpenAI API key instead." The plan's documented error codes map to plain-English messages, including the "limit is used up" message from the spec.
- Requests use the Responses API only, with `store: false`, and temperature is dropped. Usage is logged with a cost of $0 because it counts against the plan, not a bill.
- Refresh tokens rotate; the app replaces all tokens together. If a refresh is rejected, it clears the tokens (keeping the issued client id) and asks the user to sign in again.
- **Image generation through the plan is not listed as supported** in the docs at build time, so the provider has no `generateImage`. The Images task needs another provider.

### Shared clients for OpenAI-shaped APIs
*2026-10-14*

OpenAI (API key), the ChatGPT plan, xAI and Meta all speak OpenAI's Responses API, so they share `openai-responses.ts`. OpenRouter, LM Studio and custom endpoints speak Chat Completions and share `openai-compatible.ts`. Anthropic, Gemini and Ollama have their own clients. This keeps each provider file small.

### Meta Model API defaults
*2026-10-14*

The Meta card is prefilled with `https://api.meta.ai/v1`, an `authorization` header and a `Bearer ` prefix (OpenAI-compatible, Responses API, per Meta's docs at build time). All three are editable on the card in case Meta changes them. If Meta's model list can't be read, the app uses the short list in `fallback-models.json`, so the connection test also sends a tiny chat request to prove the key works.

### Model names live only in JSON config
*2026-10-14*

Model lists come from each provider's list-models endpoint. Capabilities come from provider metadata where available, otherwise from name patterns in `src/main/providers/model-capabilities.json`. The only hardcoded model names are in `src/main/providers/fallback-models.json` (Meta and the Mock provider). Users can override any capability flag per model.

### Structured output that works everywhere
*2026-10-14*

Every AI output schema has all fields required (nullable where they may be empty), because strict JSON modes (OpenAI, xAI) reject optional fields. `strictSchema()` also strips keywords strict modes reject. Providers with no native JSON mode get a "return only JSON" instruction. Anthropic returns JSON through a forced tool call. Gemini can't always combine Google Search grounding with JSON mode, so when both are needed it grounds with search and asks for JSON in the prompt. Every result is validated with zod; on failure the app sends one repair request, then shows a plain-English error.

### Retrying without optional features
*2026-10-14*

Some models reject `temperature` (reasoning models) or web search. When a provider returns a "bad request" mentioning these, the app retries once without them, rather than failing the whole step. OpenAI reasoning models never get a temperature.

### Task auto-fill
*2026-10-14*

When a provider connects, each unassigned task gets the first connected provider's best model that has the needed capabilities: largest context window, with a bonus for preferred capabilities (web search for research and fact-check). SEO pass and quick tasks prefer the cheapest model by input price. Fact-check prefers a different model from Writing when one exists. A second suitable model becomes the fallback.

### Mock provider only in developer mode
*2026-10-14*

The Mock provider is only listed, saved or built when the app starts with `AUTBOT_DEV=1` (`npm run dev:mock`). The check is enforced in the registry, not just hidden in the UI.

---

## Jobs and background work

### Job queue: concurrency 2 for AI jobs, resume after restart
*2026-10-14*

Jobs are rows in SQLite. At start-up, any job still marked `running` (the app was closed or crashed) is reset to `queued` and picks up from its saved step; each step saves its output as it goes. At most 2 AI jobs run at once (Settings, `jobConcurrency`). Non-AI jobs (crawl, WordPress import and sync, Search Console pull, rank checks, index checks, link-back drafts) don't count toward the limit. Only one job runs per piece of content at a time, so two steps can't overwrite each other.

### Budget guard estimate
*2026-10-14*

Before each AI call, the app estimates cost as (prompt characters / 4) input tokens plus the requested output limit (default 2,000 tokens), priced from the model's price table. If that would take the site past its monthly cap, the job pauses as "waiting for you" and asks before continuing. It's an estimate, so it errs on the side of asking.

### Background schedule (only while the app is open)
*2026-10-14*

Using `node-cron` inside the app: WordPress status sync every 30 minutes; once a day (09:17 local time) a re-crawl if the last one is over a week old, a Search Console data pull and index checks; once a week (Monday 09:41) DataForSEO rank checks if the user turned them on. Shortly after start-up, the daily tasks and the WordPress sync also run once to catch up. Duplicate background jobs are never stacked.

---

## Publishing

### WordPress status hardcoded to draft
*2026-10-14*

Every post or page body goes through one function, `buildPostPayload()` in `src/main/publish/wordpress.ts`, which deletes any `status` passed in and sets `status: "draft"`. There is no code path that sends `publish`, `future` or `private`, and a unit test checks this. The app never updates an existing post's content.

### WordPress connection details
*2026-10-14*

- HTTPS is required (WordPress only allows application passwords over HTTPS); `http://localhost` and `127.0.0.1` are allowed for local testing.
- If `/wp-json/` is blocked or doesn't return JSON, the app retries automatically with `?rest_route=`.
- SEO plugin meta (Yoast, Rank Math, All in One SEO) is sent in the post's `meta` field. The app checks whether WordPress echoed the values back; if not, it shows the copy panel instead of claiming success.
- "Add schema to content" defaults to on when no SEO plugin is detected and off when one is, since the plugin adds its own.
- The site's "default author note" is added as an HTML comment at the top of the content, so it's visible to editors but not readers.
- Connecting WordPress also imports existing published posts and pages into the site's page list.

### Refresh mode never touches the live post
*2026-10-14*

Mode D creates a **separate** draft titled "[Refresh] <original title>", with a note at the top giving the original post ID and the list of changes. It doesn't set a slug, so it can't clash with the original. In Advanced, the user can choose to save the changes as an **autosave** (revision) of the original instead; WordPress keeps the live post unchanged until someone publishes that revision in its editor. The "add links from older pages" helper works the same way: new "[Refresh]" drafts or autosaves, never edits to live posts.

### Export formats
*2026-10-14*

The file-set export follows spec 8.2 exactly. The front-matter presets map to each generator's common fields (for example `permalink` for Jekyll and Eleventy, `pubDate` and `heroImage` for Astro). Exported HTML points images at `images/<seo-filename>`. When IndexNow is on, the export includes the key file so it can be uploaded with the page.

---

## Indexing and tracking

### Google indexing opens Search Console instead of calling an API
*2026-10-14*

Google doesn't allow requesting indexing for normal pages through any API; the Indexing API is only for job postings and livestream pages. So the app never calls it. It re-submits the sitemap (`sitemaps.submit`), runs the URL Inspection API to show index status, and offers a **Request indexing in Search Console** button that opens the URL Inspection page for that address in the browser, with a one-line instruction to click "Request indexing".

### Google OAuth: the user's own Desktop client
*2026-10-14*

No shared Google client ID is shipped, because a shared ID needs Google verification. The user creates a Desktop-app OAuth client (docs/CONNECT-GOOGLE.md) and pastes the client ID, plus the client secret, which Google normally requires for Desktop clients even with PKCE. The client ID is a normal setting; the client secret is stored encrypted like other secrets. The flow uses a loopback redirect, PKCE, `access_type=offline` and `prompt=consent` to get a refresh token. One Google account is connected for the whole app, and each site picks its own Search Console property (matched automatically when possible). The docs explain that apps left in Google's "Testing" mode get sign-ins that expire after 7 days, and how to avoid it.

### Sitemap address and index checks
*2026-10-14*

When something is published, the app re-submits `<site address>/sitemap.xml` to Search Console. It's the most common location; users with a different sitemap address submit it once in Search Console themselves. URL inspection runs 3 days after publishing and then every 2 days until Google reports the page indexed, with a notification when it is.

### IndexNow key generated on request
*2026-10-14*

IndexNow is on by default for each site, but nothing is sent until the user clicks **Generate key** and hosts the key file, because pings fail without it. The app can save the key file, includes it in exports, and explains how to upload it for WordPress. Website builders that can't host a root file should turn IndexNow off.

### Search volume: only real data survives
*2026-10-14*

After research, the app throws away any search volume the AI returned and puts back only volumes from keyword data (DataForSEO). Keywords that match a Search Console query are labelled "GSC". Everything else shows "Volume: unknown", with the AI's judgment labelled "AI estimate". This enforces the "never invent numbers" rule in code rather than trusting the prompt.

---

## Content checks

### H1 handling
*2026-10-14*

The piece's title becomes the page's H1 (WordPress and most themes render it that way). So the "One H1 only" check passes when the body has no other H1. The writing prompt asks for H2 and below.

### YMYL detection
*2026-10-14*

The "this topic needs extra care" banner shows if the fact-check model flags the topic as health, legal or financial, **or** if the keyword, title or topic matches a list of common YMYL words (dental, medical, legal, tax, loan, insurance and so on). Using both means a weaker model can't miss an obvious case.

### Duplicate-content check
*2026-10-14*

"Duplicate content" compares each paragraph over 40 words with paragraphs on the site's other pages, using 5-word shingles and Jaccard similarity. It's simple, fast and needs no extra library.

### Images
*2026-10-14*

After generation or upload, sharp converts each image to WebP at quality 80, resized to at most 1600 px wide. The optional social crop is 1200x630 using sharp's "attention" focus. A PNG or JPG fallback copy is optional per site. If no vision model is connected when a user adds their own photo, the app keeps the image and lets the user type the text details.

---

## Data

### Data folder layout
*2026-10-14*

Everything lives in Electron's `userData` folder: `autbot.db` (SQLite), `secrets.bin.json` (encrypted secrets), `images/`, and `logs/app.log`. For tests, `AUTBOT_USER_DATA` can point the app at a different folder. Backups use SQLite's online backup API (safe while the app is running) and include the database and images only. Restore keeps a copy of the current database as `autbot.db.before-restore-<timestamp>` before replacing it.

### 2026-10-14: Sign in with ChatGPT host ID uses `urn:uuid:`

OpenAI only accepts `ext_agent_host_id` values in the forms `urn:uuid:…`, `urn:ietf:params:oauth:jwk-thumbprint:…` or `did:key:…`. v1.0.0 sent a bare UUID, which the authorize page rejected ("Invalid authorize request", param `ext_agent_host_id`). The app now generates `urn:uuid:<uuidv4>` once per installation, saves it before the first sign-in and reuses it (an older bare UUID is upgraded by adding the prefix).

### 2026-10-14: Updating with the installer

There is no background auto-updater. On start-up the app makes one anonymous request to the GitHub Releases API (can be turned off in Settings > About). On Windows, "Install" downloads the new `-setup.exe` (only from this repo's release downloads, size checked), runs it with `/S --force-run` and quits; NSIS upgrades the existing install in place and re-opens the app. User data lives in the user data folder, which the installer never touches (`deleteAppDataOnUninstall: false`). macOS and Linux get the download link, because an unsigned app can't replace itself cleanly there.
