import { useState } from 'react'
import { Button } from './button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog'

/** A small confirm dialog: `const [ask, dialog] = useConfirm(); if (await ask({...})) ...` */
export function useConfirm() {
  const [state, setState] = useState<{
    title: string
    body?: string
    confirm?: string
    danger?: boolean
    resolve: (v: boolean) => void
  } | null>(null)
  const ask = (o: { title: string; body?: string; confirm?: string; danger?: boolean }) =>
    new Promise<boolean>((resolve) => setState({ ...o, resolve }))
  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  const dialog = (
    <Dialog open={Boolean(state)} onOpenChange={(o) => !o && close(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state?.title}</DialogTitle>
          {state?.body && <DialogDescription>{state.body}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant={state?.danger ? 'destructive' : 'default'} onClick={() => close(true)}>
            {state?.confirm ?? 'OK'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
  return [ask, dialog] as const
}
