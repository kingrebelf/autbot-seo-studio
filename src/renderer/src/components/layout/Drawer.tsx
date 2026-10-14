import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

/** Right-side sheet. */
export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  actions,
  side = 'right'
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  children: ReactNode
  actions?: ReactNode
  side?: 'right' | 'bottom'
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <D.Content
          aria-describedby={undefined}
          className={
            side === 'right'
              ? 'fixed bottom-0 right-0 top-0 z-50 flex w-[440px] max-w-full flex-col border-l bg-background shadow-xl'
              : 'fixed bottom-0 left-60 right-0 z-50 flex h-[45vh] flex-col border-t bg-background shadow-xl'
          }
        >
          <div className="flex items-center justify-between border-b p-4">
            <D.Title className="font-semibold">{title}</D.Title>
            <div className="flex items-center gap-2">
              {actions}
              <D.Close aria-label="Close" className="rounded p-1 hover:bg-accent">
                <X className="h-4 w-4" />
              </D.Close>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
