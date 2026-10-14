import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { useApp } from '@/lib/app-context'
import { timeAgo, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Drawer } from './Drawer'

export function NotificationsPanel({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { siteId } = useApp()
  const nav = useNavigate()
  const { data, reload } = useApi('notifications.list', open ? { siteId } : null)
  useEffect(() => {
    if (open) void reload()
  }, [open, reload])
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Notifications"
      actions={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => api('notifications.markRead', { siteId }).then(reload)}
        >
          Mark all read
        </Button>
      }
    >
      {!data?.length && (
        <p className="text-sm text-muted-foreground">
          No notifications yet. You'll see drafts ready for review and ranking changes here.
        </p>
      )}
      <ul className="space-y-2">
        {data?.map((n) => (
          <li key={n.id}>
            <button
              className={cn(
                'w-full rounded-md border p-3 text-left text-sm hover:bg-accent',
                !n.read && 'border-primary/40 bg-primary/5'
              )}
              onClick={() => {
                if (n.link) {
                  onOpenChange(false)
                  nav(n.link)
                }
              }}
            >
              <div className="font-medium">{n.title}</div>
              {n.body && <div className="text-muted-foreground">{n.body}</div>}
              <div className="mt-1 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</div>
            </button>
          </li>
        ))}
      </ul>
    </Drawer>
  )
}
