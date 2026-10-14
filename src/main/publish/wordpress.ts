import { fetchWithRetry, HttpError, ua } from '../http'
import { UserError } from '../errors'
import { getSecret, setSecret } from '../secrets'
import { log, registerSecret } from '../logger'

/**
 * WordPress REST API client. The app ONLY ever creates drafts: the status sent to
 * WordPress is hardcoded to "draft" in `buildPostPayload`, which every write goes through.
 */
export const WP_DRAFT_STATUS = 'draft' as const

export const wpSecretRef = (siteId: number) => `wordpress:${siteId}`

export interface PostInput {
  title: string
  content: string
  excerpt?: string
  slug?: string
  categories?: number[]
  tags?: number[]
  featured_media?: number
  meta?: Record<string, string>
}

/** The single place a post body is built. Any `status` the caller passes is ignored. */
export function buildPostPayload(input: PostInput & { status?: unknown }): Record<string, unknown> {
  const { status: _ignored, ...rest } = input as PostInput & { status?: unknown }
  void _ignored
  const payload: Record<string, unknown> = { ...rest }
  for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k]
  payload.status = WP_DRAFT_STATUS
  return payload
}

export type SeoPlugin = 'yoast' | 'rankmath' | 'aioseo' | null

export const SEO_META_KEYS: Record<
  Exclude<SeoPlugin, null>,
  { title: string; description: string; focus: string }
> = {
  yoast: { title: '_yoast_wpseo_title', description: '_yoast_wpseo_metadesc', focus: '_yoast_wpseo_focuskw' },
  rankmath: {
    title: 'rank_math_title',
    description: 'rank_math_description',
    focus: 'rank_math_focus_keyword'
  },
  aioseo: { title: '_aioseo_title', description: '_aioseo_description', focus: '_aioseo_keywords' }
}

