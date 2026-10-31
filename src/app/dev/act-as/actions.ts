'use server'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { CLIENT_ROLES, type Role } from '@/domain/types'
import { logEvent } from '@/server/audit'
import { db } from '@/server/db'
import { ACT_AS_COOKIE, actAsAllowed } from '@/server/session'

// The page 404s in production, but this is a public POST endpoint, so it checks again itself.
export async function actAs(form: FormData): Promise<void> {
  if (!(await actAsAllowed())) notFound()
  const id = String(form.get('userId') ?? '')
  const { data: user } = /^[0-9a-f-]{36}$/i.test(id)
    ? await db().from('users').select('id, role, location').eq('id', id).maybeSingle()
    : { data: null }
  if (!user) notFound()
  ;(await cookies()).set(ACT_AS_COOKIE, user.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })
  await logEvent({ actorId: user.id, action: 'act_as', object: 'user', objectId: user.id, location: user.location })
  redirect(CLIENT_ROLES.includes(user.role as Role) ? '/cases' : '/desk')
}
