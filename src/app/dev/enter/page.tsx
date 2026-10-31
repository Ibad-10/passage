// Developer entry with an access token (for automated agents that cannot do SSO). Available in every
// environment; disabled when DEV_ACCESS_TOKEN is unset or short (the action rejects every attempt).
import { Suspense } from 'react'
import { connection } from 'next/server'
import { db } from '@/server/db'
import { EnterForm } from './EnterForm'

export default function DevEnterPage() {
  return (
    <main>
      <h1>Developer entry</h1>
      <p>Enter the developer access token and pick a seeded user. Every attempt is written to the audit log.</p>
      <Suspense fallback={<p>Loading users…</p>}>
        <Users />
      </Suspense>
    </main>
  )
}

async function Users() {
  await connection()
  const [users, orgs] = await Promise.all([
    db().from('users').select('id, name, role, org_id').order('role').order('name'),
    db().from('organisations').select('id, name'),
  ])
  if (users.error) throw new Error(`load users: ${users.error.message}`)
  const orgName = (id: string | null) => orgs.data?.find((o) => o.id === id)?.name ?? 'no client organisation'
  return <EnterForm users={(users.data ?? []).map((u) => ({ id: u.id, label: `${u.name} (${u.role}, ${orgName(u.org_id)})` }))} />
}
