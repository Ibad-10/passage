// getCurrentUser precedence (dev_session > act_as > Clerk), DEV_EMAILS gating, and the signed dev_session cookie.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeDb } from './fakeDb'

const h = vi.hoisted(() => ({
  db: null as unknown as import('./fakeDb').FakeDb,
  cookies: new Map<string, string>(),
  clerkUserId: null as string | null,
  emails: [] as { emailAddress: string; verification: { status: string } }[],
}))
vi.mock('@/server/db', () => ({ db: () => h.db }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (h.cookies.has(n) ? { name: n, value: h.cookies.get(n) } : undefined) }),
}))
const auth = vi.fn(async () => ({ userId: h.clerkUserId }))
const currentUser = vi.fn(async () => (h.clerkUserId ? { id: h.clerkUserId, emailAddresses: h.emails } : null))
vi.mock('@clerk/nextjs/server', () => ({ auth, currentUser }))

const { getCurrentUser, actAsAllowed } = await import('@/server/session')
const { signDevSession, verifyDevSession, tokenMatches, DEV_SESSION_TTL_MS } = await import('@/server/devSession')

const TOKEN = 'a-very-long-dev-access-token-0123456789'
const MEMBER = '00000000-0000-0000-0000-000000000102'
const OFFICER = '00000000-0000-0000-0000-000000000202'
const DEV = '00000000-0000-0000-0000-000000000901'
const users = [
  { id: MEMBER, name: 'Mark Member', email: 'member@skyline.test', role: 'client_member', clerk_user_id: null },
  { id: OFFICER, name: 'Owen Officer', email: 'officer@passage.test', role: 'officer', clerk_user_id: 'clerk_officer' },
  { id: DEV, name: 'Ibad (dev)', email: 'dev@example.com', role: 'client_admin', clerk_user_id: null },
]
const verified = (e: string) => ({ emailAddress: e, verification: { status: 'verified' } })

beforeEach(() => {
  h.db = new FakeDb({ users })
  h.cookies.clear()
  h.clerkUserId = null
  h.emails = []
  auth.mockClear()
  currentUser.mockClear()
  vi.stubEnv('DEV_ACCESS_TOKEN', TOKEN)
  vi.stubEnv('DEV_EMAILS', 'dev@example.com, other@example.com')
})
afterEach(() => vi.unstubAllEnvs())

describe('dev_session cookie', () => {
  it('sign/verify round-trip', () => {
    const c = signDevSession(MEMBER)!
    expect(verifyDevSession(c)).toEqual({ userId: MEMBER })
  })
  it('tampered payload or signature is rejected', () => {
    const c = signDevSession(MEMBER)!
    const [payload, sig] = c.split('.')
    const forged = Buffer.from(JSON.stringify({ userId: OFFICER, exp: Date.now() + DEV_SESSION_TTL_MS })).toString('base64url')
    expect(verifyDevSession(`${forged}.${sig}`)).toBeNull()
    expect(verifyDevSession(`${payload}.${sig[0] === 'A' ? 'B' : 'A'}${sig.slice(1)}`)).toBeNull()
    expect(verifyDevSession(payload)).toBeNull()
    expect(verifyDevSession('garbage')).toBeNull()
  })
  it('expired session is rejected', () => {
    const now = Date.now()
    const c = signDevSession(MEMBER, now)!
    expect(verifyDevSession(c, now + DEV_SESSION_TTL_MS - 1)).toEqual({ userId: MEMBER })
    expect(verifyDevSession(c, now + DEV_SESSION_TTL_MS + 1)).toBeNull()
  })
  it('wrong token is rejected (entry and cookies signed with another token)', () => {
    expect(tokenMatches(TOKEN)).toBe(true)
    expect(tokenMatches('a-very-long-dev-access-token-WRONG-9')).toBe(false)
    expect(tokenMatches('')).toBe(false)
    const c = signDevSession(MEMBER)!
    vi.stubEnv('DEV_ACCESS_TOKEN', 'another-token-that-is-long-enough')
    expect(verifyDevSession(c)).toBeNull()
  })
  it('unset or short DEV_ACCESS_TOKEN disables everything', () => {
    const c = signDevSession(MEMBER)!
    for (const v of [undefined, '', 'short-token-19-char']) {
      vi.stubEnv('DEV_ACCESS_TOKEN', v)
      expect(signDevSession(MEMBER)).toBeNull()
      expect(verifyDevSession(c)).toBeNull()
      expect(tokenMatches('short-token-19-char')).toBe(false)
    }
  })
})

describe('getCurrentUser', () => {
  it('a valid dev_session wins in production, over act_as and Clerk, without calling Clerk', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    h.cookies.set('dev_session', signDevSession(MEMBER)!)
    h.cookies.set('act_as', OFFICER)
    expect((await getCurrentUser())?.id).toBe(MEMBER)
    expect(auth).not.toHaveBeenCalled()
  })
  it('a tampered dev_session is ignored', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const [payload, sig] = signDevSession(MEMBER)!.split('.')
    h.cookies.set('dev_session', `${payload}.${sig[0] === 'A' ? 'B' : 'A'}${sig.slice(1)}`)
    expect(await getCurrentUser()).toBeNull()
  })
  it('outside production act_as works without Clerk', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    h.cookies.set('act_as', OFFICER)
    expect((await getCurrentUser())?.id).toBe(OFFICER)
    expect(auth).not.toHaveBeenCalled()
  })
  it('in production a copied act_as cookie alone grants nothing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    h.cookies.set('act_as', OFFICER)
    expect(await getCurrentUser()).toBeNull()
  })
  it('in production act_as works for a Clerk user with a verified DEV_EMAILS address', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    h.cookies.set('act_as', OFFICER)
    h.clerkUserId = 'clerk_dev'
    h.emails = [verified('Dev@Example.com')]
    expect((await getCurrentUser())?.id).toBe(OFFICER)
  })
  it('in production an unverified dev email or a non-dev Clerk user falls back to their own row', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    h.cookies.set('act_as', MEMBER)
    h.clerkUserId = 'clerk_officer'
    h.emails = [{ emailAddress: 'dev@example.com', verification: { status: 'unverified' } }]
    expect((await getCurrentUser())?.id).toBe(OFFICER)
    h.emails = [verified('officer@passage.test')]
    expect((await getCurrentUser())?.id).toBe(OFFICER)
  })
  it('first Clerk sign-in links the seeded row by verified email, once', async () => {
    h.clerkUserId = 'clerk_new'
    h.emails = [verified('member@skyline.test')]
    expect((await getCurrentUser())?.id).toBe(MEMBER)
    expect(h.db.rows('users').find((u) => u.id === MEMBER)?.clerk_user_id).toBe('clerk_new')
    h.clerkUserId = 'clerk_attacker' // a second Clerk account with the same email cannot take it over
    expect(await getCurrentUser()).toBeNull()
  })
  it('signed out and no cookies -> null', async () => {
    expect(await getCurrentUser()).toBeNull()
  })
})

describe('actAsAllowed', () => {
  it('always outside production; in production only for dev_session or DEV_EMAILS', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(await actAsAllowed()).toBe(true)
    vi.stubEnv('NODE_ENV', 'production')
    expect(await actAsAllowed()).toBe(false)
    h.clerkUserId = 'clerk_x'
    h.emails = [verified('nobody@example.com')]
    expect(await actAsAllowed()).toBe(false)
    h.emails = [verified('other@example.com')]
    expect(await actAsAllowed()).toBe(true)
    h.clerkUserId = null
    h.cookies.set('dev_session', signDevSession(MEMBER)!)
    expect(await actAsAllowed()).toBe(true)
  })
})
