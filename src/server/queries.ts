// Read helpers for pages. 'server-only', not 'use server': these are called while rendering.
import 'server-only'
import { notFound } from 'next/navigation'
import { clientActionFor } from '@/domain/caseMachine'
import { can } from '@/domain/permissions'
import {
  CASE_STATES,
  type AuditEvent,
  type CaseState,
  type Classification,
  type ClientAction,
  type Organisation,
  type Party,
  type Question,
  type Quote,
  type Role,
  type User,
  type VettingLevel,
} from '@/domain/types'
import { logEvent } from './audit'
import {
  INTERNAL_ROLES,
  caseAccess,
  fileVisible,
  isClientUser,
  latestScreening,
  loadCase,
  loadFiles,
  loadParties,
  type CaseRow,
  type FileRow,
  type ScreeningRow,
} from './core'
import { db } from './db'
import { getCurrentUser } from './session'

export type { CaseRow, FileRow, ScreeningRow } from './core'

export interface CaseView {
  case: CaseRow
  org: Organisation
  viewer: {
    id: string
    name: string
    role: Role
    isClient: boolean
    canUpload: boolean
    canAnswer: boolean
    canApproveQuote: boolean
    canSeeSanctions: boolean
    canAskClient: boolean
    canProposeClear: boolean
    canDecideMatch: boolean
    canClassify: boolean
    canSign: boolean
  }
  clientAction: ClientAction
  parties: Party[]
  screening: ScreeningRow[] // latest batch; [] when the viewer may not see sanctions results
  files: FileRow[] // only files this viewer may see (§7.4, per file)
  hiddenFileCount: number
  classification: Classification | null
  quotes: Quote[]
  questions: Question[]
  team: { userId: string; name: string; role: Role; vetting: VettingLevel }[]
  audit: AuditEvent[] // last 5; [] without see_audit
  locked: string | null // reason the case is locked (§7.5: any red item)
}

const rows = async <T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<T[]> => {
  const { data, error } = await q
  if (error) throw new Error(`${what}: ${error.message}`)
  return (data ?? []) as T[]
}

// 404 (no existence leak) unless the user may see the case; denied attempts are audited (Review Focus 2).
export async function getCaseForUser(caseId: string): Promise<CaseView> {
  const user = await getCurrentUser()
  if (!user) notFound()
  const c = await loadCase(caseId)
  if (!c) notFound()
  const access = await caseAccess(user, c)
  if (!access.allowed) {
    await logEvent({ actorId: user.id, action: 'access_denied', object: 'case', objectId: c.id, location: user.location })
    notFound()
  }
  const { org, assigned } = access
  const client = isClientUser(user)
  const canSeeSanctions = can(user.role, 'view_sanctions', { assigned })

  const [parties, screening, allFiles, classifications, quotes, questions] = await Promise.all([
    loadParties(c.party_ids),
    canSeeSanctions ? latestScreening(c.id) : Promise.resolve([]),
    loadFiles(c.id),
    rows<Classification>(db().from('classifications').select('*').eq('case_id', c.id), 'load classification'),
    rows<Quote>(db().from('quotes').select('*').eq('case_id', c.id), 'load quotes'),
    rows<Question>(db().from('questions').select('*').eq('case_id', c.id), 'load questions'),
  ])
  const files = allFiles.filter((f) => fileVisible(user, access, c, f))
  const teamIds = access.assignments.map((a) => a.user_id)
  const teamUsers = teamIds.length ? await rows<User>(db().from('users').select('*').in('id', teamIds), 'load team') : []

  const objectIds = [c, ...allFiles, ...quotes, ...questions, ...screening, ...classifications].map((o) => o.id)
  const audit = can(user.role, 'see_audit')
    ? await rows<AuditEvent>(
        db().from('audit_events').select('*').in('object_id', objectIds).order('timestamp', { ascending: false }).limit(5),
        'load audit',
      )
    : []

  await logEvent({ actorId: user.id, action: 'view_case', object: 'case', objectId: c.id, location: user.location })

  const locked =
    org.onboarding_status !== 'authorised'
      ? 'Organisation is not authorised'
      : org.sanctions_status === 'blocked'
        ? 'Organisation is blocked by sanctions screening'
        : c.sanctions_status === 'blocked'
          ? 'Sanctions: confirmed match or prohibited destination'
          : null

  return {
    case: c,
    org,
    viewer: {
      id: user.id,
      name: user.name,
      role: user.role,
      isClient: client,
      canUpload: can(user.role, 'upload', { assigned }),
      canAnswer: client && user.role !== 'client_viewer',
      canApproveQuote: can(user.role, 'approve_quote'),
      canSeeSanctions,
      canAskClient: can(user.role, 'ask_client'),
      canProposeClear: can(user.role, 'propose_clear_match'),
      canDecideMatch: can(user.role, 'clear_match'),
      canClassify: user.role === 'analyst' || user.role === 'officer',
      canSign: can(user.role, 'sign_classification'),
    },
    clientAction: clientActionFor(c.state, c.pending_client_kind ?? undefined),
    parties,
    screening,
    files,
    hiddenFileCount: allFiles.length - files.length,
    classification: classifications.find((x) => !x.signed_by) ?? classifications[0] ?? null,
    quotes,
    questions,
    team: teamUsers.map((u) => ({ userId: u.id, name: u.name, role: u.role, vetting: u.vetting_level })),
    audit,
    locked,
  }
}

