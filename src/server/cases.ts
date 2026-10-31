'use server'
// Client-side case actions (plan Task 6) plus claimCase. Every export here is a public POST endpoint:
// each one authenticates, checks the permission matrix, applies the state machine and audits.
import { refresh } from 'next/cache'
import { missingItems } from '@/domain/completeness'
import { can } from '@/domain/permissions'
import { CLIENT_ROLES, type CaseState, type Sensitivity } from '@/domain/types'
import { logEvent } from './audit'
import {
  INTERNAL_ROLES,
  NOT_FOUND,
  applyTransition,
  caseForAction,
  caseProblems,
  isClientUser,
  latestScreening,
  loadCase,
  loadFiles,
  loadOrg,
  parseIntake,
  runScreening,
  splitProblems,
  storeFiles,
  type ActionResult,
  type CaseRow,
  type Intake,
  type ScreeningRow,
} from './core'
import { db } from './db'
import { getCurrentUser } from './session'

const SENSITIVITY_RANK: Sensitivity[] = ['unclassified', 'official_sensitive', 'controlled_technology']
const highestSensitivity = (files: Intake['files']): Sensitivity =>
  files.reduce<Sensitivity>((hi, f) => {
    const s = f.sensitivity as Sensitivity
    return SENSITIVITY_RANK.indexOf(s) > SENSITIVITY_RANK.indexOf(hi) ? s : hi
  }, 'unclassified')

const CLOSED: CaseState[] = ['ClosedNotControlled', 'ClosedDoNotProceed', 'Closed', 'Refused']

async function insertParties(parties: Intake['parties']): Promise<string[]> {
  if (!parties.length) return []
  const { data, error } = await db().from('parties').insert(parties).select('id')
  if (error) throw new Error(`insert parties: ${error.message}`)
  return (data ?? []).map((p: { id: string }) => p.id)
}

// Submits a Draft: completeness decides SanctionsCheck vs IntakeIncomplete; a complete case is
// screened straight away. A screening outage leaves it in SanctionsCheck for manual screening.
async function submit(user: Parameters<typeof runScreening>[0], c: CaseRow, missing: string[]) {
  const sub = await applyTransition(c, { type: 'submit', complete: missing.length === 0 })
  if ('error' in sub) return { state: c.state, warning: sub.error }
  await logEvent({ actorId: user.id, action: 'submit_case', object: 'case', objectId: c.id, location: user.location })
  if (sub.state !== 'SanctionsCheck') return { state: sub.state }
  const s = await runScreening(user, { ...c, state: sub.state })
  if ('error' in s) return { state: sub.state, warning: s.error }
  return { state: (await loadCase(c.id))!.state }
}

export async function createCase(
  form: FormData,
): Promise<{ caseId: string; state: CaseState; missing: string[]; warning?: string } | { errors: string[] }> {
  const user = await getCurrentUser()
  if (!user) return { errors: ['Not signed in'] }
  if (!can(user.role, 'open_case') || !user.org_id) return { errors: ['Your role cannot open cases'] }
  const org = await loadOrg(user.org_id)
  if (org.onboarding_status !== 'authorised' || org.sanctions_status === 'blocked') {
    return { errors: ['Your organisation is not authorised to open cases'] }
  }

  const parsed = await parseIntake(form)
  if ('errors' in parsed) return parsed
  const { intake } = parsed
  const { fileErrors, missing } = splitProblems(
    missingItems({ files: intake.files, parties: intake.parties, destination: intake.destination, endUse: intake.end_use, deadline: intake.deadline }),
  )
  // Bad files (empty, over 25 MB, SECRET, duplicate) reject the whole submission: nothing is stored.
  if (fileErrors.length) return { errors: fileErrors }

  const partyIds = await insertParties(intake.parties)
  const { data, error } = await db()
    .from('cases')
    .insert({
      org_id: user.org_id,
      party_ids: partyIds,
      destination: intake.destination ?? null,
      end_use: intake.end_use ?? null,
      deadline: intake.deadline ?? null,
      sensitivity: highestSensitivity(intake.files),
      state: 'Draft',
    })
    .select('*')
    .single()
  if (error) throw new Error(`insert case: ${error.message}`)
  const c = data as CaseRow
  await logEvent({ actorId: user.id, action: 'open_case', object: 'case', objectId: c.id, location: user.location })
  await storeFiles(user, c, intake.files)

  const result = await submit(user, c, missing)
  refresh()
  return { caseId: c.id, missing, ...result }
}

