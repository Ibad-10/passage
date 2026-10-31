'use server'
// Desk actions (plan Tasks 7 and 8). AI suggests; people decide: nothing here auto-signs.
import { refresh } from 'next/cache'
import { z } from 'zod'
import { can } from '@/domain/permissions'
import { quotesForRoute } from '@/domain/pricing'
import type { CaseState, Route, User } from '@/domain/types'
import { getAiProvider, type AiResult } from '@/providers/ai'
import { logEvent } from './audit'
import {
  INTERNAL_ROLES,
  NOT_FOUND,
  applyTransition,
  caseForAction,
  latestScreening,
  loadFiles,
  type ActionResult,
  type FileRow,
  type ScreeningRow,
} from './core'
import { CASE_FILES_BUCKET, db } from './db'
import { getCurrentUser } from './session'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isInternal = (u: User) => INTERNAL_ROLES.includes(u.role as (typeof INTERNAL_ROLES)[number])
const reasonOk = (s: string) => s.trim().length > 0 && s.length <= 2000

async function loadResult(user: User, resultId: string) {
  if (!UUID.test(resultId)) return null
  const { data } = await db().from('screening_results').select('*').eq('id', resultId).maybeSingle()
  if (!data) return null
  const found = await caseForAction(user, data.case_id)
  return found ? { r: data as ScreeningRow, ...found } : null
}

export async function proposeClearMatch(resultId: string, reason: string): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in' }
  if (!can(user.role, 'propose_clear_match')) return { error: 'Only an analyst can propose clearing a match' }
  if (!reasonOk(reason)) return { error: 'A reason (up to 2000 characters) is required' }
  const found = await loadResult(user, resultId)
  if (!found) return { error: 'Screening result not found' }
  const { r, c } = found
  if (c.state !== 'SanctionsReview') return { error: `Not allowed while the case is ${c.state}` }
  if (r.result === 'clear' || r.decision) return { error: 'This result needs no decision' }
  const { error } = await db()
    .from('screening_results')
    .update({ proposed_by: user.id, proposed_reason: reason.trim() })
    .eq('id', r.id)
    .is('decision', null)
  if (error) throw new Error(`propose clear: ${error.message}`)
  await logEvent({ actorId: user.id, action: 'propose_clear_match', object: 'screening_result', objectId: r.id, location: user.location })
  refresh()
  return { ok: true }
}

// Officer only (§5.3). Confirmed closes the case; cleared moves on once every flagged result is cleared.
export async function decideMatch(
  resultId: string,
  decision: 'cleared' | 'confirmed',
  reason: string,
): Promise<ActionResult<{ state: CaseState }>> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in' }
  if (!can(user.role, 'clear_match')) return { error: 'Only an officer can decide a sanctions match' }
  if (decision !== 'cleared' && decision !== 'confirmed') return { error: 'Decision must be cleared or confirmed' }
  if (!reasonOk(reason)) return { error: 'A reason (up to 2000 characters) is required' }
  const found = await loadResult(user, resultId)
  if (!found) return { error: 'Screening result not found' }
  const { r, c } = found
  if (c.state !== 'SanctionsReview') return { error: `Not allowed while the case is ${c.state}` }
  if (r.result === 'clear') return { error: 'This result needs no decision' }

  const { data: updated, error } = await db()
    .from('screening_results')
    .update({ reviewed_by: user.id, decision, reason: reason.trim() })
    .eq('id', r.id)
    .is('decision', null)
    .select('id')
  if (error) throw new Error(`decide match: ${error.message}`)
  if (!updated?.length) return { error: 'This result was already decided' }
  await logEvent({ actorId: user.id, action: `decide_match:${decision}`, object: 'screening_result', objectId: r.id, location: user.location })

  let state: CaseState = c.state
  if (decision === 'confirmed') {
    const res = await applyTransition(c, { type: 'sanctionsConfirmed' }, { sanctions_status: 'blocked' })
    if ('error' in res) return res
    state = res.state
  } else {
    const pending = (await latestScreening(c.id)).filter((x) => x.result !== 'clear' && x.decision !== 'cleared')
    if (!pending.length) {
      const res = await applyTransition(c, { type: 'sanctionsCleared' }, { sanctions_status: 'clear' })
      if ('error' in res) return res
      state = res.state
    }
  }
  refresh()
  return { ok: true, state }
}

