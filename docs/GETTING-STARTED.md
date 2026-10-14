# Getting started

This guide takes you from download to your first draft, one step at a time. You don't need to know how to code.

> **About the screenshots:** the images in this guide are placeholders for now. Each one says what it will show. They will be added once the app's screens are final.

What you need before you start:

- A computer running Windows 10 or 11, macOS (Apple Silicon), or a recent Linux desktop.
- An AI to connect. Any one of these works: a ChatGPT Plus or Pro plan, an API key from OpenAI, Anthropic, Google Gemini, xAI, Meta or OpenRouter, or a free local model through Ollama or LM Studio. [CONNECT-AI.md](CONNECT-AI.md) explains each one.
- Your website address.
- Optional: a WordPress login with admin access (to create an application password), and a Google account that can see your site in Search Console.

Set aside about 20 minutes the first time. After that, a new piece of content takes about 10 minutes of your time.

---

## 1. Download and install

1. Go to the [latest release](https://github.com/kingrebelf/autbot-seo-studio/releases/latest).
2. Under **Assets**, download the file for your computer:
   - Windows: the file ending in `.exe`
   - Mac: the file ending in `.dmg`
   - Linux: the file ending in `.AppImage` (any distribution) or `.deb` (Debian, Ubuntu)
3. Install it:
   - **Windows:** double-click the `.exe`. If you see "Windows protected your PC", click **More info**, then **Run anyway**. This appears because the app isn't code-signed. Follow the installer; you can choose where to install it.
   - **Mac:** double-click the `.dmg` and drag **Autbot SEO Studio** into **Applications**. The first time you open it, macOS warns that it's from an unidentified developer. Click **Done**, open **System Settings > Privacy & Security**, scroll down and click **Open Anyway**, then **Open**. If macOS says the app "is damaged", open **Terminal** and run `xattr -cr "/Applications/Autbot SEO Studio.app"`, then try again.
   - **Linux:** make the `.AppImage` executable (right-click > Properties > Permissions > Allow executing) and double-click it, or install the `.deb` with `sudo apt install ./autbot-seo-studio_*.deb`.

![Screenshot: the Windows SmartScreen dialog with "More info" highlighted](images/install-smartscreen.png)

![Screenshot: macOS Privacy & Security settings with the "Open Anyway" button](images/install-macos-open-anyway.png)

---

## 2. First-run setup

The first time you open the app, a short setup wizard starts. Only step 1 is required. You can skip the rest and come back later from **Settings**.

### Step 1: Your business

Fill in:

- **Business name** and **website address** (starting with `https://`).
- **What you sell**, in your own words. For example: "Family-run bakery selling sourdough, celebration cakes and wholesale bread to cafes."
- **Service area**: a city or region, or "online/nationwide".
- **Main customer type**: for example "homeowners", "small offices", "parents planning parties".
- **Top 3 to 5 products or services** that make you the most money.
- **Competitors** (optional): names or website addresses.
- **Tone of voice**: Friendly, Professional, Expert, Plain-spoken, or your own description.
- **Language and country**, so search data matches where your customers are.
- **Things the AI must never say or promise**: for example "Never promise same-day delivery" or "Don't quote prices for implants".

This becomes your **Business Profile**. The AI is only allowed to state facts that are in it. Anything else becomes a `[CONFIRM: ...]` note for you to fill in.

![Screenshot: the "Your business" step of the setup wizard, filled in for a bakery](images/setup-business.png)

### Step 2: Connect an AI

You'll see a card for each AI provider. Pick one and connect it:

- **API key providers:** click **Get a key** (it opens the provider's website), create a key, paste it into the card, and click **Test**. A green dot and "Connected" means it worked.
- **ChatGPT plan:** click **Sign in with ChatGPT**. Your browser opens; sign in and approve. Come back to the app when the browser says you can close the tab.
- **Ollama or LM Studio:** start the program on your computer first, then click **Test**.

Step-by-step instructions for every provider are in [CONNECT-AI.md](CONNECT-AI.md).

![Screenshot: the AI provider cards, with one card showing a green "Connected" dot](images/setup-connect-ai.png)

### Step 3: Pick your models

The app fills in a model for each task: research and planning, writing, SEO pass, fact-checking, image generation, image descriptions, and quick tasks like titles. It picks the strongest model you've connected for each one, and tries to use a *different* model for fact-checking than for writing, so you get a second opinion.

You can leave these as they are. To change one later, go to **Settings > AI Models**.

![Screenshot: the task-to-model table with a dropdown open](images/setup-models.png)

### Step 4: Where content goes

Choose one:

- **WordPress:** connect your site with an application password. [CONNECT-WORDPRESS.md](CONNECT-WORDPRESS.md) walks you through it. The app only ever creates drafts.
- **Export files:** the app gives you a zip file per piece with a web page, Markdown, plain text, images, and instructions for Wix, Squarespace, Shopify, Webflow and static site builders. Pick the format that matches your site, or leave it on **Generic**.

### Step 5: Google Search Console (optional, recommended)

Search Console shows which searches you already appear for. With it, the app can suggest smarter topics and track your rankings for free. Setup takes about 10 minutes the first time: see [CONNECT-GOOGLE.md](CONNECT-GOOGLE.md). You can skip it for now.

### Finish

At the end, the app asks: "Want me to look at your website and suggest your first three pieces of content?" Click the button to let it read your site and suggest what to write first. It reads your sitemap (or follows links from your home page), one page per second.

---

## 3. Make your first piece of content

1. Click **New Content** in the left sidebar.
2. Choose a mode. For your first piece, pick **A. "I have a topic in mind."**
   Other modes, for later:
   - **B. Tell me what's next.** The app recommends the 5 best next pieces for your site.
   - **C. Maintenance.** Finds pages that are close to page one, losing clicks, or need a better title.
   - **D. Refresh an existing page.** Suggests improvements and makes an updated draft. Your live page is never changed.
   - **E. Build a set.** A main "pillar" page plus 3 to 8 supporting posts that link to it.
   - **F. Local pages.** One genuinely different page per town or area you serve.
   - **G. Plan my next 6 months.** Builds a content calendar.
3. Type a topic your customers might search for: "spring lawn aeration", "dental implants cost", "wedding cake prices". Add anything else the AI should know in **Anything else I should know?**, then start.

![Screenshot: the New Content screen with the seven mode cards](images/new-content-modes.png)

### Research

The research step takes a minute or two. You'll get:

- **Keyword options**, each with search intent, difficulty for a small site, search volume (with where the number came from), and why it fits your business.
- **Competitor snapshot**: who ranks now and what they miss.
- **Content gap**: what a better page would include.
- **Recommendation**: the one direction the AI would pick, and whether it's worth your time at all.

If no data source provides search volume, it says "Volume: unknown". Any judgment the AI makes on its own is labelled **AI estimate**. The app never makes up numbers.

![Screenshot: research results as cards, with the recommended keyword highlighted](images/research-results.png)

### Choose a direction

Pick a keyword (or edit one), the type of page (blog post, service page, landing page, location page, product page, FAQ page, comparison page, how-to guide), and the length.

If another page on your site already targets that keyword, the app warns you. Two pages chasing the same search tend to hurt each other. You can improve the existing page instead, ask for a more specific keyword, or continue anyway.

### Brief and outline

The AI writes a **content brief**: the angle, the headline, an outline of sections, questions to answer, pages to link to, and a call to action. Drag sections to reorder them, add or remove them, then click **Write it**.

If the brief lists **facts it needs from you** (prices, warranty terms, years in business), answer them in the short form. Anything you leave blank becomes a yellow `[CONFIRM: ...]` note in the draft.

![Screenshot: the brief editor with the outline and the "facts I need from you" form](images/brief.png)

### Write and check

The draft appears in the editor as it's written. When it's done, the app automatically:

- Scores the SEO (0 to 100) with a checklist: keyword in the title, title and description length, headings, links, alt text, readability, and more. Each failing item has a **Fix it** button that asks the AI to fix only that item.
- Runs a second AI over the draft to list **claims to verify** (prices, numbers, dates, guarantees), flag anything that conflicts with your "never say" list, and point out passages that sound robotic.
- Checks every link in the draft still works.
- Shows a warning banner on health, legal and financial topics: have a qualified person check it before publishing.

When it's finished, the status becomes **Ready for review** and you get a notification.

![Screenshot: the content editor with the SEO score panel open on the right](images/editor-seo.png)

### Images (optional)

If you connected a model that can make images, the **Images** tab offers a featured image and up to 5 in-article images. You can edit each image prompt, pick from a few options, or use your own photo. The app converts images to WebP, resizes them, and writes a search-friendly filename, alt text, title, caption and description for each one.

If none of your connected models can make images, this section is hidden and says why.

### Review and send

1. Read the draft. Edit anything in the editor; it works like a word processor.
2. Fill in or dismiss every `[CONFIRM: ...]` note. The app won't send the draft while any are left.
3. Tick off the claims you've checked.
4. Tick the **review checklist**: it's true, it sounds like you, it's useful, links work, and it doesn't compete with another of your pages.
5. Click **Send to WordPress as Draft**, or **Export**.

![Screenshot: the review checklist and the "Send to WordPress as Draft" button](images/review-send.png)

### Publish it yourself

- **WordPress:** click **Open in WordPress to review and publish**. Check how it looks, then click **Publish** in WordPress. The app notices within about 30 minutes (or right away if you click to check) and marks it Published.
- **Exported files:** put the content on your site, then click **Mark as published** in the app and paste the live address.

Once it's published, the app re-submits your sitemap to Search Console (if connected), notifies IndexNow (if you've set up a key), starts tracking the keywords, and reminds you which older pages should link to the new one. To ask Google to look at the page sooner, click **Request indexing in Search Console** and then **Request indexing** on Google's page.

---

## 4. What's next

- **Home** shows drafts waiting for you, what you published this month, keyword movement and AI spend, plus "What should I do next?" suggestions.
- **Plan** holds your content calendar and **Spar with AI**, a chat that helps you decide whether SEO is worth it for your business and what to do first.
- **Keywords** shows ranking charts, winners and losers, and alerts when a keyword enters the top 10 or top 3, or drops more than 5 places.
- **Site Health** audits your pages (missing or long titles, missing descriptions, thin pages, broken pages, pages nothing links to) and lists pages that compete for the same search.
- **Settings > About** has **Backup** and **Restore**, the data folder location, and **Export logs** for bug reports.

The app does background work (rank checks, crawls, WordPress status checks) only while it's open.

## Where your data lives

Everything stays on your computer, in the app's data folder:

- Windows: `%APPDATA%\Autbot SEO Studio`
- macOS: `~/Library/Application Support/Autbot SEO Studio`
- Linux: `~/.config/Autbot SEO Studio`

**Settings > About** shows the exact path and has an **Open folder** button. Backups include the database and images, but never your keys or passwords. After restoring on a new computer, reconnect your AI, WordPress and Google.

## Getting help

- Something not working? Open an [issue on GitHub](https://github.com/kingrebelf/autbot-seo-studio/issues). Attach the file from **Settings > About > Export logs** (keys and passwords are removed from it). Never paste an API key into an issue.
