// Shared internals for the server actions. 'server-only' and NOT 'use server': nothing here is a
// public endpoint. Actions in cases.ts, desk.ts and quotes.ts do their own auth before calling in.
import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canView } from '@/domain/access'
import { IllegalTransition, transition, type CaseEvent } from '@/domain/caseMachine'
import { missingItems, type DraftFile } from '@/domain/completeness'
import { caseVerdict, verdictFor, type ScreeningHit } from '@/domain/screening'
import {
  CLIENT_ROLES,
  type Case,
  type CaseFile,
  type CaseSanctionsStatus,
  type CaseState,
  type Organisation,
  type Party,
  type ScreeningResult,
  type ScreeningVerdict,
  type User,
} from '@/domain/types'
import type { AiResult } from '@/providers/ai'
import { getScreeningProvider, screeningCfg } from '@/providers/screening'
import { logEvent } from './audit'
import { CASE_FILES_BUCKET, db } from './db'

export type ActionResult<T = object> = ({ ok: true } & T) | { error: string }

export interface CaseRow extends Case {
  ai_status: 'done' | 'failed' | null
  ai_result: AiResult | null
  route_note: string | null
  title: string | null
  created_at: string
}
export interface FileRow extends CaseFile {
  name: string
  size_bytes: number
  storage_path: string
  uploaded_by: string | null
  uploaded_at: string
}
export interface ScreeningRow extends ScreeningResult {
  hits: ScreeningHit[]
  reasons: string[]
  proposed_by: string | null
  proposed_reason: string | null
}

export const NOT_FOUND = 'Case not found' // same message for "missing" and "not yours": no existence leak
export const INTERNAL_ROLES = ['analyst', 'officer', 'specialist'] as const
export const isClientUser = (u: User) => CLIENT_ROLES.includes(u.role)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

export async function loadCase(id: string): Promise<CaseRow | null> {
  if (!UUID.test(id)) return null
  return check(await db().from('cases').select('*').eq('id', id).maybeSingle(), 'load case') as CaseRow | null
}

export async function loadOrg(id: string): Promise<Organisation> {
  return check(await db().from('organisations').select('*').eq('id', id).single(), 'load organisation') as Organisation
}

export async function loadAssignments(caseId: string): Promise<{ user_id: string; role: User['role'] }[]> {
  return check(await db().from('assignments').select('user_id, role').eq('case_id', caseId), 'load assignments') ?? []
}

export interface Access {
  allowed: boolean
  assigned: boolean
  org: Organisation
  assignments: { user_id: string; role: User['role'] }[]
}

// Case-level gate. Client users: same org (§7.3). Everyone else: canView on a stand-in unclassified
// file, so access to the case never depends on which file happens to be first; real files are then
// filtered one by one with their own sensitivity (fileVisible).
export async function caseAccess(user: User, c: CaseRow): Promise<Access> {
  const [org, assignments] = await Promise.all([loadOrg(c.org_id), loadAssignments(c.id)])
  const assigned = isClientUser(user) ? user.org_id === c.org_id : assignments.some((a) => a.user_id === user.id)
  if (isClientUser(user)) return { allowed: assigned, assigned, org, assignments }
  const standIn: CaseFile = { id: '', case_id: c.id, type: 'other', sensitivity: 'unclassified', storage_region: 'eu-west-2', hash: '' }
  const allowed = canView(viewCtx(user, org, c, standIn, assignments))
  return { allowed, assigned, org, assignments }
}

// No officer-approval table yet (Phase 1): an assigned officer counts as approved for controlled files.
function viewCtx(user: User, org: Organisation, c: CaseRow, file: CaseFile, assignments: Access['assignments']) {
  return {
    user,
    org,
    caseRow: c,
    file,
    assignedUserIds: assignments.map((a) => a.user_id),
    officerApprovedUserIds: assignments.filter((a) => a.role === 'officer').map((a) => a.user_id),
    exportAuthorisedCountries: [] as string[],
  }
}

export const fileVisible = (user: User, access: Access, c: CaseRow, file: FileRow) =>
  canView(viewCtx(user, access.org, c, file, access.assignments))

// Load the case and check access; a denied attempt is audited and looks exactly like a missing case.
export async function caseForAction(user: User, caseId: string): Promise<{ c: CaseRow; access: Access } | null> {
  const c = await loadCase(caseId)
  if (!c) return null
  const access = await caseAccess(user, c)
  if (!access.allowed) {
    await logEvent({ actorId: user.id, action: 'access_denied', object: 'case', objectId: c.id, location: user.location })
    return null
  }
  return { c, access }
}

export function nextState(from: CaseState, event: CaseEvent): { to: CaseState } | { error: string } {
  try {
    return { to: transition(from, event) }
  } catch (e) {
    if (e instanceof IllegalTransition) return { error: `Not allowed while the case is ${from}` }
    throw e
  }
}

