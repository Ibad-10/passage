// Token-based developer entry for bots that cannot do Google SSO. Works in every NODE_ENV.
// Cookie `dev_session` = base64url(JSON {userId, exp}) + "." + HMAC-SHA256(payload, DEV_ACCESS_TOKEN).
// Rotating DEV_ACCESS_TOKEN invalidates every session. An unset or short token disables the feature.
import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const DEV_SESSION_COOKIE = 'dev_session'
export const DEV_SESSION_TTL_MS = 12 * 60 * 60 * 1000
const MIN_TOKEN_LENGTH = 20

function devToken(): string | null {
  const t = process.env.DEV_ACCESS_TOKEN?.trim()
  return t && t.length >= MIN_TOKEN_LENGTH ? t : null
}

const sha256 = (s: string) => createHash('sha256').update(s).digest()
const hmac = (key: string, payload: string) => createHmac('sha256', key).update(payload).digest()

// Timing-safe: both sides hashed to equal length first.
export function tokenMatches(input: string): boolean {
  const token = devToken()
  if (!token || typeof input !== 'string' || !input) return false
  return timingSafeEqual(sha256(input), sha256(token))
}

export function signDevSession(userId: string, now = Date.now()): string | null {
  const token = devToken()
  if (!token) return null
  const payload = Buffer.from(JSON.stringify({ userId, exp: now + DEV_SESSION_TTL_MS })).toString('base64url')
  return `${payload}.${hmac(token, payload).toString('base64url')}`
}

// Returns the user id of a valid, unexpired session; null for anything tampered, expired or unsigned.
export function verifyDevSession(value: string | undefined, now = Date.now()): { userId: string } | null {
  const token = devToken()
  if (!token || !value) return null
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = value.slice(0, dot)
  const given = Buffer.from(value.slice(dot + 1), 'base64url')
  const expected = hmac(token, payload)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { userId?: unknown; exp?: unknown }
    if (typeof body.userId !== 'string' || typeof body.exp !== 'number' || body.exp <= now) return null
    return { userId: body.userId }
  } catch {
    return null
  }
}

export const devSessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: DEV_SESSION_TTL_MS / 1000,
}
