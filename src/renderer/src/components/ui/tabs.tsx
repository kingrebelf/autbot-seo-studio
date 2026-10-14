import * as React from 'react'
import * as T from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

export const Tabs = T.Root

export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof T.List>) {
  return (
    <T.List
      className={cn(
        'inline-flex h-9 flex-wrap items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}
export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-2.5 py-1 text-sm font-medium transition-all focus-visible:outline-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow',
        className
      )}
      {...props}
    />
  )
}
export function TabsContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof T.Content>) {
  return <T.Content className={cn('mt-3 focus-visible:outline-none', className)} {...props} />
}
