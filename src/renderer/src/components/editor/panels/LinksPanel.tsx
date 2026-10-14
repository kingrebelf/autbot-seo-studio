import { useMemo } from 'react'
import { Check, X, ExternalLink, Link2, CheckCircle2, XCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { useAction } from '@/hooks/useApi'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toast'
import { useEditorCtx } from '../context'
import { hostOf, readResearch } from '../types'
import { Section } from './Section'

export function openExternal(url: string): void {
  api('app.openExternal', { url }).catch(() =>
    toast({ kind: 'error', title: "Couldn't open that address", body: url })
  )
}

function UrlText({ url }: { url: string }) {
  return (
    <button
      type="button"
      className="inline-flex max-w-full items-center gap-1 truncate text-left text-xs text-primary hover:underline"
      onClick={() => openExternal(url)}
      title={url}
    >
      <span className="truncate">{url}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </button>
  )
}

export function LinksPanel() {
  const { content, checks, site, applyContent, flushSave } = useEditorCtx()
  const { busy, run } = useAction()
  const sp = checks.seoPass
  const suggestions = sp?.internal_links ?? []
  const body = content.bodyHtml ?? ''
  const research = readResearch(content.research)

  const external = useMemo(() => {
    const doc = new DOMParser().parseFromString(body, 'text/html')
    const siteHost = hostOf(site?.url ?? '')
    const out = new Map<string, string>()
    doc.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') ?? ''
      if (!/^https?:/i.test(href)) return
      const h = hostOf(href)
      if (h && h !== siteHost && !out.has(href)) out.set(href, a.textContent?.trim() ?? '')
    })
    return [...out.entries()].map(([href, text]) => ({ href, text }))
  }, [body, site?.url])

  const accept = (urls?: string[]) =>
    run(urls ? `acc:${urls[0]}` : 'all', async () => {
      await flushSave()
      const r = await api('content.applyLinks', { id: content.id, urls })
      applyContent(r.content, { syncBody: true })
      toast({
        kind: r.added ? 'success' : 'info',
        title: r.added ? `Added ${r.added} link${r.added === 1 ? '' : 's'}` : 'No links added',
        body: r.added
          ? undefined
          : "The anchor text wasn't found in the draft, or the link is already there. You can add it by hand with the link button."
      })
    })

  const reject = (url: string) =>
    run(`rej:${url}`, async () => {
      applyContent(await api('content.rejectLink', { id: content.id, url }))
    })

  const linkBacks = () =>
    run('linkbacks', async () => {
      await api('content.linkBacks', { id: content.id })
      toast({
        kind: 'info',
        title: 'Adding links as draft revisions',
        body: 'Nothing is published. Review each revision in WordPress.'
      })
    })

  return (
    <div className="space-y-6">
      <Section
        title="Suggested internal links"
        hint="Links to other pages on your site, with the words to link from."
        actions={
          suggestions.length > 1 ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              loading={busy === 'all'}
              disabled={busy !== null}
              onClick={() => void accept()}
            >
              Accept all
            </Button>
          ) : undefined
        }
      >
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {sp ? 'No suggestions right now.' : 'Suggestions appear after the checks run.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {suggestions.map((l) => {
              const inDraft = body.includes(`href="${l.url}"`)
              return (
                <li key={l.url} className="rounded-md border p-2.5 text-sm">
                  <div className="font-medium">“{l.anchor}”</div>
                  <UrlText url={l.url} />
                  {l.placement_hint && (
                    <div className="mt-1 text-xs text-muted-foreground">{l.placement_hint}</div>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    {inDraft ? (
                      <Badge variant="success">In the draft</Badge>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          className="h-7 px-2"
                          loading={busy === `acc:${l.url}`}
                          disabled={busy !== null}
                          onClick={() => void accept([l.url])}
                        >
                          <Check /> Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          loading={busy === `rej:${l.url}`}
                          disabled={busy !== null}
                          onClick={() => void reject(l.url)}
                        >
                          <X /> Reject
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section title="External sources cited" hint="Links in the draft that point to other websites.">
        {external.length === 0 ? (
          <p className="text-sm text-muted-foreground">No outside links in the draft.</p>
        ) : (
          <ul className="space-y-1.5">
            {external.map((l) => (
              <li key={l.href} className="text-sm">
                {l.text && <div className="truncate">{l.text}</div>}
                <UrlText url={l.href} />
              </li>
            ))}
          </ul>
        )}
        {research.sources.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Research sources ({research.sources.length})
            </summary>
            <ul className="mt-1.5 space-y-1">
              {research.sources.slice(0, 40).map((s) => (
                <li key={s}>
                  <UrlText url={s} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section
        title="Pages that should link here"
        hint="A to-do list: add a link from each of these older pages to this one once it's live."
      >
        {!sp?.link_backs.length ? (
          <p className="text-sm text-muted-foreground">
            {sp ? 'Nothing suggested.' : 'Suggestions appear after the checks run.'}
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {sp.link_backs.map((l, i) => (
                <li key={`${l.from_url}-${i}`} className="flex gap-2 text-sm">
                  <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <UrlText url={l.from_url} />
                    <div>
                      Link from: <span className="font-medium">“{l.anchor}”</span>
                    </div>
                    {l.reason && <div className="text-xs text-muted-foreground">{l.reason}</div>}
                  </div>
                </li>
              ))}
            </ul>
            {site?.wpConnected && (
              <details className="rounded-md border p-2.5 text-sm">
                <summary className="cursor-pointer font-medium">Advanced</summary>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Saves a draft revision of each older WordPress page with the link added. Your live pages
                  don't change until you review and update them in WordPress.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  loading={busy === 'linkbacks'}
                  onClick={() => void linkBacks()}
                >
                  Add these links as draft revisions
                </Button>
              </details>
            )}
          </>
        )}
      </Section>

      <Section title="Link check" hint="Every link in the draft, opened to make sure it works.">
        {!checks.links ? (
          <p className="text-sm text-muted-foreground">Runs with the full checks.</p>
        ) : checks.links.length === 0 ? (
          <p className="text-sm text-muted-foreground">No links to check.</p>
        ) : (
          <ul className="space-y-1.5">
            {[...checks.links]
              .sort((a, b) => Number(a.ok) - Number(b.ok))
              .map((l) => (
                <li key={l.href} className="flex items-start gap-2 text-sm">
                  {l.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0">
                    <UrlText url={l.href} />
                    {(!l.ok || l.note) && (
                      <div className="text-xs text-muted-foreground">
                        {l.status ? `Status ${l.status}. ` : ''}
                        {l.note}
                      </div>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
