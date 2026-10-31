// Append-only audit log (§7.1 principle 5, §9.6). A failed write throws: an action must not
// succeed silently without its audit record.
import 'server-only'
import { db } from './db'

export async function logEvent(e: {
  actorId: string | null // null only when there is no authenticated actor (e.g. a failed dev entry)
  action: string
  object: string
  objectId: string
  location?: string
}): Promise<void> {
  const { error } = await db().from('audit_events').insert({
    actor_id: e.actorId,
    action: e.action,
    object: e.object,
    object_id: e.objectId,
    location: e.location ?? null,
  })
  if (error) throw new Error(`Audit log write failed: ${error.message}`)
}