// Every state change goes through here: domain transition, then a guarded update on the old state,
// so a double submit or a stale tab updates 0 rows and gets an error instead of a second transition.
export async function applyTransition(
  c: Pick<CaseRow, 'id' | 'state'>,
  event: CaseEvent,
  patch: Record<string, unknown> = {},
): Promise<{ state: CaseState } | { error: string }> {
  const next = nextState(c.state, event)
  if ('error' in next) return next
  const rows = check(
    await db().from('cases').update({ ...patch, state: next.to }).eq('id', c.id).eq('state', c.state).select('id'),
    'update case',
  )
  if (!rows?.length) return { error: 'This case has changed since you loaded it. Reload and try again.' }
  return { state: next.to }
}

// ---------- intake (createCase / addFiles) ----------

const PARTY_TYPES = ['buyer', 'end_user', 'consignee', 'intermediary', 'forwarder', 'agent', 'bank'] as const
const FILE_TYPES = ['spec', 'bom', 'order', 'euc', 'licence', 'other'] as const
const SENSITIVITIES = ['unclassified', 'official_sensitive', 'controlled_technology', 'secret'] as const
const country = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'country must be a 2-letter ISO code')
const optional = <T extends z.ZodType>(s: T) =>
  z.preprocess((v) => (v == null || (typeof v === 'string' && v.trim() === '') ? undefined : v), s.optional())

const IntakeSchema = z.object({
  destination: optional(country),
  end_use: optional(z.string().trim().max(600, 'end use over 600 characters')),
  deadline: optional(z.iso.date('deadline must be a date (YYYY-MM-DD)')),
  product_name: optional(z.string().trim().max(200, 'product name over 200 characters')),
  quantity: optional(z.string().trim().max(40, 'quantity over 40 characters')),
  parties: z.array(z.object({ type: z.enum(PARTY_TYPES), name: z.string().trim().min(1).max(300), country })),
  files: z.array(z.object({ type: z.enum(FILE_TYPES), sensitivity: z.enum(SENSITIVITIES) })),
})

export interface Intake {
  destination?: string
  end_use?: string
  deadline?: string
  title?: string // "<quantity> × <product_name>", or just the product name
  parties: { type: Party['type']; name: string; country: string }[]
  files: (DraftFile & { bytes: Buffer; mime: string })[]
}

const strings = (form: FormData, key: string) => form.getAll(key).map((v) => (typeof v === 'string' ? v : ''))

// Form contract (every input has a name so a bot can fill it):
//   destination, end_use, deadline, product_name, quantity
//   parties: repeated party_type / party_name / party_country (rows with an empty name are skipped)
//   files:   repeated file / file_type / file_sensitivity (an empty file input is skipped),
//            and/or the wizard's fixed slots file_spec|file_bom|file_order with sensitivity_<type>
export async function parseIntake(form: FormData): Promise<{ intake: Intake } | { errors: string[] }> {
  const pTypes = strings(form, 'party_type')
  const pNames = strings(form, 'party_name')
  const pCountries = strings(form, 'party_country')
  const parties = pNames
    .map((name, i) => ({ type: pTypes[i], name, country: pCountries[i] }))
    .filter((p) => p.name.trim())

  const fTypes = strings(form, 'file_type')
  const fSens = strings(form, 'file_sensitivity')
  const slots = (['spec', 'bom', 'order'] as const).flatMap((t) =>
    form.getAll(`file_${t}`).map((f) => ({ f, type: t as string, sensitivity: String(form.get(`sensitivity_${t}`) ?? '') })),
  )
  const uploads = [...form.getAll('file').map((f, i) => ({ f, type: fTypes[i], sensitivity: fSens[i] })), ...slots]
    .filter((u): u is { f: File; type: string; sensitivity: string } => typeof u.f !== 'string' && !!u.f.name)

  const parsed = IntakeSchema.safeParse({
    destination: form.get('destination'),
    end_use: form.get('end_use'),
    deadline: form.get('deadline'),
    product_name: form.get('product_name'),
    quantity: form.get('quantity'),
    parties,
    files: uploads.map((u) => ({ type: u.type, sensitivity: u.sensitivity })),
  })
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => `${i.path.join('.') || 'form'}: ${i.message}`) }

  const files = await Promise.all(
    uploads.map(async (u, i) => {
      const bytes = Buffer.from(await u.f.arrayBuffer())
      return {
        name: u.f.name,
        type: parsed.data.files[i].type,
        sensitivity: parsed.data.files[i].sensitivity,
        sizeBytes: bytes.length,
        hash: createHash('sha256').update(bytes).digest('hex'),
        bytes,
        mime: u.f.type || 'application/octet-stream',
      }
    }),
  )
  const { product_name, quantity, ...rest } = parsed.data
  const title = product_name ? (quantity ? `${quantity} × ${product_name}` : product_name) : undefined
  return { intake: { ...rest, title, files } }
}

// missingItems mixes per-file rejections (block the whole submission) with gaps (case goes to
// IntakeIncomplete). Split them by the domain's own messages.
const FILE_PROBLEM = /^(empty file|file over 25 MB|SECRET uploads|duplicate file)/
export function splitProblems(problems: string[]) {
  return { fileErrors: problems.filter((p) => FILE_PROBLEM.test(p)), missing: problems.filter((p) => !FILE_PROBLEM.test(p)) }
}

