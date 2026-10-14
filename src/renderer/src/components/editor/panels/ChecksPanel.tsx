import { ShieldAlert, Quote, ExternalLink, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { useAction } from '@/hooks/useApi'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Callout } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { cn } from '@/lib/utils'
import { useEditorCtx } from '../context'
import { findText } from '../extensions'
import { StateIcon } from './SeoPanel'
import { openExternal } from './LinksPanel'
import { Section } from './Section'

export function ChecksPanel() {
  const { content, checks, editor, applyContent, flushSave, reload } = useEditorCtx()
  const { busy, run } = useAction()
  const [ask, confirmDialog] = useConfirm()
  const fc = checks.factCheck
  const confirms = content.unresolvedConfirms
  const readability = checks.seo.find((c) => c.id === 'readability')
  const dupes = checks.seo.filter((c) => c.id === 'duplicate' || c.id === 'cannibalization')

  /** Select and scroll to a piece of text in the editor. */
  const showInEditor = (text: string): boolean => {
    if (!editor) return false
    const hit = findText(editor.state.doc, text)
    if (!hit) return false
    editor.chain().focus().setTextSelection(hit).scrollIntoView().run()
    return true
  }

  const dismiss = (removeText: boolean) =>
    run(`dismiss:${removeText}`, async () => {
      const ok = await ask({
        title: removeText ? 'Remove every [CONFIRM] placeholder?' : 'Keep the placeholder text?',
        body: removeText
          ? 'The placeholders and the text inside them are deleted from the draft. Read the sentences around them afterwards.'
          : 'The [CONFIRM: ...] text stays in the draft, but sending is no longer blocked. Make sure you edit it before publishing.',
        confirm: removeText ? 'Remove them' : 'Keep text and dismiss',
        danger: removeText
      })
      if (!ok) return
      await flushSave()
      applyContent(await api('content.dismissConfirms', { id: content.id, removeText }), { syncBody: true })
    })

  const tick = (index: number, ticked: boolean) =>
    run(`tick:${index}`, async () => {
      applyContent(await api('content.tickClaim', { id: content.id, index, ticked }))
    })

  const applyRewrite = (passage: string, rewrite: string) => {
    if (!editor) return
    const hit = findText(editor.state.doc, passage)
    if (!hit) {
      toast({
        kind: 'info',
        title: "That passage isn't in the draft any more",
        body: 'It may already have been edited.'
      })
      return
    }
    editor.chain().focus().insertContentAt(hit, rewrite).scrollIntoView().run()
    toast({
      kind: 'success',
      title: 'Passage rewritten',
      body: 'Use Undo in the toolbar if you prefer the old version.'
    })
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      {content.ymyl && (
        <Callout kind="warning" title="Extra care needed">
          This topic needs extra care. Have a qualified person check it before publishing.
        </Callout>
      )}

      <Section
        title="Facts to confirm"
        hint="Highlighted in yellow in the editor. Replace each one with the real detail. Sending is blocked until they're done or dismissed."
      >
        {confirms.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing left to confirm.</p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {confirms.map((c, i) => (
                <li key={`${c}-${i}`}>
                  <button
                    type="button"
                    className="w-full rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-left text-sm hover:bg-warning/20"
                    onClick={() =>
                      showInEditor(`[CONFIRM: ${c}`) ||
                      showInEditor(c) ||
                      toast({ kind: 'info', title: "Couldn't find it in the editor" })
                    }
                  >
                    {c}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                loading={busy === 'dismiss:false'}
                disabled={busy !== null}
                onClick={() => void dismiss(false)}
              >
                Dismiss placeholders (keep text)
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={busy === 'dismiss:true'}
                disabled={busy !== null}
                onClick={() => void dismiss(true)}
              >
                Dismiss and remove text
              </Button>
            </div>
          </>
        )}
      </Section>

      {!fc && (
        <Callout kind="info" title="Fact-check hasn't run yet">
          <div className="space-y-2">
            <p>
              The fact-check, brand safety and "sounds human" checks run after writing, or when you re-run the
              checks.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(content.activeJob)}
              loading={busy === 'checks'}
              onClick={() =>
                void run('checks', async () => {
                  await flushSave()
                  await api('content.runChecks', { id: content.id })
                  await reload()
                })
              }
            >
              <RefreshCw /> Run checks
            </Button>
          </div>
        </Callout>
      )}

      {fc && (
        <Section
          title="Claims to verify"
          hint="Prices, numbers, dates, specs, promises. Tick each one once you've checked it."
        >
          {fc.claims.length === 0 ? (
            <p className="text-sm text-muted-foreground">No claims flagged.</p>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">
                {fc.ticked.length} of {fc.claims.length} checked
              </div>
              <ul className="space-y-2">
                {fc.claims.map((c, i) => {
                  const done = fc.ticked.includes(i)
                  return (
                    <li
                      key={i}
                      className={cn('flex gap-2 rounded-md border p-2.5 text-sm', done && 'bg-muted/40')}
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={done}
                        disabled={busy === `tick:${i}`}
                        onChange={(e) => void tick(i, e.target.checked)}
                        aria-label="Checked"
                      />
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          className={cn(
                            'text-left hover:underline',
                            done && 'text-muted-foreground line-through'
                          )}
                          onClick={() => showInEditor(c.sentence)}
                        >
                          {c.sentence}
                        </button>
                        {c.why && <div className="mt-0.5 text-xs text-muted-foreground">{c.why}</div>}
                        {c.suggested_source &&
                          (/^https?:\/\//.test(c.suggested_source) ? (
                            <button
                              type="button"
                              className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              onClick={() => openExternal(c.suggested_source)}
                            >
                              Check here <ExternalLink className="h-3 w-3" />
                            </button>
                          ) : (
                            <div className="mt-0.5 text-xs">Check with: {c.suggested_source}</div>
                          ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </Section>
      )}

      {fc && (
        <Section
          title="Brand safety"
          hint='Anything that clashes with your "must never say or promise" list.'
        >
          {fc.brand_safety.length === 0 ? (
            <p className="text-sm text-muted-foreground">No conflicts found.</p>
          ) : (
            <ul className="space-y-2">
              {fc.brand_safety.map((b, i) => (
                <li
                  key={i}
                  className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-sm"
                >
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div>
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => showInEditor(b.sentence)}
                    >
                      {b.sentence}
                    </button>
                    <div className="text-xs text-muted-foreground">{b.conflict}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {fc && (
        <Section
          title="Sounds human"
          hint="Passages that read as robotic or generic, with a suggested rewrite."
        >
          {fc.robotic.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing flagged.</p>
          ) : (
            <ul className="space-y-2">
              {fc.robotic.map((r, i) => (
                <li key={i} className="space-y-1.5 rounded-md border p-2.5 text-sm">
                  <button
                    type="button"
                    className="text-left text-muted-foreground hover:underline"
                    onClick={() => showInEditor(r.passage)}
                  >
                    <Quote className="mr-1 inline h-3 w-3" />
                    {r.passage}
                  </button>
                  <div className="rounded bg-success/10 px-1.5 py-1">{r.rewrite}</div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    disabled={!editor?.isEditable}
                    onClick={() => applyRewrite(r.passage, r.rewrite)}
                  >
                    Apply rewrite
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section title="Readability">
        {readability ? (
          <div className="flex items-start gap-2 text-sm">
            <StateIcon state={readability.state} className="mt-0.5" />
            <div>
              <div>{readability.detail}</div>
              <div className="text-xs text-muted-foreground">
                Flesch reading ease: higher is easier. Aim for 50 or more for most customers.
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Shown after the article is scored.</p>
        )}
      </Section>

      <Section
        title="Duplicate and overlap warnings"
        hint="Pages on your site that compete with this one for the same search, or repeat its text."
      >
        {dupes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Shown after the article is scored.</p>
        ) : (
          <ul className="space-y-2">
            {dupes.map((d) => (
              <li key={d.id} className="flex items-start gap-2 text-sm">
                <StateIcon state={d.state} className="mt-0.5" />
                <div>
                  <div className="font-medium">{d.label}</div>
                  <div className="text-xs text-muted-foreground">{d.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {fc && fc.citations.length > 0 && (
        <Section title="Sources the fact-checker used">
          <ul className="space-y-1">
            {fc.citations.map((c) => (
              <li key={c.url}>
                <button
                  type="button"
                  className="inline-flex max-w-full items-center gap-1 truncate text-left text-xs text-primary hover:underline"
                  onClick={() => openExternal(c.url)}
                  title={c.url}
                >
                  <span className="truncate">{c.title || c.url}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {fc && (
        <div className="text-xs text-muted-foreground">
          <Badge variant="outline">Tip</Badge> Click any sentence above to find it in the editor.
        </div>
      )}
    </div>
  )
}
