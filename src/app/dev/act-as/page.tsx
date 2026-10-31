// Dev user switcher. Outside production anyone may use it; in production only a Clerk user whose
// verified email is in DEV_EMAILS. Everyone else gets a 404. Plain markup; styled by the UI layer.
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { db } from '@/server/db'
import { actAsAllowed } from '@/server/session'
import { actAs } from './actions'

export default function ActAsPage() {
  return (
    <main>
      <h1>Act as a seeded user</h1>
      <p>Development only. Choosing a user sets the act-as cookie and is written to the audit log.</p>
      <Suspense fallback={<p>Loading users…</p>}>
        <UserList />
      </Suspense>
    </main>
  )
}

async function UserList() {
  await connection() // request-time: never prerender the user list
  if (!(await actAsAllowed())) notFound()
  const [users, orgs] = await Promise.all([
    db().from('users').select('id, name, role, org_id').order('role').order('name'),
    db().from('organisations').select('id, name'),
  ])
  if (users.error) throw new Error(`load users: ${users.error.message}`)
  const orgName = (id: string | null) => orgs.data?.find((o) => o.id === id)?.name ?? 'Passage (internal)'
  return (
    <form action={actAs}>
      <ul>
        {(users.data ?? []).map((u) => (
          <li key={u.id}>
            <button type="submit" name="userId" value={u.id}>
              <span>{u.name}</span> <span>{u.role}</span> <span>{orgName(u.org_id)}</span>
            </button>
          </li>
        ))}
      </ul>
    </form>
  )
}
