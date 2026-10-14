import { useEffect, useState } from 'react'
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
import { Field, Label, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ErrorText } from '@/components/ui/misc'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: number
  months: 6 | 12
  hasItems: boolean
  onStarted: () => void
}

/** Asks for notes, then runs Mode G ("Plan my next months") in the background. */
export function PlanDialog({ open, onOpenChange, siteId, months, hasItems, onStarted }: Props) {
  const [notes, setNotes] = useState('')
  const [replace, setReplace] = useState(false)
  const [span, setSpan] = useState<6 | 12>(months)
  const [error, setError] = useState<string | null>(null)
  const { busy, run } = useAction()

  useEffect(() => {
    if (open) {
      setSpan(months)
      setError(null)
    }
  }, [open, months])

  const start = () =>
    run(
      'start',
      async () => {
        await api('modes.start', {
          siteId,
          mode: 'G',
          months: span,
          notes: notes.trim() || undefined,
          replace
        })
        onStarted()
        onOpenChange(false)
      },
      setError
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Plan my next {span} months</DialogTitle>
          <DialogDescription>
            The AI looks at your services, your pages and (if connected) your Search Console data, then gives
            each month one focus, one main page and 3 to 5 supporting posts.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex gap-2">
            {([6, 12] as const).map((n) => (
              <Button
                key={n}
                variant={span === n ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSpan(n)}
              >
                {n} months
              </Button>
            ))}
          </div>
          <Field
            label="Anything else I should know?"
            hint="Busy seasons, promotions, services you want to push, things to avoid."
          >
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. We want more boiler service jobs in autumn. We are launching heat pumps in March."
              rows={4}
            />
          </Field>
          {hasItems && (
            <div className="flex items-start gap-3 rounded-md border p-3">
              <Switch id="plan-replace" checked={replace} onCheckedChange={setReplace} />
              <div>
                <Label htmlFor="plan-replace">Replace the current plan</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Removes future items that are still only planned. Items you have started or finished stay.
                  Leave this off to add the new ideas next to what you have.
                </p>
              </div>
            </div>
          )}
          <ErrorText error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void start()} loading={busy === 'start'}>
            Make the plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