export async function addFiles(
  caseId: string,
  form: FormData,
): Promise<ActionResult<{ state: CaseState; missing: string[]; warning?: string }>> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in' }
  const found = await caseForAction(user, caseId)
  if (!found) return { error: NOT_FOUND }
  const { c, access } = found
  if (!can(user.role, 'upload', { assigned: access.assigned })) return { error: 'Your role cannot upload files' }
  if (access.org.onboarding_status !== 'authorised' || access.org.sanctions_status === 'blocked' || c.sanctions_status === 'blocked') {
    return { error: 'This case is locked' }
  }
  if (CLOSED.includes(c.state)) return { error: `Not allowed while the case is ${c.state}` }

  const parsed = await parseIntake(form)
  if ('errors' in parsed) return { error: parsed.errors.join('; ') }
  const { intake } = parsed
  if (!intake.files.length) return { error: 'No files selected' }
  const existing = await loadFiles(c.id)
  const { fileErrors } = splitProblems(
    missingItems({
      files: [
        ...existing.map((f) => ({ name: f.name, type: f.type, sizeBytes: f.size_bytes, sensitivity: f.sensitivity, hash: f.hash })),
        ...intake.files,
      ],
      parties: [],
    }),
  )
  if (fileErrors.length) return { error: fileErrors.join('; ') }

  // While the case is still intake, the client may also fill gaps (parties, destination, end use).
  const intakeOpen = c.state === 'Draft' || c.state === 'IntakeIncomplete'
  const patch: Record<string, unknown> = {}
  if (intakeOpen && isClientUser(user)) {
    if (intake.destination) patch.destination = intake.destination
    if (intake.end_use) patch.end_use = intake.end_use
    if (intake.deadline) patch.deadline = intake.deadline
    const newParties = await insertParties(intake.parties)
    if (newParties.length) patch.party_ids = [...c.party_ids, ...newParties]
  }

  await storeFiles(user, c, intake.files)
  let current: CaseRow = { ...c, ...patch } as CaseRow
  if (c.state === 'IntakeIncomplete') {
    const back = await applyTransition(c, { type: 'filesAdded' }, patch)
    if ('error' in back) return back
    current = { ...current, state: back.state }
  } else if (c.state === 'Draft' && Object.keys(patch).length) {
    const { error } = await db().from('cases').update(patch).eq('id', c.id).eq('state', 'Draft')
    if (error) throw new Error(`update case: ${error.message}`)
  }
  if (current.state !== 'Draft') {
    refresh()
    return { ok: true, state: current.state, missing: [] }
  }
  const missing = splitProblems(await caseProblems(current)).missing
  const result = await submit(user, current, missing)
  refresh()
  return { ok: true, missing, ...result }
}

export async function answerQuestion(questionId: string, form: FormData): Promise<ActionResult<{ state: CaseState }>> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in' }
  const answer = String(form.get('answer') ?? '').trim()
  if (!answer || answer.length > 4000) return { error: 'Answer must be 1 to 4000 characters' }
  const { data: q } = /^[0-9a-f-]{36}$/i.test(questionId)
    ? await db().from('questions').select('*').eq('id', questionId).maybeSingle()
    : { data: null }
  if (!q) return { error: 'Question not found' }
  const found = await caseForAction(user, q.case_id)
  if (!found) return { error: 'Question not found' }
  const { c } = found

  const toClient = CLIENT_ROLES.includes(q.to_role)
  if (toClient) {
    if (!isClientUser(user) || user.role === 'client_viewer') return { error: 'Your role cannot answer this question' }
    if (q.to_role === 'client_approver' && !can(user.role, 'sign_declaration')) return { error: 'Only an admin or approver can sign' }
  } else if (!INTERNAL_ROLES.includes(user.role as (typeof INTERNAL_ROLES)[number])) {
    return { error: 'Your role cannot answer this question' }
  }

  const { data: updated, error } = await db()
    .from('questions')
    .update({ answer, status: 'answered' })
    .eq('id', q.id)
    .eq('status', 'open')
    .select('id')
  if (error) throw new Error(`answer question: ${error.message}`)
  if (!updated?.length) return { error: 'This question was already answered' }
  await logEvent({ actorId: user.id, action: 'answer_question', object: 'question', objectId: q.id, location: user.location })

  let state: CaseState = c.state
  if (toClient && ['AwaitingClient', 'AwaitingClient2', 'AwaitingClient3'].includes(c.state)) {
    const { data: open } = await db().from('questions').select('id').eq('case_id', c.id).eq('status', 'open').in('to_role', [...CLIENT_ROLES])
    if (!open?.length) {
      const res = await applyTransition(c, { type: 'clientAnswered' }, { pending_client_kind: null })
      if ('error' in res) return res
      state = res.state
    }
  }
  refresh()
  return { ok: true, state }
}

// Manual (re)screening for a case stuck in SanctionsCheck after a provider outage.
export async function screenCase(caseId: string): Promise<ActionResult<{ results: ScreeningRow[] }>> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in' }
  const found = await caseForAction(user, caseId)
  if (!found) return { error: NOT_FOUND }
  const allowed = isClientUser(user) ? can(user.role, 'open_case') : can(user.role, 'view_sanctions', { assigned: found.access.assigned })
  if (!allowed) return { error: 'Your role cannot run screening' }
  const res = await runScreening(user, found.c)
  if ('error' in res) return res
  refresh()
  return { ok: true, results: await latestScreening(caseId) }
}

// Phase 1 has no assignment UI: analysts, officers and specialists claim a case from the desk queue.
export async function claimCase(caseId: string): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in' }
  if (!INTERNAL_ROLES.includes(user.role as (typeof INTERNAL_ROLES)[number])) return { error: NOT_FOUND }
  const c = await loadCase(caseId)
  if (!c) return { error: NOT_FOUND }
  if (c.state === 'Draft' || c.state === 'IntakeIncomplete' || CLOSED.includes(c.state)) return { error: 'This case is not on the desk' }
  const { error } = await db().from('assignments').insert({ case_id: c.id, user_id: user.id, role: user.role })
  if (error && error.code !== '23505') throw new Error(`claim case: ${error.message}`)
  if (!error) await logEvent({ actorId: user.id, action: 'claim_case', object: 'case', objectId: c.id, location: user.location })
  refresh()
  return { ok: true }
}
