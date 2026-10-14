# Connect Google Search Console (and set up IndexNow)

Google Search Console is Google's free tool that shows which searches your site appears for, how often people click, and your average position. Connecting it lets Autbot SEO Studio:

- suggest topics based on searches you already show up for (modes B and C),
- track your rankings for free, going back 16 months on the first connection,
- re-submit your sitemap when you publish something new,
- check whether Google has indexed a new page (3 days after publishing, then every couple of days until it is).

It's optional, but strongly recommended. Setup takes about 10 to 15 minutes the first time.

> **About the screenshots:** the images below are placeholders. Each one says what it will show.

## Why do I need to create my own "OAuth client"?

To let a desktop app read your Search Console data, Google needs an **OAuth client**: a small registration in Google Cloud that identifies the app. Autbot SEO Studio doesn't ship a shared one, because a shared client needs Google's verification and would route everyone's sign-in through one registration. Instead, you create your own. It's free, only you use it, and nobody else is involved in your Google sign-in.

Before you start, make sure your website is already set up in Search Console at [search.google.com/search-console](https://search.google.com/search-console). If it isn't, add and verify it there first.

---

## 1. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in with the Google account that has access to your site in Search Console.
2. If asked, accept the terms. You don't need to add a payment method; nothing here costs money.
3. At the top, click the project picker, then **New Project**.
4. Name it `Autbot SEO Studio` and click **Create**. Make sure the new project is selected in the project picker.

![Screenshot: the Google Cloud "New Project" form](images/google-new-project.png)

## 2. Turn on the Search Console API

1. Open the menu and go to **APIs & Services > Library** (or search for "API Library" in the top search bar).
2. Search for **Google Search Console API** and click it.
3. Click **Enable**.

![Screenshot: the Google Search Console API page with the Enable button](images/google-enable-api.png)

## 3. Set up the consent screen

Google calls this the **OAuth consent screen** (in newer versions of the console, it's under **Google Auth Platform**).

1. Go to **APIs & Services > OAuth consent screen** (or **Google Auth Platform > Branding**) and click **Get started** if you see it.
2. **App name:** `Autbot SEO Studio`. **User support email:** your email.
3. **Audience / User type:** choose **External**. (If you use Google Workspace and only your own organisation's accounts need access, you can choose **Internal** instead and skip the test-user step.)
4. **Contact information:** your email. Agree to the policy and click **Create** (or **Save and continue** through the steps).
5. You don't need to add scopes here. The app asks for the Search Console scope when you sign in.

### Add yourself as a test user

New apps start in **Testing** mode, where only listed test users can sign in.

1. Go to **Audience** (or **OAuth consent screen > Test users**).
2. Under **Test users**, click **Add users**, enter the Google account you'll sign in with, and save.

![Screenshot: the Test users list with one email address added](images/google-test-user.png)

> **Tip: avoid reconnecting every week.** While the app is in **Testing** mode, Google expires the sign-in after 7 days, so you'd need to click **Connect** again each week. To avoid that, go to **Audience** and click **Publish app** (move it to **In production**). Because the app isn't verified by Google, you'll see a "Google hasn't verified this app" warning when you sign in. That's expected for an app only you use: click **Advanced**, then **Go to Autbot SEO Studio (unsafe)**. It's your own registration, so the only app it connects to is yours.

## 4. Create the OAuth client (Desktop app)

1. Go to **APIs & Services > Credentials** (or **Google Auth Platform > Clients**).
2. Click **Create credentials > OAuth client ID** (or **Create client**).
3. **Application type:** choose **Desktop app**. This matters: other types won't work.
4. **Name:** `Autbot SEO Studio`. Click **Create**.
5. Google shows your **Client ID** (ends in `.apps.googleusercontent.com`) and **Client secret**. Copy both. You can also download them as JSON, or come back to this page later to see them.

![Screenshot: the "OAuth client created" dialog showing the client ID and secret](images/google-client-created.png)

## 5. Connect in the app

1. In Autbot SEO Studio, go to **Settings > Google**.
2. Paste the **Client ID**.
3. Paste the **Client secret** too. Google normally requires it for Desktop app clients, even though the app also uses the PKCE security check. It's stored encrypted on your computer like your other keys.
4. Click **Connect**. Your browser opens on Google's sign-in page.
5. Choose your Google account. If you see the "Google hasn't verified this app" screen, click **Advanced**, then **Go to Autbot SEO Studio (unsafe)** (see the tip above).
6. Tick the box to allow access to **Search Console** and click **Continue**.
7. The browser says "You are signed in". Close the tab and go back to the app.
8. Pick the **Search Console property** for each site. The app picks the matching one automatically when it can (a domain property like `sc-domain:example.com`, or a URL-prefix property like `https://www.example.com/`).

The app then pulls your search data in the background: queries, clicks, impressions, click rate and average position, per query and page. Search Console data is usually 2 to 3 days behind.

![Screenshot: Settings > Google showing "Connected" and the property dropdown](images/google-connected.png)

The app only asks for the Search Console scope (`https://www.googleapis.com/auth/webmasters`). It uses it to read search data, submit your sitemap, and run URL inspections. It doesn't touch anything else in your Google account.

### Requesting indexing

Google doesn't allow apps to request indexing for normal pages through its API. (Google's Indexing API is only for job postings and livestream pages, so the app doesn't use it.) Instead, each published piece has a **Request indexing in Search Console** button. It opens Google's URL Inspection page for that address in your browser. Click **Request indexing** there.

When you publish, the app also re-submits your sitemap at `https://your-site/sitemap.xml`. If your sitemap lives somewhere else, submit it once yourself in Search Console under **Sitemaps**.

### Troubleshooting

| Message says | What to do |
|---|---|
| "Google needs the client secret for this OAuth client" | Paste the client secret in **Settings > Google**, then connect again. |
| "Google didn't recognise the OAuth client ID" | Check you created a **Desktop app** client and copied the whole ID. |
| "Error 403: access_denied" in the browser | Add your Google account as a **test user** (step 3), or publish the app. |
| "Google didn't grant offline access" | Remove the app at [myaccount.google.com/permissions](https://myaccount.google.com/permissions), then connect again. |
| "Search Console access was not granted" | Connect again and make sure the Search Console box is ticked. |
| "...can't access that Search Console property" | Pick a property your Google account owns or has full access to. |
| "Your Google connection expired or was removed" | Click **Connect** again. If this happens every week, publish the app (see the tip in step 3). |

To disconnect, click **Disconnect** in **Settings > Google**. You can also remove access on Google's side at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

---

## IndexNow (Bing, Yandex and others)

IndexNow is a free, open way to tell search engines like Bing and Yandex that a page is new or has changed. It doesn't need an account. Google doesn't use it, which is why Search Console is set up separately.

IndexNow is on by default for each site, but it needs a **key** first, and that key must be on your website so search engines know the request really comes from you.

1. In **Settings > Google**, under **IndexNow**, click **Generate key**. The app shows the key and the file name (`<key>.txt`) and where it must live: `https://your-site/<key>.txt`.
2. Click **Save key file** to save the `.txt` file to your computer. It contains just the key.
3. Upload that file to the top level of your website so it opens at `https://your-site/<key>.txt`:
   - **WordPress:** use your host's file manager or an FTP/SFTP program to upload it to the WordPress folder (the one with `wp-config.php` in it).
   - **Exported sites:** the key file is included in every export when IndexNow is on. Put it at the root of your site, next to your home page.
   - **Website builders** (Wix, Squarespace, Shopify, Webflow) usually don't let you upload files to the root. In that case, turn IndexNow off for that site; your sitemap and Search Console still work.
4. Open `https://your-site/<key>.txt` in your browser to check it shows the key.
5. Click **Test**. The app sends your home page to IndexNow.

After that, whenever a piece is published, the app pings `https://api.indexnow.org/indexnow` with the new address. If IndexNow says it can't find your key file, the app tells you where it expected it.

> If you already use a WordPress plugin that sends IndexNow pings with its own key, you can turn IndexNow off for that site in the app to avoid sending everything twice.