export async function askClient(caseId: string, text: string, kind: 'ANSWER' | 'SIGN'): Promise<ActionResult<{ questionId: string }>> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in' }
  if (!can(user.role, 'ask_client')) return { error: 'Your role cannot ask the client' }
  if (kind !== 'ANSWER' && kind !== 'SIGN') return { error: 'Kind must be ANSWER or SIGN' }
  if (!reasonOk(text)) return { error: 'The question must be 1 to 2000 characters' }
  const found = await caseForAction(user, caseId)
  if (!found) return { error: NOT_FOUND }
  const { c } = found
  const route = c.state === 'RouteInProgress'
  if (kind === 'SIGN' && !route) return { error: 'Signature requests are only possible during route work' }
  const res = await applyTransition(c, route ? { type: 'needClient', kind } : { type: 'askClient' }, { pending_client_kind: kind })
  if ('error' in res) return res
  const { data, error } = await db()
    .from('questions')
    .insert({ case_id: c.id, from_user: user.id, to_role: kind === 'SIGN' ? 'client_approver' : 'client_member', text: text.trim() })
    .select('id')
    .single()
  if (error) throw new Error(`insert question: ${error.message}`)
  await logEvent({ actorId: user.id, action: `ask_client:${kind}`, object: 'question', objectId: data.id, location: user.location })
  refresh()
  return { ok: true, questionId: data.id }
}

const TEXT_EXT = new Set(['txt', 'md', 'csv', 'json'])

// Controlled technology never leaves for the AI service (§9.2); PDFs await text extraction.
async function fileText(f: FileRow): Promise<{ name: string; text: string }> {
  const meta = `${f.name}, type ${f.type}, ${f.size_bytes} bytes, ${f.sensitivity}`
  if (f.sensitivity === 'controlled_technology') return { name: f.name, text: `[withheld: controlled technology is not sent to the AI service] ${meta}` }
  const ext = f.name.toLowerCase().split('.').pop() ?? ''
  // ponytail: no PDF parser yet; add one (e.g. unpdf) when real PDF specs arrive.
  if (ext === 'pdf') return { name: f.name, text: `[pdf text extraction pending] ${meta}` }
  if (!TEXT_EXT.has(ext)) return { name: f.name, text: `[unsupported format, text not extracted] ${meta}` }
  const { data, error } = await db().storage.from(CASE_FILES_BUCKET).download(f.storage_path)
  if (error || !data) throw new Error(`download ${f.name}: ${error?.message ?? 'no data'}`)
  return { name: f.name, text: await data.text() }
}

// AI first pass (§4.3 1.4). Failure keeps the case in Classifying with ai_status='failed', the
// analyst's "manual classification" flag (Review Focus 4). Never changes state.
export async function runAiFirstPass(caseId: string): Promise<ActionResult<{ result: AiResult }>> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in' }
  if (!isInternal(user) || !can(user.role, 'view_technical', { assigned: true })) return { error: NOT_FOUND }
  const found = await caseForAction(user, caseId)
  if (!found) return { error: NOT_FOUND }
  const { c } = found
  if (c.state !== 'Classifying') return { error: `Not allowed while the case is ${c.state}` }

  let result: AiResult
  try {
    const files = await Promise.all((await loadFiles(c.id)).map(fileText))
    result = await getAiProvider().run({ files, endUse: c.end_use ?? '' })
  } catch (e) {
    await db().from('cases').update({ ai_status: 'failed' }).eq('id', c.id).eq('state', 'Classifying')
    await logEvent({ actorId: user.id, action: 'ai_first_pass_failed', object: 'case', objectId: c.id, location: user.location })
    refresh()
    return { error: `AI first pass failed; classify manually. ${e instanceof Error ? e.message : String(e)}` }
  }
  const { data, error } = await db()
    .from('cases')
    .update({ ai_result: result, ai_status: 'done' })
    .eq('id', c.id)
    .eq('state', 'Classifying')
    .select('id')
  if (error) throw new Error(`store AI result: ${error.message}`)
  if (!data?.length) return { error: 'This case has changed since you loaded it. Reload and try again.' }
  await logEvent({ actorId: user.id, action: 'ai_first_pass', object: 'case', objectId: c.id, location: user.location })
  refresh()
  return { ok: true, result }
}

