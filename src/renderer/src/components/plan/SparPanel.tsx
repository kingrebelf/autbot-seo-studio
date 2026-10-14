import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bot, NotebookPen, RotateCcw, Send, User } from 'lucide-react'
import { api } from '@/lib/api'
import { useApp, useSite } from '@/lib/app-context'
import { useAction } from '@/hooks/useApi'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Callout, ErrorText, Spinner } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { SimpleText } from './SimpleText'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

const NUMBER_FIELDS = [
  {
    key: 'monthlyLeads',
    label: 'Leads per month',
    placeholder: 'e.g. about 40 calls and forms',
    multiline: false
  },
  {
    key: 'leadSources',
    label: 'Where they come from',
    placeholder: 'e.g. 50% referrals, 30% Google Ads, 20% Facebook',
    multiline: false
  },
  {
    key: 'averageJobValue',
    label: 'Average job or order value',
    placeholder: 'e.g. $450, about 1 in 3 leads buy',
    multiline: false
  },
  {
    key: 'marketingSpend',
    label: 'Current marketing spend',
    placeholder: 'e.g. $1,200 a month on Google Ads',
    multiline: false
  },
  {
    key: 'goals',
    label: 'Goals',
    placeholder: 'e.g. 20 more jobs a month by summer, rely less on paid ads',
    multiline: true
  }
] as const

type NumberKey = (typeof NUMBER_FIELDS)[number]['key']
type Numbers = Record<NumberKey, string>

const EMPTY: Numbers = {
  monthlyLeads: '',
  leadSources: '',
  averageJobValue: '',
  marketingSpend: '',
  goals: ''
}
const OPENING =
  'Is SEO worth it for this business, how much should I put into it, and what would you do first?'

/** "Spar with AI": a plain-talking business adviser that decides whether SEO is worth it. */
export function SparPanel() {
  const site = useSite()
  const { reloadSites } = useApp()
  const [numbers, setNumbers] = useState<Numbers>(EMPTY)
  const [history, setHistory] = useState<ChatMsg[]>([])
  const [message, setMessage] = useState('')
  const [chatError, setChatError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const { busy, run } = useAction()
  const [ask, confirmDialog] = useConfirm()
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [history.length, busy])

  const filled = Object.values(numbers).some((v) => v.trim() !== '')

  const send = (text: string) =>
    run(
      'chat',
      async () => {
        const msg = text.trim()
        if (!msg) return
        const nums = Object.fromEntries(
          NUMBER_FIELDS.map((f) => [f.label, numbers[f.key].trim() || 'not given'])
        )
        setChatError(null)
        setHistory((h) => [...h, { role: 'user', content: msg }])
        setMessage('')
        const reply = await api('spar.chat', { siteId: site.id, numbers: nums, history, message: msg })
        setHistory((h) => [...h, { role: 'assistant', content: reply }])
      },
      (err) => {
        setChatError(err)
        // Take the unanswered question back out, so the user can try again.
        setHistory((h) => (h.length && h[h.length - 1].role === 'user' ? h.slice(0, -1) : h))
        setMessage(text)
      }
    )

  const conclude = () =>
    run('conclude', async () => {
      const notes = await api('spar.conclude', { siteId: site.id, history })
      setSaved(notes)
      await reloadSites()
      toast({
        kind: 'success',
        title: 'Saved to your strategy notes',
        body: 'Research and planning will use them from now on.'
      })
    })

  const restart = async () => {
    if (
      history.length &&
      !(await ask({
        title: 'Start a new conversation?',
        body: 'The current chat will be cleared. Strategy notes you already saved stay.',
        confirm: 'Start over'
      }))
    )
      return
    setHistory([])
    setChatError(null)
    setSaved(null)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void send(message)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Your numbers</CardTitle>
            <CardDescription>
              Rough figures are fine. The more you share, the more useful the advice. Nothing leaves your
              computer except to the AI model you connected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {NUMBER_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                {f.multiline ? (
                  <Textarea
                    value={numbers[f.key]}
                    placeholder={f.placeholder}
                    rows={3}
                    onChange={(e) => setNumbers((n) => ({ ...n, [f.key]: e.target.value }))}
                  />
                ) : (
                  <Input
                    value={numbers[f.key]}
                    placeholder={f.placeholder}
                    onChange={(e) => setNumbers((n) => ({ ...n, [f.key]: e.target.value }))}
                  />
                )}
              </Field>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <NotebookPen className="h-4 w-4" /> Strategy notes
            </CardTitle>
            <CardDescription>
              Saved to {site.name}&apos;s profile. Research, suggestions and the content calendar take these
              into account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {site.strategyNotes ? (
              <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">
                {site.strategyNotes}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                None yet. Talk it through on the right, then press &quot;Save conclusion to my profile&quot;.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="flex min-h-[560px] flex-col">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Should I even do this?</CardTitle>
            <CardDescription className="mt-1">
              An honest second opinion on whether SEO is worth it for you, how much to put in, and what to do
              first.
            </CardDescription>
          </div>
          {history.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => void restart()}>
              <RotateCcw /> Start over
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <div
            className="flex-1 space-y-4 overflow-y-auto rounded-md border bg-muted/20 p-4"
            style={{ maxHeight: 520 }}
          >
            {!history.length && (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center text-sm text-muted-foreground">
                <Bot className="h-8 w-8" />
                <p className="max-w-sm">
                  Fill in your numbers on the left, then ask the first question. The AI will ask follow-ups
                  where it needs more detail.
                </p>
                <Button onClick={() => void send(OPENING)} loading={busy === 'chat'} disabled={!filled}>
                  Is SEO worth it for me?
                </Button>
                {!filled && <p className="text-xs">Add at least one number to begin.</p>}
              </div>
            )}
            {history.map((m, i) => (
              <div key={i} className={cn('flex gap-3', m.role === 'user' && 'flex-row-reverse')}>
                <div
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  )}
                >
                  {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                    m.role === 'user' ? 'bg-primary/10' : 'border bg-background'
                  )}
                >
                  {m.role === 'assistant' ? (
                    <SimpleText text={m.content} />
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
              </div>
            ))}
            {busy === 'chat' && history.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> Thinking…
              </div>
            )}
            <div ref={bottom} />
          </div>
          <ErrorText error={chatError} />
          {history.length > 0 && (
            <form onSubmit={onSubmit} className="flex gap-2">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send(message)
                  }
                }}
                placeholder="Answer the question or ask your own. Enter to send, Shift+Enter for a new line."
                rows={2}
                className="min-h-0 resize-none"
                disabled={busy === 'chat'}
              />
              <Button
                type="submit"
                size="icon"
                className="h-auto w-11"
                aria-label="Send"
                loading={busy === 'chat'}
                disabled={!message.trim()}
              >
                {busy !== 'chat' && <Send />}
              </Button>
            </form>
          )}
          {history.some((m) => m.role === 'assistant') && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                Happy with where you landed? Save a short summary so the rest of the app plans around it.
              </p>
              <Button
                variant="secondary"
                onClick={() => void conclude()}
                loading={busy === 'conclude'}
                disabled={busy === 'chat'}
              >
                <NotebookPen /> Save conclusion to my profile
              </Button>
            </div>
          )}
          {saved && (
            <Callout kind="success" title="Added to your strategy notes">
              <div className="whitespace-pre-wrap">{saved}</div>
            </Callout>
          )}
        </CardContent>
      </Card>
      {confirmDialog}
    </div>
  )
}
