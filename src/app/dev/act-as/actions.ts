'use server'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { CLIENT_ROLES, type Role } from '@/domain/types'
import { logEvent } from '@/server/audit'
import { DEV_SESSION_COOKIE, devSessionCookieOptions, signDevSession } from '@/server/devSession'
import { ACT_AS_COOKIE, actAsAllowed, devSessionUserId, userById } from '@/server/session'

const home = (role: Role) => (CLIENT_ROLES.includes(role) ? '/cases' : '/desk')

// The page 404s when act-as is not allowed, but this is a public POST endpoint, so it checks again.
// A dev_session holder switches by re-signing dev_session (it outranks act_as in getCurrentUser).
export async function actAs(form: FormData): Promise<void> {
  if (!(await actAsAllowed())) notFound()
  const user = await userById(String(form.get('userId') ?? ''))
  if (!user) notFound()
  const store = await cookies()
  const devSession = (await devSessionUserId()) ? signDevSession(user.id) : null
  if (devSession) store.set(DEV_SESSION_COOKIE, devSession, devSessionCookieOptions)
  else store.set(ACT_AS_COOKIE, user.id, { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' })
  await logEvent({ actorId: user.id, action: 'act_as', object: 'user', objectId: user.id, location: user.location })
  redirect(home(user.role))
}
