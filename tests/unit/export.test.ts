import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import extract from 'extract-zip'
import {
  setupTestEnv,
  makeSite,
  makeContent,
  connectMock,
  pngBytes,
  walk,
  SITE_URL,
  type TestEnv
} from './helpers'
import { exportZip, exportFolder, buildExportFiles, frontMatter } from '../../src/main/publish/export'
import { addOwnImage, getImage, reuseImage } from '../../src/main/pipeline/images'
import { getContent } from '../../src/main/content'
import { updateSite } from '../../src/main/sites'
import { dispatch } from '../../src/main/ipc'
import { EXPORT_FORMATS, type ExportFormat } from '@shared/types'

let env: TestEnv
beforeEach(() => {
  env = setupTestEnv()
})
afterEach(() => env.cleanup())

async function fixture() {
  await connectMock()
  const site = makeSite()
  const c = makeContent(site.id)
  const featured = await addOwnImage(site.id, c.id, 'featured', await pngBytes())
  const inline = await addOwnImage(site.id, c.id, 'section-1', await pngBytes())
  return { site, c, featured: getImage(featured.id), inline: getImage(inline.id) }
}

async function unzip(zip: string): Promise<{ dir: string; files: string[] }> {
  const dir = env.tmp(`unzipped-${Math.random().toString(36).slice(2)}`)
  await extract(zip, { dir })
  return {
    dir,
    files: walk(dir)
      .map((f) => relative(dir, f).split('\\').join('/'))
      .sort()
  }
}