export class WordPressClient {
  private base: string
  private useRestRoute = false
  constructor(
    siteUrl: string,
    private user: string,
    private appPassword: string
  ) {
    this.base = siteUrl.replace(/\/$/, '')
    if (!/^https:\/\//i.test(this.base) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(this.base))
      throw new UserError(
        'WordPress application passwords only work over HTTPS. Use your site address starting with https://.'
      )
  }

  private auth(): string {
    return `Basic ${Buffer.from(`${this.user}:${this.appPassword.replace(/\s+/g, '')}`).toString('base64')}`
  }

  private url(route: string): string {
    const [path, query] = route.split('?')
    if (this.useRestRoute) return `${this.base}/?rest_route=/${path}${query ? `&${query}` : ''}`
    return `${this.base}/wp-json/${path}${query ? `?${query}` : ''}`
  }

  /** Request a REST route, falling back to ?rest_route= when /wp-json/ is blocked. */
  async request<T>(
    route: string,
    init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {}
  ): Promise<{ data: T; headers: Headers }> {
    const doFetch = async () =>
      fetchWithRetry(this.url(route), {
        ...init,
        headers: {
          authorization: this.auth(),
          'user-agent': ua(),
          accept: 'application/json',
          ...(init.headers ?? {})
        },
        retries: 3,
        timeoutMs: 120_000
      })
    let res: Response
    try {
      res = await doFetch()
      const ct = res.headers.get('content-type') ?? ''
      if (!/json/.test(ct) && !this.useRestRoute) throw new HttpError(404, 'not json', this.url(route))
    } catch (e) {
      if (
        !this.useRestRoute &&
        e instanceof HttpError &&
        (e.status === 404 || (e.status === 403 && /rest_disabled|not json/i.test(e.body)))
      ) {
        this.useRestRoute = true
        res = await doFetch()
      } else throw e
    }
    return { data: (await res.json()) as T, headers: res.headers }
  }

  explain(e: unknown): Error {
    if (e instanceof UserError) return e
    if (e instanceof HttpError) {
      const code = e.apiCode()
      if (e.status === 401 || code === 'incorrect_password' || code === 'invalid_username')
        return new UserError(
          'WordPress rejected the username or application password. Check you used the application password (not your normal password), and that the username matches. Some security plugins and hosts disable application passwords.'
        )
      if (e.status === 403 || code === 'rest_cannot_create')
        return new UserError(
          "WordPress says this user isn't allowed to do that. Give the app's user the Author role (posts) or Editor role (pages), or check your security plugin."
        )
      if (e.status === 404)
        return new UserError(
          "Couldn't find the WordPress REST API on this site. Check the site address, make sure permalinks are set (Settings > Permalinks > Save), and that no security plugin blocks the REST API."
        )
      if (e.status === 413)
        return new UserError(
          'The image is too large for your WordPress upload limit. Ask your host to raise it, or use a smaller image.'
        )
      return new UserError(
        `WordPress returned an error (${e.status}: ${e.apiMessage()}). Try again; if it keeps happening, check your security plugin or host.`
      )
    }
    if (e instanceof Error && /ENOTFOUND|ECONNREFUSED|fetch failed/.test(e.message + String(e.cause ?? '')))
      return new UserError("Couldn't reach your website. Check the address and your internet connection.")
    return e instanceof Error ? e : new Error(String(e))
  }

  async test(): Promise<{
    name: string
    roles: string[]
    canPosts: boolean
    canPages: boolean
    seoPlugin: SeoPlugin
    viaRestRoute: boolean
  }> {
    try {
      const { data } = await this.request<{
        name: string
        roles?: string[]
        capabilities?: Record<string, boolean>
      }>('wp/v2/users/me?context=edit')
      const caps = data.capabilities ?? {}
      return {
        name: data.name,
        roles: data.roles ?? [],
        canPosts: Boolean(caps.edit_posts),
        canPages: Boolean(caps.edit_pages),
        seoPlugin: await this.detectSeoPlugin(),
        viaRestRoute: this.useRestRoute
      }
    } catch (e) {
      throw this.explain(e)
    }
  }

  async detectSeoPlugin(): Promise<SeoPlugin> {
    try {
      const { data } = await this.request<{ namespaces?: string[] }>('')
      const ns = data.namespaces ?? []
      if (ns.some((n) => n.startsWith('yoast'))) return 'yoast'
      if (ns.some((n) => n.startsWith('rankmath'))) return 'rankmath'
      if (ns.some((n) => n.startsWith('aioseo'))) return 'aioseo'
    } catch (e) {
      log.warn('Could not read WordPress namespaces', e)
    }
    return null
  }

  async listAll(
    type: 'posts' | 'pages',
    max = 1000
  ): Promise<
    { id: number; link: string; title: string; content: string; excerpt: string; status: string }[]
  > {
    const out: {
      id: number
      link: string
      title: string
      content: string
      excerpt: string
      status: string
    }[] = []
    try {
      for (let page = 1; out.length < max; page++) {
        const { data, headers } = await this.request<
          {
            id: number
            link: string
            status: string
            title: { rendered: string }
            content: { rendered: string }
            excerpt: { rendered: string }
          }[]
        >(
          `wp/v2/${type}?per_page=100&page=${page}&status=publish&_fields=id,link,status,title,content,excerpt`
        )
        for (const p of data)
          out.push({
            id: p.id,
            link: p.link,
            status: p.status,
            title: p.title.rendered,
            content: p.content.rendered,
            excerpt: p.excerpt.rendered
          })
        const pages = Number(headers.get('x-wp-totalpages') ?? 1)
        if (page >= pages || !data.length) break
      }
    } catch (e) {
      if (e instanceof HttpError && e.status === 400) return out // past the last page
      throw this.explain(e)
    }
    return out
  }

  async listTerms(taxonomy: 'categories' | 'tags'): Promise<{ id: number; name: string }[]> {
    const { data } = await this.request<{ id: number; name: string }[]>(
      `wp/v2/${taxonomy}?per_page=100&_fields=id,name`
    )
    return data
  }

  /** Find terms by name, creating the missing ones. */
  async ensureTerms(taxonomy: 'categories' | 'tags', names: string[]): Promise<number[]> {
    const ids: number[] = []
    for (const name of names.map((n) => n.trim()).filter(Boolean)) {
      try {
        const { data } = await this.request<{ id: number; name: string }[]>(
          `wp/v2/${taxonomy}?search=${encodeURIComponent(name)}&per_page=20&_fields=id,name`
        )
        const hit = data.find((t) => t.name.toLowerCase() === name.toLowerCase())
        if (hit) {
          ids.push(hit.id)
          continue
        }
        const created = await this.request<{ id: number }>(`wp/v2/${taxonomy}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name })
        })
        ids.push(created.data.id)
      } catch (e) {
        if (e instanceof HttpError && e.apiCode() === 'term_exists') {
          const id = Number((JSON.parse(e.body) as { data?: { term_id?: number } }).data?.term_id)
          if (id) ids.push(id)
        } else throw this.explain(e)
      }
    }
    return ids
  }

  async uploadMedia(file: Buffer, filename: string, mime: string): Promise<{ id: number; url: string }> {
    try {
      const { data } = await this.request<{ id: number; source_url: string }>('wp/v2/media', {
        method: 'POST',
        headers: {
          'content-type': mime,
          'content-disposition': `attachment; filename="${filename.replace(/"/g, '')}"`
        },
        body: new Uint8Array(file)
      })
      return { id: data.id, url: data.source_url }
    } catch (e) {
      throw this.explain(e)
    }
  }

  async updateMedia(
    id: number,
    fields: { alt_text?: string; caption?: string; description?: string; title?: string }
  ): Promise<void> {
    try {
      await this.request(`wp/v2/media/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(fields)
      })
    } catch (e) {
      throw this.explain(e)
    }
  }

  /** Create a NEW draft post or page. Never updates an existing one. */
  async createDraft(
    type: 'posts' | 'pages',
    input: PostInput
  ): Promise<{ id: number; link: string; meta: Record<string, unknown> }> {
    try {
      const { data } = await this.request<{ id: number; link: string; meta?: Record<string, unknown> }>(
        `wp/v2/${type}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(buildPostPayload(input))
        }
      )
      return { id: data.id, link: data.link, meta: data.meta ?? {} }
    } catch (e) {
      throw this.explain(e)
    }
  }

  /**
   * Save changes as an autosave (a revision) of an existing post. WordPress keeps the live
   * post untouched until someone publishes the autosave in the editor.
   */
  async createAutosave(type: 'posts' | 'pages', parentId: number, input: PostInput): Promise<{ id: number }> {
    try {
      const body = buildPostPayload(input)
      const { data } = await this.request<{ id: number }>(`wp/v2/${type}/${parentId}/autosaves`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
      return { id: data.id }
    } catch (e) {
      throw this.explain(e)
    }
  }

  async getPost(
    type: 'posts' | 'pages',
    id: number
  ): Promise<{ id: number; status: string; link: string; content: string; title: string } | null> {
    try {
      const { data } = await this.request<{
        id: number
        status: string
        link: string
        content: { raw?: string; rendered: string }
        title: { raw?: string; rendered: string }
      }>(`wp/v2/${type}/${id}?context=edit&_fields=id,status,link,content,title`)
      return {
        id: data.id,
        status: data.status,
        link: data.link,
        content: data.content.raw ?? data.content.rendered,
        title: data.title.raw ?? data.title.rendered
      }
    } catch (e) {
      if (e instanceof HttpError && (e.status === 404 || e.status === 410)) return null
      throw this.explain(e)
    }
  }

  editUrl(id: number): string {
    return `${this.base}/wp-admin/post.php?post=${id}&action=edit`
  }
}

export function saveWordPressPassword(siteId: number, password: string): void {
  // WordPress shows application passwords with spaces; scrub that form from logs too.
  registerSecret(password.trim())
  setSecret(wpSecretRef(siteId), password.replace(/\s+/g, ''))
}

export function wpClientFor(site: {
  id: number
  url: string
  settings: Record<string, unknown> | null
}): WordPressClient {
  const s = (site.settings ?? {}) as { wpUrl?: string; wpUser?: string }
  const pass = getSecret(wpSecretRef(site.id))
  if (!s.wpUser || !pass)
    throw new UserError(
      'WordPress is not connected for this site. Go to Settings > Publishing and connect it, or use Export instead.'
    )
  return new WordPressClient(s.wpUrl || site.url, s.wpUser, pass)
}

export function wpConnected(site: { id: number; settings: Record<string, unknown> | null }): boolean {
  const s = (site.settings ?? {}) as { wpUser?: string }
  return Boolean(s.wpUser && getSecret(wpSecretRef(site.id)))
}
