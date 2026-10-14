# Connect WordPress

Autbot SEO Studio can send finished pieces straight to your WordPress site **as drafts**. It never publishes anything. You open the draft in WordPress, check it, and click **Publish** yourself.

The connection uses a WordPress **application password**: a separate password just for this app, which you can remove at any time without changing your normal login.

What you need:

- A self-hosted WordPress site (WordPress 5.6 or newer) or a WordPress.com plan that allows plugins and the REST API.
- Your site must use **HTTPS** (the address starts with `https://`). WordPress only allows application passwords over HTTPS.
- An administrator login, to create the app's user.

> **About the screenshots:** the images below are placeholders. Each one says what it will show.

---

## 1. Create a separate WordPress user for the app (recommended)

Using a separate user means you can see what the app created and switch it off on its own.

1. Log in to your WordPress dashboard as an administrator.
2. Go to **Users > Add New User**.
3. Username: something like `autbot-writer`. Email: any address you control (it can be a `+alias` of your own).
4. Role:
   - **Author** if you only want blog posts. Authors can create posts but not pages.
   - **Editor** if you also want the app to create pages (service pages, landing pages, location pages). Editors can create both.
5. Click **Add New User**.

![Screenshot: the WordPress "Add New User" screen with the Author role selected](images/wp-add-user.png)

## 2. Create the application password

1. Go to **Users > All Users** and click the `autbot-writer` user (or your own user, if you prefer).
2. Scroll down to **Application Passwords**.
3. In **New Application Password Name**, type `Autbot SEO Studio`.
4. Click **Add New Application Password**.
5. Copy the password WordPress shows. It looks like `abcd EFGH 1234 ijkl MNOP 5678`. You won't see it again. (The spaces don't matter; the app removes them.)

![Screenshot: the Application Passwords section of a WordPress user profile](images/wp-app-password.png)

**Don't see "Application Passwords"?** Some hosts and security plugins turn them off. Check:

- The site is on HTTPS.
- Your security plugin (for example Wordfence, iThemes/Solid Security, All In One WP Security) doesn't disable application passwords or the REST API. Most have a setting for this.
- Your host doesn't disable them. Some managed hosts have a toggle in their dashboard; ask their support if you can't find it.

## 3. Connect in the app

1. In Autbot SEO Studio, go to **Settings > Publishing > WordPress** (or step 4 of the first-run setup). The connection is per site, so make sure the right site is selected in the site switcher.
2. Fill in:
   - **Site address**: for example `https://www.example.com`
   - **Username**: `autbot-writer` (the user, not the application password name)
   - **Application password**: the one you just copied
3. Click **Test connection**.

The test shows the WordPress user's name and role, and whether it can create **posts** and **pages**. It also tells you if an SEO plugin was detected.

![Screenshot: the WordPress settings card showing a successful test with user name, role and detected SEO plugin](images/wp-test.png)

The application password is encrypted with your computer's secure storage. It isn't stored in the app's database and isn't included in backups.

## 4. Send a draft

When a piece is **Ready for review**, fill in any `[CONFIRM: ...]` notes, tick the review checklist, and click **Send to WordPress as Draft**. The app:

1. Uploads the images to your Media Library, with their alt text, title, caption and description.
2. Creates a new **draft** post or page with the title, content, excerpt, URL slug, categories and tags (creating any that don't exist yet), and the featured image.
3. Writes the SEO title, meta description and focus keyword into **Yoast SEO**, **Rank Math** or **All in One SEO** if one is installed and accepts them through the REST API. If it can't, the app shows a **Copy SEO title / Copy meta description** panel so you can paste them into the plugin yourself.
4. Shows **Open in WordPress to review and publish**.

Things to know:

- **Status is always "draft".** The code that talks to WordPress has the status fixed to `draft`, and there is an automated test to make sure no other status (`publish`, `future`, `private`) can be sent.
- **Schema (structured data):** if no SEO plugin is detected, the app adds the page's JSON-LD to the end of the content. If an SEO plugin is detected, it leaves this off by default because the plugin adds its own. You can change this per site in **Settings > Publishing**.
- **Refreshes never touch the live page.** When you refresh an existing page (mode D), the app creates a *new* draft called "[Refresh] Original title" with a note at the top listing the changes and the original post ID. Copy across what you want. In **Advanced**, you can instead save the changes as an autosave (revision) of the original; WordPress keeps the live post as it is until someone publishes that revision in the editor.
- **Links from older pages:** in **Advanced**, the app can create draft copies of older posts with the suggested links to your new page added. These are also "[Refresh]" drafts; your live posts aren't edited.

## 5. After you publish

While the app is open, it checks the status of drafts it sent every 30 minutes (you can also check right away). When a draft becomes published in WordPress, the app marks it **Published**, saves the live address, re-submits your sitemap to Search Console (if connected), notifies IndexNow (if set up), and starts tracking the keywords.

The app also reads your existing published posts and pages, so it knows what you already have. This powers internal link suggestions and the warning when a new piece would compete with an existing page.

## Troubleshooting

| Message says | Likely cause and fix |
|---|---|
| "WordPress rejected the username or application password" | Use the **application password**, not your normal password, and the **username** (not the email or the password's name). Check that a security plugin or your host hasn't disabled application passwords. |
| "Couldn't find the WordPress REST API on this site" | Check the site address. In WordPress, go to **Settings > Permalinks** and click **Save Changes** (this refreshes the address rules). Check that no security plugin blocks the REST API. The app automatically retries using the `?rest_route=` form if `/wp-json/` is blocked. |
| "...isn't allowed to do that" | Give the app's user the **Author** role (posts) or **Editor** role (pages). |
| "WordPress application passwords only work over HTTPS" | Use your address starting with `https://`. If your site doesn't have HTTPS yet, ask your host to turn on a free certificate. |
| "The image is too large for your WordPress upload limit" | Ask your host to raise the upload limit, or use a smaller image. |
| "Couldn't reach your website" | Check the address and your internet connection. |

## Disconnect

In **Settings > Publishing > WordPress**, click **Disconnect** to delete the stored password from your computer. To revoke it on the WordPress side too, go to the user's profile, find **Application Passwords**, and click **Revoke** next to "Autbot SEO Studio".

## Not using WordPress?

Use **Export** instead. Each piece becomes a zip with a complete web page, Markdown (with front matter for Hugo, Jekyll, Astro, Eleventy or Next.js MDX), plain text, optimized images and a README explaining how to add it to Wix, Squarespace, Shopify, Webflow, static site generators or plain HTML. After you put it live, click **Mark as published** and paste the address.