const safeName = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120) || 'file'

export async function storeFiles(user: User, c: Pick<CaseRow, 'id' | 'org_id'>, files: Intake['files']): Promise<void> {
  for (const f of files) {
    const path = `${c.org_id}/${c.id}/${f.hash.slice(0, 16)}-${safeName(f.name)}`
    const up = await db().storage.from(CASE_FILES_BUCKET).upload(path, f.bytes, { contentType: f.mime, upsert: false })
    if (up.error) throw new Error(`upload failed for ${f.name}: ${up.error.message}`)
    const row = check(
      await db()
        .from('case_files')
        .insert({
          case_id: c.id,
          type: f.type,
          name: f.name,
          size_bytes: f.sizeBytes,
          sensitivity: f.sensitivity,
          storage_path: path,
          hash: f.hash,
          uploaded_by: user.id,
        })
        .select('id')
        .single(),
      'insert case file',
    ) as { id: string }
    await logEvent({ actorId: user.id, action: 'upload', object: 'case_file', objectId: row.id, location: user.location })
  }
}

export async function loadFiles(caseId: string): Promise<FileRow[]> {
  return (check(await db().from('case_files').select('*').eq('case_id', caseId), 'load files') ?? []) as FileRow[]
}

export async function loadParties(ids: string[]): Promise<Party[]> {
  if (!ids.length) return []
  return (check(await db().from('parties').select('*').in('id', ids), 'load parties') ?? []) as Party[]
}

// Re-check completeness of what is stored on the case (used after addFiles).
export async function caseProblems(c: CaseRow): Promise<string[]> {
  const [files, parties] = await Promise.all([loadFiles(c.id), loadParties(c.party_ids)])
  return missingItems({
    files: files.map((f) => ({ name: f.name, type: f.type, sizeBytes: f.size_bytes, sensitivity: f.sensitivity, hash: f.hash })),
    parties,
    destination: c.destination ?? undefined,
    endUse: c.end_use ?? undefined,
  })
}

// ---------- screening (§5) ----------

const SANCTIONS_STATUS: Record<ScreeningVerdict, CaseSanctionsStatus> = {
  clear: 'clear',
  possible: 'under_review',
  red_flag: 'under_review',
  match: 'blocked',
}

// Screens every party and the destination, stores one result per check (with list versions and
// timestamp, §5.4) and applies `screened`. Provider failure leaves the case in SanctionsCheck as a
// manual task (Review Focus 4): nothing auto-advances.
export async function runScreening(user: User, c: CaseRow): Promise<ActionResult<{ verdict: ScreeningVerdict }>> {
  if (c.state !== 'SanctionsCheck') return { error: `Not allowed while the case is ${c.state}` }
  const parties = await loadParties(c.party_ids)
  const destination = c.destination ?? ''
  let rows: Omit<ScreeningRow, 'id' | 'screened_at' | 'reviewed_by' | 'decision' | 'reason' | 'proposed_by' | 'proposed_reason'>[]
  try {
    const provider = getScreeningProvider()
    const versions = await provider.listVersions()
    const base = { case_id: c.id, lists_checked: screeningCfg.listsChecked, list_versions: versions }
    rows = await Promise.all(
      parties.map(async (p) => {
        const hits = await provider.search({ name: p.name, country: p.country })
        const v = verdictFor(p, hits, destination, screeningCfg)
        return { ...base, party_id: p.id, result: v.verdict, reasons: v.reasons, hits: hits.slice(0, 5) }
      }),
    )
    const prohibited = screeningCfg.prohibitedDestinations.includes(destination.toUpperCase())
    rows.push({
      ...base,
      party_id: null as unknown as string, // the destination itself (§5.2)
      result: prohibited ? 'match' : 'clear',
      reasons: prohibited ? [`Prohibited destination: ${destination}`] : [],
      hits: [],
    })
  } catch (e) {
    await logEvent({ actorId: user.id, action: 'screening_failed', object: 'case', objectId: c.id, location: user.location })
    return { error: `Screening unavailable, manual screening needed: ${e instanceof Error ? e.message : String(e)}` }
  }
  check(await db().from('screening_results').insert(rows), 'insert screening results')
  const verdict = caseVerdict(rows.map((r) => ({ verdict: r.result })))
  const res = await applyTransition(c, { type: 'screened', verdict }, { sanctions_status: SANCTIONS_STATUS[verdict] })
  if ('error' in res) return res
  await logEvent({ actorId: user.id, action: `screened:${verdict}`, object: 'case', objectId: c.id, location: user.location })
  return { ok: true, verdict }
}

// Latest screening batch for a case (rows from one insert share a transaction timestamp).
export async function latestScreening(caseId: string): Promise<ScreeningRow[]> {
  const rows = (check(
    await db().from('screening_results').select('*').eq('case_id', caseId).order('screened_at', { ascending: false }),
    'load screening',
  ) ?? []) as ScreeningRow[]
  return rows.filter((r) => r.screened_at === rows[0]?.screened_at)
}