export interface CaseListItem {
  id: string
  title: string | null
  buyerName: string | null // first party of type buyer
  state: CaseState
  clientAction: ClientAction
  destination: string | null
  deadline: string | null
  endUse: string | null
  route: CaseRow['route']
  createdAt: string
}

const listItem = (c: CaseRow, parties: Party[]): CaseListItem => ({
  id: c.id,
  title: c.title,
  buyerName: c.party_ids.map((pid) => parties.find((p) => p.id === pid)).find((p) => p?.type === 'buyer')?.name ?? null,
  state: c.state,
  clientAction: clientActionFor(c.state, c.pending_client_kind ?? undefined),
  destination: c.destination,
  deadline: c.deadline,
  endUse: c.end_use,
  route: c.route,
  createdAt: c.created_at,
})

// Client users: every case of their org. Internal and partner users: cases assigned to them.
export async function listCasesForUser(): Promise<CaseListItem[]> {
  const user = await getCurrentUser()
  if (!user) return []
  let cases: CaseRow[]
  if (isClientUser(user)) {
    if (!user.org_id) return []
    cases = await rows<CaseRow>(db().from('cases').select('*').eq('org_id', user.org_id).order('created_at', { ascending: false }), 'list cases')
  } else if (user.role === 'buyer' || user.role === 'ops_admin') {
    return [] // buyer sees only the certificate request; ops admin never sees case content (§7.2)
  } else {
    const mine = await rows<{ case_id: string }>(db().from('assignments').select('case_id').eq('user_id', user.id), 'list assignments')
    if (!mine.length) return []
    cases = await rows<CaseRow>(
      db().from('cases').select('*').in('id', mine.map((a) => a.case_id)).order('created_at', { ascending: false }),
      'list cases',
    )
  }
  const parties = await loadParties([...new Set(cases.flatMap((c) => c.party_ids))])
  return cases.map((c) => listItem(c, parties))
}

// Target times from §4.3.
const TARGET: Partial<Record<CaseState, string>> = {
  SanctionsCheck: 'Minutes',
  SanctionsReview: 'Same day',
  AwaitingClient: 'Waiting on client',
  Classifying: '≤1 working day',
  AwaitingClient2: 'Waiting on client',
  EmergingReview: 'Same day',
  OfficerReview: '≤2 working days',
}
const DESK_STATES: CaseState[] = [
  'SanctionsCheck', 'SanctionsReview', 'AwaitingClient', 'Classifying', 'AwaitingClient2', 'EmergingQuote',
  'EmergingReview', 'OfficerReview', 'RouteQuote', 'RouteInProgress', 'AwaitingClient3', 'Filed',
]

export interface QueueItem {
  id: string
  state: CaseState
  orgName: string
  deadline: string | null
  createdAt: string
  target: string | null
  aiStatus: CaseRow['ai_status']
  assignedToMe: boolean // false = unclaimed by you: metadata only, claim it (claimCase) to open it
}

// Desk queue for analysts, officers and specialists: every active case as metadata only, ordered by
// state. Opening a case still needs an assignment (claimCase) or it 404s.
export async function deskQueue(): Promise<QueueItem[]> {
  const user = await getCurrentUser()
  if (!user || !INTERNAL_ROLES.includes(user.role as (typeof INTERNAL_ROLES)[number])) return []
  const [cases, mine] = await Promise.all([
    rows<CaseRow>(db().from('cases').select('*').in('state', DESK_STATES).order('created_at', { ascending: true }), 'desk cases'),
    rows<{ case_id: string }>(db().from('assignments').select('case_id').eq('user_id', user.id), 'desk assignments'),
  ])
  const orgIds = [...new Set(cases.map((c) => c.org_id))]
  const orgs = orgIds.length ? await rows<Organisation>(db().from('organisations').select('id, name').in('id', orgIds), 'desk orgs') : []
  const mineSet = new Set(mine.map((a) => a.case_id))
  return cases
    .map((c) => ({
      id: c.id,
      state: c.state,
      orgName: orgs.find((o) => o.id === c.org_id)?.name ?? '',
      deadline: c.deadline,
      createdAt: c.created_at,
      target: TARGET[c.state] ?? null,
      aiStatus: c.ai_status,
      assignedToMe: mineSet.has(c.id),
    }))
    .sort((a, b) => CASE_STATES.indexOf(a.state) - CASE_STATES.indexOf(b.state))
}
