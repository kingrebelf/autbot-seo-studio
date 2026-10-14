import { useEffect, useState } from 'react'
import { FileUp } from 'lucide-react'
import { api } from '@/lib/api'
import { useAction } from '@/hooks/useApi'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { ErrorText } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'

interface AddProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  siteId: number
  groups: string[]
  onAdded: () => void
}

export function AddKeywordDialog({ open, onOpenChange, siteId, groups, onAdded }: AddProps) {
  const [keywords, setKeywords] = useState('')
  const [group, setGroup] = useState('')
  const [target, setTarget] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { busy, run } = useAction()

  useEffect(() => {
    if (open) {
      setKeywords('')
      setGroup('')
      setTarget('')
      setError(null)
    }
  }, [open])

  const list = keywords
    .split('\n')
    .map((k) => k.trim())
    .filter(Boolean)

  const add = () =>
    run(
      'add',
      async () => {
        if (!list.length) throw new Error('Type at least one keyword.')
        for (const keyword of list)
          await api('keywords.add', {
            siteId,
            keyword,
            group: group.trim() || undefined,
            targetUrl: target.trim() || undefined
          })
        toast({
          kind: 'success',
          title: list.length === 1 ? `Now tracking "${list[0]}"` : `Now tracking ${list.length} keywords`
        })
        onAdded()
        onOpenChange(false)
      },
      setError
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Track keywords</DialogTitle>
          <DialogDescription>
            The searches you want to show up for. Published content adds its own keywords automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Keywords" hint="One per line.">
            <Textarea
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              rows={4}
              placeholder={'lawn aeration\nlawn aeration cost'}
              autoFocus
            />
          </Field>
          <Field label="Group (optional)">
            <Input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              list="add-keyword-groups"
              placeholder="e.g. Lawn care"
            />
            <datalist id="add-keyword-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
          <Field label="Target page (optional)">
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="https://example.com/lawn-aeration"
            />
          </Field>
          <ErrorText error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void add()} loading={busy === 'add'} disabled={!list.length}>
            Track {list.length > 1 ? `${list.length} keywords` : 'keyword'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ImportProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  siteId: number
  onImported: () => void
}

export function ImportDialog({ open, onOpenChange, siteId, onImported }: ImportProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { busy, run } = useAction()

  useEffect(() => {
    if (open) {
      setText('')
      setError(null)
    }
  }, [open])

  const done = (r: { keywords: number; positions: number } | null) => {
    if (!r) return
    toast({
      kind: 'success',
      title: `Imported ${r.keywords} keyword${r.keywords === 1 ? '' : 's'}`,
      body: r.positions ? `${r.positions} positions added to the history.` : undefined
    })
    onImported()
    onOpenChange(false)
  }

  const fromFile = () => run('file', async () => done(await api('keywords.importCsv', { siteId })), setError)
  const fromText = () =>
    run('text', async () => done(await api('keywords.importCsvText', { siteId, text })), setError)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Import keywords</DialogTitle>
          <DialogDescription>
            Bring your keywords (and their positions) from Wincher, SEMrush, Ahrefs or a spreadsheet. The
            first row must have column names, including a Keyword column. Position, Date, URL and Group
            columns are picked up if present.
          </DialogDescription>
        </DialogHeader>
        <Button
          variant="outline"
          className="h-16 border-dashed"
          onClick={() => void fromFile()}
          loading={busy === 'file'}
        >
          <FileUp /> Choose a CSV file
        </Button>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or paste it <div className="h-px flex-1 bg-border" />
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          className="font-mono text-xs"
          placeholder={'Keyword,Position,Date\nlawn aeration,8,2026-09-01\nlawn aeration cost,14,2026-09-01'}
        />
        <ErrorText error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void fromText()} loading={busy === 'text'} disabled={!text.trim()}>
            Import pasted text
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
