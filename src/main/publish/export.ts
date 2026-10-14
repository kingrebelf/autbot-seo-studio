import archiver from 'archiver'
import TurndownService from 'turndown'
import { createWriteStream, mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { getContent, type ContentRow } from '../content'
import { getSite, profileOf, settingsOf } from '../sites'
import { imagesFor, type ImageRow } from '../pipeline/images'
import { analyze } from '../pipeline/html'
import { escapeHtml } from '../pipeline/images'
import { keyFileName } from '../indexing/indexnow'
import { APP_NAME } from '@shared/constants'
import type { ExportFormat } from '@shared/types'

export interface ExportFile {
  path: string
  data: Buffer | string
}

const yamlStr = (v: string) => JSON.stringify(v ?? '')
const yamlList = (l: string[]) => `[${l.map(yamlStr).join(', ')}]`

export function frontMatter(format: ExportFormat, m: ExportMeta): string {
  const date = m.date
  const lines: string[] = []
  switch (format) {
    case 'hugo':
      lines.push(
        `title: ${yamlStr(m.title)}`,
        `description: ${yamlStr(m.description)}`,
        `slug: ${yamlStr(m.slug)}`,
        `date: ${date}`,
        'draft: false',
        `keywords: ${yamlList([m.keyword, ...m.secondary])}`,
        `categories: ${yamlList(m.categories)}`,
        `tags: ${yamlList(m.tags)}`
      )
      if (m.image) lines.push(`images: ${yamlList([m.image])}`)
      break
    case 'jekyll':
      lines.push(
        'layout: post',
        `title: ${yamlStr(m.title)}`,
        `description: ${yamlStr(m.description)}`,
        `permalink: /${m.slug}/`,
        `date: ${date}`,
        `categories: ${yamlList(m.categories)}`,
        `tags: ${yamlList(m.tags)}`
      )
      if (m.image) lines.push(`image: ${yamlStr(m.image)}`)
      break
    case 'astro':
      lines.push(
        `title: ${yamlStr(m.title)}`,
        `description: ${yamlStr(m.description)}`,
        `pubDate: ${date}`,
        `tags: ${yamlList(m.tags)}`
      )
      if (m.image) lines.push(`heroImage: ${yamlStr(m.image)}`)
      break
    case 'eleventy':
      lines.push(
        'layout: layouts/post.njk',
        `title: ${yamlStr(m.title)}`,
        `description: ${yamlStr(m.description)}`,
        `permalink: /${m.slug}/`,
        `date: ${date}`,
        `tags: ${yamlList(m.tags)}`
      )
      if (m.image) lines.push(`image: ${yamlStr(m.image)}`)
      break
    case 'nextjs-mdx':
      lines.push(
        `title: ${yamlStr(m.title)}`,
        `description: ${yamlStr(m.description)}`,
        `slug: ${yamlStr(m.slug)}`,
        `date: ${yamlStr(date)}`,
        `keywords: ${yamlList([m.keyword, ...m.secondary])}`,
        `tags: ${yamlList(m.tags)}`
      )
      if (m.image) lines.push(`image: ${yamlStr(m.image)}`)
      break
    default:
      lines.push(
        `title: ${yamlStr(m.title)}`,
        `seo_title: ${yamlStr(m.seoTitle)}`,
        `description: ${yamlStr(m.description)}`,
        `slug: ${yamlStr(m.slug)}`,
        `date: ${date}`,
        `focus_keyword: ${yamlStr(m.keyword)}`,
        `categories: ${yamlList(m.categories)}`,
        `tags: ${yamlList(m.tags)}`
      )
      if (m.image) lines.push(`image: ${yamlStr(m.image)}`)
  }
  return `---\n${lines.join('\n')}\n---\n`
}

interface ExportMeta {
  title: string
  seoTitle: string
  description: string
  slug: string
  keyword: string
  secondary: string[]
  categories: string[]
  tags: string[]
  date: string
  image: string | null
}

function readme(slug: string): string {
  return `How to put this on your website
================================
Made with ${APP_NAME}. Everything for one page is in this folder.

Files
- index.html     A complete web page (with title, description, social tags and schema).
- content.md     The article in Markdown with front matter (for static site generators).
- content.txt    Plain text, ready to paste into any website builder.
- images/        Optimized images with search-friendly file names.
- images.csv     Alt text, title, caption and description for each image.
- meta.json      SEO title, meta description, slug, keywords, categories, tags.
- schema.json    Structured data (JSON-LD).

Wix
1. Add a new blog post (or page). Paste the text from content.txt, or use "Copy HTML" in the app.
2. Upload the images from images/ and set each image's alt text from images.csv.
3. In the post's SEO settings, paste the SEO title and meta description from meta.json and set the URL slug to "${slug}".
4. Optional: paste schema.json into SEO > Advanced > Structured data markup.

Squarespace
1. Add a blog post, add a Markdown or Text block and paste the content.
2. Upload the images and set alt text (Image block > Design > alt text) from images.csv.
3. Post settings > SEO: paste the SEO title and description. Set the URL slug to "${slug}".
4. Optional: add schema.json inside <script type="application/ld+json"> in a Code block.

Shopify
1. Online Store > Blog posts (or Pages) > Add. Click "Show HTML" (<>) and paste index.html's <article> contents, or use "Copy HTML" in the app.
2. Upload images and set their alt text from images.csv.
3. Search engine listing: paste the SEO title and description; set the URL handle to "${slug}".

Webflow
1. In your CMS collection, add an item. Paste the content into the Rich Text field.
2. Upload images (set alt text from images.csv). Set the slug to "${slug}".
3. Fill the SEO title and meta description fields from meta.json.

Hugo, Jekyll, Astro, Eleventy, Next.js (MDX)
1. Copy content.md into your content folder (rename it to ${slug}.md or ${slug}.mdx if your setup needs it).
2. Copy the images/ folder to your static/public images folder and check the image paths.
3. Build and deploy your site as usual.

Plain HTML
1. Upload index.html (rename it if you like) and the images/ folder to your web host, keeping them side by side.

After it's live
- In ${APP_NAME}, click "Mark as published" and paste the live address. The app will help get it indexed and start tracking its rankings.
`
}

function exportMeta(c: ContentRow, featured: ImageRow | undefined): ExportMeta {
  return {
    title: c.title ?? '',
    seoTitle: c.seoTitle ?? c.title ?? '',
    description: c.metaDescription ?? '',
    slug: c.slug ?? `content-${c.id}`,
    keyword: c.focusKeyword ?? '',
    secondary: c.secondaryKeywords ?? [],
    categories: c.categories ?? [],
    tags: c.tags ?? [],
    date: new Date(c.publishedAt ?? Date.now()).toISOString().slice(0, 10),
    image: featured ? `images/${featured.filename}` : null
  }
}

/** Point every autbot-media:// image at its exported file. */
export function localizeImages(html: string, images: ImageRow[], prefix = 'images/'): string {
  return html.replace(/autbot-media:\/\/img\/(\d+)/g, (m, id: string) => {
    const im = images.find((i) => i.id === Number(id))
    return im ? `${prefix}${im.filename}` : m
  })
}

export function htmlToMarkdown(html: string): string {
  const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' })
  td.keep(['table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'figcaption'])
  return td.turndown(html)
}

const decodeEntities = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')

export function htmlToPlain(html: string): string {
  return decodeEntities(
    html
      // decode before upper-casing headings, or "&amp;" would become "&AMP;"
      .replace(
        /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi,
        (_m, t: string) =>
          `\n\n${decodeEntities(t.replace(/<[^>]+>/g, ''))
            .toUpperCase()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')}\n\n`
      )
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/(p|ul|ol|blockquote|table|tr|figure)>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function csvCell(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
}

/** Build every file of the export file set for one piece. */
export function buildExportFiles(
  contentId: number,
  format?: ExportFormat
): { slug: string; files: ExportFile[] } {
  const c = getContent(contentId)
  const site = getSite(c.siteId)
  const fmt = (format ?? site.exportFormat ?? 'generic') as ExportFormat
  const imgs = imagesFor(contentId).filter((i) => i.selected)
  const featured = imgs.find((i) => i.slot === 'featured')
  const m = exportMeta(c, featured)
  const slug = m.slug
  const body = localizeImages(c.bodyHtml ?? '', imgs)
  const schemaJson = c.schema ?? {}
  const canonical = c.liveUrl || `${site.url}/${slug}/`
  const p = profileOf(site)
  const html = `<!doctype html>
<html lang="${(p.language || 'en').slice(0, 2).toLowerCase()}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(m.seoTitle)}</title>
<meta name="description" content="${escapeHtml(m.description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(m.seoTitle)}">
<meta property="og:description" content="${escapeHtml(m.description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:site_name" content="${escapeHtml(p.name)}">
${featured ? `<meta property="og:image" content="images/${escapeHtml(featured.filename)}">\n<meta name="twitter:image" content="images/${escapeHtml(featured.filename)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(m.seoTitle)}">
<meta name="twitter:description" content="${escapeHtml(m.description)}">
<script type="application/ld+json">
${JSON.stringify(schemaJson, null, 2).replace(/</g, '\\u003c')}
</script>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.65;max-width:760px;margin:40px auto;padding:0 20px;color:#1f2933}img{max-width:100%;height:auto}figure{margin:24px 0}figcaption{font-size:.9em;color:#52606d}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 10px}</style>
</head>
<body>
<article>
<h1>${escapeHtml(m.title)}</h1>
${featured ? `<figure><img src="images/${escapeHtml(featured.filename)}" alt="${escapeHtml(featured.alt ?? '')}" title="${escapeHtml(featured.title ?? '')}" width="${featured.width ?? ''}" height="${featured.height ?? ''}">${featured.caption ? `<figcaption>${escapeHtml(featured.caption)}</figcaption>` : ''}</figure>` : ''}
${body}
</article>
</body>
</html>
`
  const md = `${frontMatter(fmt, m)}\n# ${m.title}\n\n${htmlToMarkdown(body)}\n`
  const txt = `${m.title}\n\n${htmlToPlain(body)}\n`
  const files: ExportFile[] = [
    { path: 'index.html', data: html },
    { path: 'content.md', data: md },
    { path: 'content.txt', data: txt },
    {
      path: 'images.csv',
      data: toCsv([
        ['filename', 'alt', 'title', 'caption', 'description'],
        ...imgs.map((i) => [i.filename, i.alt, i.title, i.caption, i.description])
      ])
    },
    {
      path: 'meta.json',
      data: JSON.stringify(
        {
          title: m.title,
          seo_title: m.seoTitle,
          meta_description: m.description,
          slug,
          focus_keyword: m.keyword,
          secondary_keywords: m.secondary,
          categories: m.categories,
          tags: m.tags,
          excerpt: c.excerpt ?? '',
          schema: schemaJson,
          internal_links: analyze(body, site.url)
            .links.filter((l) => l.internal)
            .map((l) => ({ url: l.href, anchor: l.text }))
        },
        null,
        2
      )
    },
    { path: 'schema.json', data: JSON.stringify(schemaJson, null, 2) },
    { path: 'README.txt', data: readme(slug) }
  ]
  for (const im of imgs) {
    if (existsSync(im.filePath)) files.push({ path: `images/${im.filename}`, data: im.filePath })
    if (im.fallbackPath && existsSync(im.fallbackPath))
      files.push({
        path: `images/${im.filename.replace(/\.webp$/, extname(im.fallbackPath))}`,
        data: im.fallbackPath
      })
  }
  const st = settingsOf(site)
  if (st.indexNowEnabled !== false && st.indexNowKey)
    files.push({ path: keyFileName(st.indexNowKey), data: st.indexNowKey })
  return { slug, files }
}

const isFilePath = (f: ExportFile) => typeof f.data === 'string' && f.path.startsWith('images/')

/** Write the export as `<slug>/...` inside a .zip. */
export async function exportZip(contentId: number, zipPath: string, format?: ExportFormat): Promise<string> {
  const { slug, files } = buildExportFiles(contentId, format)
  mkdirSync(dirname(zipPath), { recursive: true })
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(zipPath)
    const zip = archiver('zip', { zlib: { level: 9 } })
    out.on('close', () => resolve())
    zip.on('error', reject)
    zip.pipe(out)
    for (const f of files) {
      if (isFilePath(f)) zip.file(f.data as string, { name: `${slug}/${f.path}` })
      else zip.append(typeof f.data === 'string' ? f.data : f.data, { name: `${slug}/${f.path}` })
    }
    void zip.finalize()
  })
  return zipPath
}

/** Write the export as a plain folder `<dir>/<slug>/...`. */
export function exportFolder(contentId: number, dir: string, format?: ExportFormat): string {
  const { slug, files } = buildExportFiles(contentId, format)
  const root = join(dir, slug)
  for (const f of files) {
    const dest = join(root, f.path)
    mkdirSync(dirname(dest), { recursive: true })
    if (isFilePath(f)) copyFileSync(f.data as string, dest)
    else writeFileSync(dest, f.data)
  }
  return root
}
