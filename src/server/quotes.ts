'use server'
// Quote actions (plan Task 9). No paid work before an approved fixed quote; once approved the
// price never changes (§1 principle 2). Approve/decline are one DB transaction (decide_quote).
import { refresh } from 'next/cache'
import { can } from '@/domain/permissions'
import type { CaseState, Quote, User } from '@/domain/types'
import { logEvent } from './audit'
import { caseForAction, isClientUser, nextState, type ActionResult } from './core'
import { db } from './db'
import { getCurrentUser } from './session'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOT_FOUND = 'Quote not found'

async function quoteFor(user: User, quoteId: string) {
  if (!UUID.test(quoteId)) return null
  const { data } = await db().from('quotes').select('*').eq('id', quoteId).maybeSingle()
  if (!data) return null
  const found = await caseForAction(user, data.case_id)
  return found ? { q: data as Quote, ...found } : null
}

async function decide(quoteId: string, status: 'approved' | 'declined'): Promise<ActionResult<{ state: CaseState }>> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in' }
  if (!can(user.role, 'approve_quote')) return { error: 'Only a client admin or approver can decide a quote' }
  const found = await quoteFor(user, quoteId)
  if (!found) return { error: NOT_FOUND }
  const { q, c } = found
  if (q.status !== 'shown') return { error: 'This quote is no longer open' }
  const next = nextState(c.state, { type: status === 'approved' ? 'approve' : 'decline' })
  if ('error' in next) return next
  const { error } = await db().rpc('decide_quote', {
    p_quote_id: q.id,
    p_user_id: user.id,
    p_status: status,
    p_from: c.state,
    p_to: next.to,
  })
  // Lost the race (double click, second tab): the function rolled back, nothing changed.
  if (error) return { error: 'This quote is no longer open. Reload to see the current state.' }
  await logEvent({ actorId: user.id, action: status === 'approved' ? 'approve_quote' : 'decline_quote', object: 'quote', objectId: q.id, location: user.location })
  refresh()
  return { ok: true, state: next.to }
}

export async function approveQuote(quoteId: string): Promise<ActionResult<{ state: CaseState }>> {
  return decide(quoteId, 'approved')
}

export async function declineQuote(quoteId: string): Promise<ActionResult<{ state: CaseState }>> {
  return decide(quoteId, 'declined')
}

export async function askAboutQuote(quoteId: string, text: string): Promise<ActionResult<{ questionId: string }>> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in' }
  if (!isClientUser(user) || user.role === 'client_viewer') return { error: 'Your role cannot ask about quotes' }
  const body = (text ?? '').trim()
  if (!body || body.length > 2000) return { error: 'The question must be 1 to 2000 characters' }
  const found = await quoteFor(user, quoteId)
  if (!found) return { error: NOT_FOUND }
  const { data, error } = await db()
    .from('questions')
    .insert({ case_id: found.c.id, from_user: user.id, to_role: 'analyst', text: `About quote ${found.q.id}: ${body}` })
    .select('id')
    .single()
  if (error) throw new Error(`insert question: ${error.message}`)
  await logEvent({ actorId: user.id, action: 'ask_about_quote', object: 'quote', objectId: found.q.id, location: user.location })
  refresh()
  return { ok: true, questionId: data.id }
}
