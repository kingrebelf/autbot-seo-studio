import { desc, eq } from 'drizzle-orm'
import { getDb, schema } from './db'
import { rt } from './runtime'
import { log } from './logger'

/** In-app notification + OS notification. */
export function notifyUser(
  siteId: number | null,
  kind: string,
  title: string,
  body: string,
  link?: string,
  os = true
): void {
  getDb()
    .insert(schema.notifications)
    .values({ siteId, kind, title, body, link: link ?? null })
    .run()
  try {
    if (os) rt().notify(title, body)
    rt().broadcast('notify', { kind, title, body, link })
  } catch (e) {
    log.warn('Notification failed', e)
  }
}

export function listNotifications(siteId: number | null, limit = 50) {
  const q = getDb().select().from(schema.notifications)
  return (siteId ? q.where(eq(schema.notifications.siteId, siteId)) : q)
    .orderBy(desc(schema.notifications.id))
    .limit(limit)
    .all()
}

export function markNotificationsRead(siteId: number | null): void {
  const q = getDb().update(schema.notifications).set({ read: true })
  ;(siteId ? q.where(eq(schema.notifications.siteId, siteId)) : q).run()
}
