// Current user. Clerk proves identity; our `users` row carries role, org, vetting and location.
// Precedence:
//   1. a valid, unexpired, HMAC-signed `dev_session` cookie (token entry at /dev/enter), any NODE_ENV;
//   2. the `act_as` cookie (a seeded user id), only when act-as is allowed for this request: always
//      outside production, and in production only for a Clerk user whose verified email is in
//      DEV_EMAILS. The Clerk identity is re-checked on every request, so a copied act_as cookie alone
//      grants nothing;
//   3. Clerk, mapped to our row by clerk_user_id (or linked by verified email on first sign-in).
import 'server-only'
import { auth, currentUser } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import type { User } from '@/domain/types'
import { db } from './db'
import { DEV_SESSION_COOKIE, verifyDevSession } from './devSession'

export const ACT_AS_COOKIE = 'act_as'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const devEmails = (): string[] =>
  (process.env.DEV_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

// Verified email addresses of the signed-in Clerk user; null when signed out.
async function clerkVerifiedEmails(): Promise<string[] | null> {
  const u = await currentUser()
  if (!u) return null
  return u.emailAddresses.filter((e) => e.verification?.status === 'verified').map((e) => e.emailAddress.toLowerCase())
}

// User id from a valid dev_session cookie, or null.
export async function devSessionUserId(): Promise<string | null> {
  return verifyDevSession((await cookies()).get(DEV_SESSION_COOKIE)?.value)?.userId ?? null
}

export async function actAsAllowed(): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') return true
  if (await devSessionUserId()) return true
  const allow = devEmails()
  if (!allow.length) return false
  const { userId } = await auth()
  if (!userId) return false
  const emails = (await clerkVerifiedEmails()) ?? []
  return emails.some((e) => allow.includes(e))
}

export async function userById(id: string): Promise<User | null> {
  if (!UUID.test(id)) return null
  const { data, error } = await db().from('users').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`users lookup failed: ${error.message}`)
  return (data as User | null) ?? null
}

export async function getCurrentUser(): Promise<User | null> {
  const devUserId = await devSessionUserId()
  if (devUserId) {
    const dev = await userById(devUserId)
    if (dev) return dev
  }

  const actAs = (await cookies()).get(ACT_AS_COOKIE)?.value
  if (actAs && (await actAsAllowed())) {
    const seeded = await userById(actAs)
    if (seeded) return seeded
  }

  const { userId } = await auth()
  if (!userId) return null
  const linked = await db().from('users').select('*').eq('clerk_user_id', userId).maybeSingle()
  if (linked.error) throw new Error(`users lookup failed: ${linked.error.message}`)
  if (linked.data) return linked.data as User

  // First sign-in: link to the seeded row with the same verified email. Guarded so an already
  // linked row is never taken over by a second Clerk account.
  const emails = await clerkVerifiedEmails()
  if (!emails?.length) return null
  const match = await db().from('users').select('id').in('email', emails).is('clerk_user_id', null).limit(1)
  if (match.error) throw new Error(`users lookup failed: ${match.error.message}`)
  const id = match.data?.[0]?.id
  if (!id) return null
  const { data, error } = await db()
    .from('users')
    .update({ clerk_user_id: userId })
    .eq('id', id)
    .is('clerk_user_id', null)
    .select('*')
  if (error) throw new Error(`users link failed: ${error.message}`)
  return (data?.[0] as User | undefined) ?? null
}
