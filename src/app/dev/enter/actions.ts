'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CLIENT_ROLES } from '@/domain/types'
import { logEvent } from '@/server/audit'
import { DEV_SESSION_COOKIE, devSessionCookieOptions, signDevSession, tokenMatches } from '@/server/devSession'
import { userById } from '@/server/session'

export type EnterState = { error: string } | null

const GENERIC = 'Access denied. Check the token and try again.'

// Token entry for bots that cannot do Google SSO. The token only ever arrives in the POST body.
export async function enterDev(_prev: EnterState, form: FormData): Promise<EnterState> {
  const token = form.get('token')
  const userId = String(form.get('userId') ?? '')
  const user = typeof token === 'string' && tokenMatches(token) ? await userById(userId) : null
  const cookie = user ? signDevSession(user.id) : null
  if (!user || !cookie) {
    await logEvent({ actorId: null, action: 'dev_enter_failed', object: 'user', objectId: userId.slice(0, 64) || 'unknown' })
    await new Promise((r) => setTimeout(r, 1000)) // slow down guessing
    return { error: GENERIC }
  }
  ;(await cookies()).set(DEV_SESSION_COOKIE, cookie, devSessionCookieOptions)
  await logEvent({ actorId: user.id, action: 'dev_enter', object: 'user', objectId: user.id, location: user.location })
  redirect(CLIENT_ROLES.includes(user.role) ? '/cases' : '/desk')
}