const ClassificationInput = z.object({
  listEntries: z.array(z.string().trim().min(1).max(100)).max(50),
  reasoning: z.string().trim().min(1, 'reasoning is required').max(10000),
  rulebookRefs: z.array(z.string().trim().min(1).max(200)).max(50),
  confidence: z.number().min(0).max(1).nullable().optional(),
})

export async function saveClassification(
  caseId: string,
  input: { listEntries: string[]; reasoning: string; rulebookRefs: string[]; confidence: number | null },
): Promise<ActionResult<{ classificationId: string }>> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in' }
  if (user.role !== 'analyst' && user.role !== 'officer') return { error: 'Only an analyst or officer can classify' }
  const parsed = ClassificationInput.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  const found = await caseForAction(user, caseId)
  if (!found) return { error: NOT_FOUND }
  const { c } = found
  if (c.state !== 'Classifying') return { error: `Not allowed while the case is ${c.state}` }

  const row = {
    list_entries: parsed.data.listEntries,
    reasoning: parsed.data.reasoning,
    rulebook_refs: parsed.data.rulebookRefs,
    confidence: parsed.data.confidence ?? null,
  }
  // One unsigned classification per case: re-saving (after a client answer) updates it.
  const { data: draft } = await db().from('classifications').select('id').eq('case_id', c.id).is('signed_by', null).limit(1)
  const write = draft?.[0]
    ? db().from('classifications').update(row).eq('id', draft[0].id).select('id').single()
    : db().from('classifications').insert({ ...row, case_id: c.id }).select('id').single()
  const { data, error } = await write
  if (error) throw new Error(`save classification: ${error.message}`)
  const res = await applyTransition(c, { type: 'classified' })
  if ('error' in res) return res
  await logEvent({ actorId: user.id, action: 'save_classification', object: 'classification', objectId: data.id, location: user.location })
  refresh()
  return { ok: true, classificationId: data.id }
}

// Officer signs the classification and decides the route (§4.5). B or C creates the quote(s);
// opts.both = "B or C both possible": all four quotes are shown and the client picks one.
export async function signRoute(
  caseId: string,
  route: Route,
  note: string,
  opts: { both?: boolean } = {},
): Promise<ActionResult<{ state: CaseState; quoteIds: string[] }>> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in' }
  if (!can(user.role, 'sign_classification')) return { error: 'Only an officer can sign' }
  if (!['A', 'B', 'C', 'D'].includes(route)) return { error: 'Route must be A, B, C or D' }
  const trimmed = (note ?? '').trim()
  if (trimmed.length > 2000) return { error: 'Note is over 2000 characters' }
  if (route === 'D' && !trimmed) return { error: 'Route D needs the reasons the client will see' }
  if (opts.both && route !== 'B' && route !== 'C') return { error: '"Both possible" applies only to B or C' }
  const found = await caseForAction(user, caseId)
  if (!found) return { error: NOT_FOUND }
  const { c, access } = found
  if (c.state !== 'OfficerReview') return { error: `Not allowed while the case is ${c.state}` }
  const { data: draft } = await db().from('classifications').select('id').eq('case_id', c.id).is('signed_by', null).limit(1)
  const classificationId = draft?.[0]?.id as string | undefined
  if (!classificationId) return { error: 'There is no classification to sign' }

  const res = await applyTransition(c, { type: 'officerRoute', route }, { route, route_note: trimmed || null })
  if ('error' in res) return res
  const signed = await db()
    .from('classifications')
    .update({ signed_by: user.id, signed_at: new Date().toISOString() })
    .eq('id', classificationId)
    .is('signed_by', null)
  if (signed.error) throw new Error(`sign classification: ${signed.error.message}`)
  await logEvent({ actorId: user.id, action: 'sign_classification', object: 'classification', objectId: classificationId, location: user.location })

  let quoteIds: string[] = []
  const quotes = quotesForRoute(route, access.org.plan, { both: opts.both })
  if (quotes.length) {
    const { data, error } = await db()
      .from('quotes')
      .insert(quotes.map((q) => ({ case_id: c.id, item: q.item, amount: q.amountPence, status: 'shown' })))
      .select('id')
    if (error) throw new Error(`insert quotes: ${error.message}`)
    quoteIds = (data ?? []).map((q: { id: string }) => q.id)
  }
  await logEvent({ actorId: user.id, action: `sign_route:${route}`, object: 'case', objectId: c.id, location: user.location })
  refresh()
  return { ok: true, state: res.state, quoteIds }
}