const FM_EXPECT: Record<ExportFormat, RegExp[]> = {
  generic: [
    /^title: "Lawn Aeration: A Practical Guide"$/m,
    /^seo_title: /m,
    /^focus_keyword: "lawn aeration"$/m,
    /^slug: "lawn-aeration"$/m,
    /^image: "images\/.+\.webp"$/m
  ],
  hugo: [
    /^draft: false$/m,
    /^slug: "lawn-aeration"$/m,
    /^keywords: \["lawn aeration", "lawn aeration cost"\]$/m,
    /^date: \d{4}-\d{2}-\d{2}$/m,
    /^images: \["images\/.+\.webp"\]$/m
  ],
  jekyll: [/^layout: post$/m, /^permalink: \/lawn-aeration\/$/m, /^categories: \["Guides"\]$/m, /^image: /m],
  astro: [/^pubDate: \d{4}-\d{2}-\d{2}$/m, /^heroImage: "images\/.+\.webp"$/m, /^description: "/m],
  eleventy: [
    /^layout: layouts\/post\.njk$/m,
    /^permalink: \/lawn-aeration\/$/m,
    /^tags: \["lawn aeration", "spring"\]$/m
  ],
  'nextjs-mdx': [/^date: "\d{4}-\d{2}-\d{2}"$/m, /^slug: "lawn-aeration"$/m, /^keywords: \[/m, /^image: /m]
}

describe('file-set export (spec 8.2)', () => {
  it('has a check for every front-matter preset', () => {
    expect([...EXPORT_FORMATS].sort()).toEqual(Object.keys(FM_EXPECT).sort())
  })

  for (const format of EXPORT_FORMATS) {
    it(`produces the <slug>/ zip structure for the "${format}" preset`, async () => {
      const { site, featured, inline } = await fixture()
      const c = makeContent(site.id, { slug: 'lawn-aeration' })
      // reuse the library images on this piece (the inline one is placed in the body)
      const f2 = reuseImage(featured.id, c.id, 'featured')
      const i2 = reuseImage(inline.id, c.id, 'section-1')
      expect(getContent(c.id).bodyHtml).toContain(`autbot-media://img/${i2.id}`)

      const zip = await exportZip(c.id, env.tmp(`${format}.zip`), format)
      const { dir, files } = await unzip(zip)
      const root = 'lawn-aeration'
      for (const f of [
        'index.html',
        'content.md',
        'content.txt',
        'images.csv',
        'meta.json',
        'schema.json',
        'README.txt'
      ])
        expect(files, `${format}: ${f}`).toContain(`${root}/${f}`)
      expect(files).toContain(`${root}/images/${f2.filename}`)
      expect(files).toContain(`${root}/images/${i2.filename}`)
      expect(files.every((f) => f.startsWith(`${root}/`))).toBe(true)
      const read = (p: string) => readFileSync(join(dir, root, p), 'utf8')

      // images are the optimised WebP files
      const webp = readFileSync(join(dir, root, 'images', f2.filename))
      expect(webp.subarray(0, 4).toString()).toBe('RIFF')
      expect(webp.subarray(8, 12).toString()).toBe('WEBP')

      const html = read('index.html')
      expect(html).toMatch(/<title>Lawn Aeration: Costs, Timing and Tips<\/title>/)
      expect(html).toMatch(/<meta name="description" content="Everything about lawn aeration/)
      expect(html).toMatch(/<meta property="og:title"/)
      expect(html).toMatch(/<meta property="og:image" content="images\//)
      expect(html).toMatch(/<link rel="canonical" href="https:\/\/greenlawns\.example\/lawn-aeration\/">/)
      expect(html).toMatch(/<script type="application\/ld\+json">[\s\S]*BlogPosting[\s\S]*<\/script>/)
      expect(html).toContain(`src="images/${i2.filename}"`)
      expect(html).not.toContain('autbot-media://')

      const md = read('content.md')
      expect(md.startsWith('---\n')).toBe(true)
      const fm = md.split('---\n')[1]
      for (const re of FM_EXPECT[format]) expect(fm, `${format} front matter`).toMatch(re)
      expect(md).toMatch(/^# Lawn Aeration: A Practical Guide$/m)
      expect(md).toMatch(/^## Why lawn aeration helps$/m)
      expect(md).not.toContain('autbot-media://')

      const txt = read('content.txt')
      expect(txt).toMatch(/^Lawn Aeration: A Practical Guide/)
      expect(txt).toContain('WHY LAWN AERATION HELPS')
      expect(txt).not.toMatch(/<[a-z]/)

      const csv = read('images.csv').trim().split('\n')
      expect(csv[0]).toBe('filename,alt,title,caption,description')
      expect(csv).toHaveLength(3)
      expect(csv.some((l) => l.startsWith(f2.filename))).toBe(true)

      const meta = JSON.parse(read('meta.json'))
      expect(Object.keys(meta).sort()).toEqual(
        [
          'title',
          'seo_title',
          'meta_description',
          'slug',
          'focus_keyword',
          'secondary_keywords',
          'categories',
          'tags',
          'excerpt',
          'schema',
          'internal_links'
        ].sort()
      )
      expect(meta.slug).toBe('lawn-aeration')
      expect(meta.focus_keyword).toBe('lawn aeration')
      expect(meta.internal_links).toEqual([
        { url: '/services', anchor: 'services' },
        { url: `${SITE_URL}/contact`, anchor: 'contact page' }
      ])
      expect(JSON.parse(read('schema.json'))['@type']).toBe('BlogPosting')

      const readme = read('README.txt')
      for (const builder of ['Wix', 'Squarespace', 'Shopify', 'Webflow', 'Hugo, Jekyll, Astro', 'Plain HTML'])
        expect(readme).toContain(builder)
    })
  }

  it('uses the site default format and includes the IndexNow key file when enabled', async () => {
    const site = makeSite()
    updateSite(site.id, {
      exportFormat: 'hugo',
      settings: { indexNowKey: 'abc123abc123', indexNowEnabled: true }
    })
    const c = makeContent(site.id)
    const { files } = buildExportFiles(c.id)
    expect(files.map((f) => f.path)).toContain('abc123abc123.txt')
    expect(String(files.find((f) => f.path === 'content.md')!.data)).toMatch(/^draft: false$/m)
  })

  it('exports a folder and works through the IPC route with the save dialog', async () => {
    const site = makeSite()
    const c = makeContent(site.id)
    const root = exportFolder(c.id, env.tmp('folder'), 'astro')
    expect(existsSync(join(root, 'index.html'))).toBe(true)
    expect(existsSync(join(root, 'content.md'))).toBe(true)

    env.savePath = null
    expect(await dispatch('content.export', { id: c.id })).toEqual({ ok: true, data: null })
    env.savePath = env.tmp('via-ipc.zip')
    const r = await dispatch('content.export', { id: c.id, format: 'jekyll' })
    expect(r).toEqual({ ok: true, data: env.savePath })
    const { files } = await unzip(env.savePath)
    expect(files).toContain('lawn-aeration/content.md')
    const preview = await dispatch('content.exportPreview', { id: c.id, format: 'generic' })
    expect(preview.ok && (preview.data as string[])).toContain('README.txt')
  })

  it('escapes front-matter values safely', () => {
    const fm = frontMatter('generic', {
      title: 'He said "hi": a guide',
      seoTitle: 's',
      description: 'line\nbreak',
      slug: 'x',
      keyword: 'k',
      secondary: [],
      categories: [],
      tags: [],
      date: '2026-01-01',
      image: null
    })
    expect(fm).toContain('title: "He said \\"hi\\": a guide"')
    expect(fm).toContain('description: "line\\nbreak"')
  })
})
