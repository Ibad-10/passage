// Permission and transition rules of every server action, with the db layer replaced by FakeDb.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FIXTURE_RESULT } from '@/providers/ai/fixture'
import type { User } from '@/domain/types'
import { FakeDb } from './fakeDb'

const h = vi.hoisted(() => ({
  db: null as unknown as import('./fakeDb').FakeDb,
  user: null as User | null,
  ai: { run: async (_: unknown): Promise<unknown> => null },
}))
vi.mock('@/server/db', () => ({ db: () => h.db, CASE_FILES_BUCKET: 'case-files' }))
vi.mock('@/server/session', () => ({ getCurrentUser: async () => h.user }))
vi.mock('next/cache', () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/providers/ai', async (orig) => ({ ...(await orig<object>()), getAiProvider: () => h.ai }))

const { createCase, addFiles, answerQuestion, screenCase, claimCase } = await import('@/server/cases')
const { proposeClearMatch, decideMatch, askClient, runAiFirstPass, saveClassification, signRoute } = await import('@/server/desk')
const { approveQuote, declineQuote, askAboutQuote } = await import('@/server/quotes')
const { getCaseForUser, listCasesForUser, deskQueue } = await import('@/server/queries')

const ORG = '00000000-0000-0000-0000-000000000001'
const OTHER_ORG = '00000000-0000-0000-0000-000000000002'
const CASE = '00000000-0000-0000-0000-000000000401'
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const mk = (n: number, role: User['role'], org: string | null, extra: Partial<User> = {}): User => ({
  id: id(n), org_id: org, name: role, email: `${role}${n}@x.test`, role, identity_verified: true, vetting_level: 'baseline', location: 'GB', ...extra,
})
const U = {
  admin: mk(101, 'client_admin', ORG),
  member: mk(102, 'client_member', ORG),
  approver: mk(103, 'client_approver', ORG),
  viewer: mk(104, 'client_viewer', ORG),
  analyst: mk(201, 'analyst', null),
  officer: mk(202, 'officer', null, { vetting_level: 'sc' }),
  uma: mk(206, 'analyst', null),
  outsider: mk(901, 'client_admin', OTHER_ORG),
}
const PARTIES = [
  { id: id(301), name: 'Kalyna Agro Systems TOV', type: 'buyer', country: 'UA' },
  { id: id(302), name: 'Polissia Field Survey TOV', type: 'end_user', country: 'UA' },
  { id: id(303), name: 'Nordline Freight Services TOV', type: 'consignee', country: 'UA' },
]

function seed(state: string, extra: Record<string, Record<string, unknown>[]> = {}) {
  h.db = new FakeDb({
    organisations: [
      { id: ORG, name: 'Skyline Drones Ltd', plan: 'S', onboarding_status: 'authorised', sanctions_status: 'clear', data_ceiling: 'official_sensitive' },
      { id: OTHER_ORG, name: 'Other Ltd', plan: 'P', onboarding_status: 'authorised', sanctions_status: 'clear', data_ceiling: 'unclassified' },
    ],
    users: Object.values(U),
    parties: PARTIES,
    cases: [
      {
        id: CASE, org_id: ORG, party_ids: PARTIES.map((p) => p.id), destination: 'UA', end_use: 'Field survey', deadline: null,
        sensitivity: 'official_sensitive', sanctions_status: 'pending', state, route: null, emerging_flag: false,
        pending_client_kind: null, ai_status: null, ai_result: null, route_note: null, created_at: '2026-10-31T00:00:00Z',
      },
    ],
    assignments: [
      { id: id(501), case_id: CASE, user_id: U.analyst.id, role: 'analyst' },
      { id: id(502), case_id: CASE, user_id: U.officer.id, role: 'officer' },
    ],
    ...extra,
  })
  h.db.rpcs.decide_quote = (a, d) => {
    const q = d.rows('quotes').find((x) => x.id === a.p_quote_id && x.status === 'shown')
    if (!q) return { message: 'quote is no longer open' }
    const c = d.rows('cases').find((x) => x.id === q.case_id && x.state === a.p_from)
    if (!c) return { message: 'case is no longer awaiting this quote' }
    Object.assign(q, { status: a.p_status, approved_by: a.p_status === 'approved' ? a.p_user_id : null })
    c.state = a.p_to
    return null
  }
}
const caseState = () => h.db.rows('cases').find((c) => c.id === CASE)!.state
const audits = (action: string) => h.db.rows('audit_events').filter((e) => e.action === action)
const as = (u: User) => (h.user = u)

function intakeForm(over: { consignee?: string | null; destination?: string; files?: [string, string, string, string][] } = {}) {
  const f = new FormData()
  f.set('destination', over.destination ?? 'UA')
  f.set('end_use', 'Agricultural field survey')
  const parties: [string, string][] = [['buyer', 'Kalyna Agro Systems TOV'], ['end_user', 'Polissia Field Survey TOV']]
  if (over.consignee !== null) parties.push(['consignee', over.consignee ?? 'Nordline Freight Services TOV'])
  for (const [type, name] of parties) {
    f.append('party_type', type)
    f.append('party_name', name)
    f.append('party_country', 'UA')
  }
  const files = over.files ?? [
    ['spec.txt', 'thermal camera 640x512', 'spec', 'official_sensitive'],
    ['order.txt', 'PO 200 units', 'order', 'unclassified'],
  ]
  for (const [name, body, type, sens] of files) {
    f.append('file', new File([body], name, { type: 'text/plain' }))
    f.append('file_type', type)
    f.append('file_sensitivity', sens)
  }
  return f
}

beforeEach(() => {
  vi.stubEnv('SCREENING_PROVIDER', 'fixture')
  h.ai = { run: async () => structuredClone(FIXTURE_RESULT) }
})

describe('createCase', () => {
  beforeEach(() => seed('Draft', { cases: [], assignments: [] }))

  it('rejects roles without open_case', async () => {
    for (const u of [U.viewer, U.analyst]) {
      as(u)
      expect(await createCase(intakeForm())).toEqual({ errors: ['Your role cannot open cases'] })
    }
  })
  it('Review Focus 5: a SECRET file rejects the whole submission and stores nothing', async () => {
    as(U.member)
    const res = await createCase(intakeForm({ files: [['s.txt', 'x', 'spec', 'secret'], ['o.txt', 'y', 'order', 'unclassified']] }))
    expect(res).toEqual({ errors: ['SECRET uploads are not accepted'] })
    expect(h.db.rows('cases')).toHaveLength(0)
    expect(h.db.files.size).toBe(0)
  })
  it('Review Focus 5: empty and duplicate files are rejected per file', async () => {
    as(U.member)
    const res = await createCase(intakeForm({ files: [['a.txt', '', 'spec', 'unclassified'], ['b.txt', 'same', 'order', 'unclassified'], ['c.txt', 'same', 'bom', 'unclassified']] }))
    expect(res).toEqual({ errors: ['empty file: a.txt', 'duplicate file: c.txt'] })
  })
  it('gaps send the case to IntakeIncomplete', async () => {
    as(U.member)
    const res = await createCase(intakeForm({ consignee: null }))
    expect(res).toMatchObject({ state: 'IntakeIncomplete', missing: ['consignee party'] })
  })
  it('complete intake is screened; the near-match consignee makes it a possible match', async () => {
    as(U.member)
    const res = await createCase(intakeForm())
    expect(res).toMatchObject({ state: 'SanctionsReview', missing: [] })
    const results = h.db.rows('screening_results')
    expect(results).toHaveLength(4) // three parties + destination
    expect(results.map((r) => r.result).sort()).toEqual(['clear', 'clear', 'clear', 'possible'])
    expect(results.every((r) => Array.isArray(r.lists_checked) && r.list_versions && r.screened_at)).toBe(true)
    const stored = h.db.rows('case_files')
    expect(stored).toHaveLength(2)
    expect(stored[0].storage_path).toMatch(new RegExp(`^${ORG}/[0-9a-f-]{36}/[0-9a-f]{16}-spec\\.txt$`))
    expect(stored[0].hash).toMatch(/^[0-9a-f]{64}$/)
    expect(audits('open_case')).toHaveLength(1)
    expect(audits('upload')).toHaveLength(2)
  })
  it('a prohibited destination closes the case (match)', async () => {
    as(U.member)
    expect(await createCase(intakeForm({ destination: 'RU' }))).toMatchObject({ state: 'ClosedDoNotProceed' })
  })
})

describe('addFiles', () => {
  it('IntakeIncomplete -> Draft -> screened once the gaps are filled', async () => {
    seed('IntakeIncomplete', { cases: [] })
    as(U.member)
    const created = (await createCase(intakeForm({ consignee: null }))) as { caseId: string }
    const f = new FormData()
    f.append('party_type', 'consignee')
    f.append('party_name', 'Nordline Freight Services TOV')
    f.append('party_country', 'UA')
    f.append('file', new File(['bom'], 'bom.csv'))
    f.append('file_type', 'bom')
    f.append('file_sensitivity', 'unclassified')
    expect(await addFiles(created.caseId, f)).toMatchObject({ ok: true, state: 'SanctionsReview' })
  })
  it('client of another org gets "not found" and the attempt is audited', async () => {
    seed('Draft')
    as(U.outsider)
    expect(await addFiles(CASE, intakeForm())).toEqual({ error: 'Case not found' })
    expect(audits('access_denied')).toHaveLength(1)
  })
  it('viewer cannot upload', async () => {
    seed('Classifying')
    as(U.viewer)
    expect(await addFiles(CASE, intakeForm())).toEqual({ error: 'Your role cannot upload files' })
  })
})

describe('answerQuestion', () => {
  const q = { id: id(601), case_id: CASE, from_user: id(201), to_role: 'client_member', text: 'Reg no?', answer: null, status: 'open' }
  const form = (a: string) => {
    const f = new FormData()
    f.set('answer', a)
    return f
  }
  it('client answer returns the case to SanctionsReview', async () => {
    seed('AwaitingClient', { questions: [q] })
    as(U.member)
    expect(await answerQuestion(q.id, form('12345678'))).toEqual({ ok: true, state: 'SanctionsReview' })
    expect(await answerQuestion(q.id, form('again'))).toEqual({ error: 'This question was already answered' })
  })
  it('viewer and analysts cannot answer a client question', async () => {
    seed('AwaitingClient', { questions: [q] })
    for (const u of [U.viewer, U.analyst]) {
      as(u)
      expect(await answerQuestion(q.id, form('x'))).toEqual({ error: 'Your role cannot answer this question' })
    }
    expect(caseState()).toBe('AwaitingClient')
  })
})

describe('screenCase and claimCase', () => {
  it('screenCase outside SanctionsCheck is an error, not a throw', async () => {
    seed('Classifying')
    as(U.analyst)
    expect(await screenCase(CASE)).toEqual({ error: 'Not allowed while the case is Classifying' })
  })
  it('screenCase from SanctionsCheck applies the verdict', async () => {
    seed('SanctionsCheck')
    as(U.analyst)
    expect(await screenCase(CASE)).toMatchObject({ ok: true })
    expect(caseState()).toBe('SanctionsReview')
  })
  it('an unassigned analyst can claim a desk case; a client cannot', async () => {
    seed('SanctionsReview')
    as(U.member)
    expect(await claimCase(CASE)).toEqual({ error: 'Case not found' })
    as(U.uma)
    expect(await claimCase(CASE)).toEqual({ ok: true })
    expect(h.db.rows('assignments').some((a) => a.user_id === U.uma.id)).toBe(true)
    expect(audits('claim_case')).toHaveLength(1)
  })
})

describe('sanctions review', () => {
  const possible = { id: id(701), case_id: CASE, party_id: id(303), result: 'possible', decision: null, reviewed_by: null, reason: null, screened_at: '2026-10-31T10:00:00Z', lists_checked: ['UK'], list_versions: {}, hits: [], reasons: [] }
  const clear = { ...possible, id: id(702), party_id: id(301), result: 'clear' }
  beforeEach(() => seed('SanctionsReview', { screening_results: [possible, clear] }))

  it('only an analyst proposes; an unassigned analyst gets not found', async () => {
    as(U.officer)
    expect(await proposeClearMatch(possible.id, 'different reg no')).toEqual({ error: 'Only an analyst can propose clearing a match' })
    as(U.uma)
    expect(await proposeClearMatch(possible.id, 'x')).toEqual({ error: 'Screening result not found' })
    as(U.analyst)
    expect(await proposeClearMatch(possible.id, 'different reg no')).toEqual({ ok: true })
    expect(h.db.rows('screening_results')[0]).toMatchObject({ proposed_by: U.analyst.id, proposed_reason: 'different reg no' })
    expect(caseState()).toBe('SanctionsReview')
  })
  it('only an officer decides; a reason is required', async () => {
    as(U.analyst)
    expect(await decideMatch(possible.id, 'cleared', 'x')).toEqual({ error: 'Only an officer can decide a sanctions match' })
    as(U.officer)
    expect(await decideMatch(possible.id, 'cleared', '  ')).toMatchObject({ error: expect.stringContaining('reason') })
  })
  it('officer clears -> Classifying; a second decision is rejected', async () => {
    as(U.officer)
    expect(await decideMatch(possible.id, 'cleared', 'Different registration number')).toEqual({ ok: true, state: 'Classifying' })
    expect(await decideMatch(possible.id, 'confirmed', 'x')).toEqual({ error: 'Not allowed while the case is Classifying' })
  })
  it('officer confirms -> ClosedDoNotProceed', async () => {
    as(U.officer)
    expect(await decideMatch(possible.id, 'confirmed', 'Same entity')).toEqual({ ok: true, state: 'ClosedDoNotProceed' })
  })
})

describe('askClient', () => {
  it('analyst asks in Classifying -> AwaitingClient2 with a question', async () => {
    seed('Classifying')
    as(U.analyst)
    expect(await askClient(CASE, 'Frame rate?', 'ANSWER')).toMatchObject({ ok: true })
    expect(caseState()).toBe('AwaitingClient2')
    expect(h.db.rows('questions')[0]).toMatchObject({ to_role: 'client_member', status: 'open' })
  })
  it('client cannot ask; SIGN outside route work and OfficerReview are rejected', async () => {
    seed('Classifying')
    as(U.member)
    expect(await askClient(CASE, 'x', 'ANSWER')).toEqual({ error: 'Your role cannot ask the client' })
    as(U.analyst)
    expect(await askClient(CASE, 'Sign', 'SIGN')).toMatchObject({ error: expect.stringContaining('route work') })
    seed('OfficerReview')
    expect(await askClient(CASE, 'x', 'ANSWER')).toEqual({ error: 'Not allowed while the case is OfficerReview' })
  })
  it('SIGN during route work -> AwaitingClient3 with pending SIGN', async () => {
    seed('RouteInProgress')
    as(U.officer)
    expect(await askClient(CASE, 'Sign the declaration', 'SIGN')).toMatchObject({ ok: true })
    expect(h.db.rows('cases')[0]).toMatchObject({ state: 'AwaitingClient3', pending_client_kind: 'SIGN' })
  })
})

describe('runAiFirstPass', () => {
  const files = [
    { id: id(801), case_id: CASE, type: 'spec', name: 'spec.txt', size_bytes: 10, sensitivity: 'official_sensitive', storage_path: 'p/spec.txt', hash: 'a' },
    { id: id(802), case_id: CASE, type: 'bom', name: 'secret-sauce.txt', size_bytes: 10, sensitivity: 'controlled_technology', storage_path: 'p/ct.txt', hash: 'b' },
    { id: id(803), case_id: CASE, type: 'order', name: 'order.pdf', size_bytes: 10, sensitivity: 'unclassified', storage_path: 'p/o.pdf', hash: 'c' },
  ]
  beforeEach(() => {
    seed('Classifying', { case_files: files })
    h.db.files.set('p/spec.txt', Buffer.from('640x512 thermal'))
    h.db.files.set('p/ct.txt', Buffer.from('CONTROLLED DETAIL'))
  })

  it('Review Focus 4: provider failure keeps Classifying and flags manual classification', async () => {
    h.ai = { run: async () => { throw new Error('gateway down') } }
    as(U.analyst)
    expect(await runAiFirstPass(CASE)).toMatchObject({ error: expect.stringContaining('classify manually') })
    expect(h.db.rows('cases')[0]).toMatchObject({ state: 'Classifying', ai_status: 'failed' })
  })
  it('stores suggestions; never sends controlled technology text; PDFs pending', async () => {
    const run = vi.fn(async (_: unknown) => structuredClone(FIXTURE_RESULT))
    h.ai = { run }
    as(U.analyst)
    expect(await runAiFirstPass(CASE)).toMatchObject({ ok: true })
    const sent = JSON.stringify(run.mock.calls[0][0])
    expect(sent).toContain('640x512 thermal')
    expect(sent).not.toContain('CONTROLLED DETAIL')
    expect(sent).toContain('pdf text extraction pending')
    expect(h.db.rows('cases')[0]).toMatchObject({ state: 'Classifying', ai_status: 'done', ai_result: FIXTURE_RESULT })
  })
  it('clients and other states are rejected', async () => {
    as(U.member)
    expect(await runAiFirstPass(CASE)).toEqual({ error: 'Case not found' })
    seed('OfficerReview')
    as(U.analyst)
    expect(await runAiFirstPass(CASE)).toEqual({ error: 'Not allowed while the case is OfficerReview' })
  })
})

describe('saveClassification and signRoute', () => {
  const input = { listEntries: ['6A003.b.4'], reasoning: 'Thermal camera meets 6A003.b.4', rulebookRefs: ['RB-12'], confidence: 0.8 }
  const draft = { id: id(901), case_id: CASE, list_entries: ['6A003.b.4'], reasoning: 'r', rulebook_refs: [], confidence: 0.8, signed_by: null, signed_at: null }

  it('analyst saves -> OfficerReview; client and bad input rejected', async () => {
    seed('Classifying')
    as(U.member)
    expect(await saveClassification(CASE, input)).toEqual({ error: 'Only an analyst or officer can classify' })
    as(U.analyst)
    expect(await saveClassification(CASE, { ...input, reasoning: '' })).toMatchObject({ error: expect.stringContaining('reasoning') })
    expect(await saveClassification(CASE, input)).toMatchObject({ ok: true })
    expect(caseState()).toBe('OfficerReview')
    expect(await saveClassification(CASE, input)).toEqual({ error: 'Not allowed while the case is OfficerReview' })
  })
  it('only the officer signs; route C creates the plan S individual quote', async () => {
    seed('OfficerReview', { classifications: [draft] })
    as(U.analyst)
    expect(await signRoute(CASE, 'C', '')).toEqual({ error: 'Only an officer can sign' })
    as(U.officer)
    expect(await signRoute(CASE, 'C', 'Individual licence')).toMatchObject({ ok: true, state: 'RouteQuote' })
    expect(h.db.rows('classifications')[0].signed_by).toBe(U.officer.id)
    expect(h.db.rows('quotes')).toMatchObject([{ item: 'individual', amount: 80000, status: 'shown' }])
    expect(await signRoute(CASE, 'C', 'again')).toEqual({ error: 'Not allowed while the case is RouteQuote' })
  })
  it('route A closes without quotes; D needs reasons; no classification, no signature', async () => {
    seed('OfficerReview', { classifications: [draft] })
    as(U.officer)
    expect(await signRoute(CASE, 'D', '')).toMatchObject({ error: expect.stringContaining('reasons') })
    expect(await signRoute(CASE, 'A', '')).toMatchObject({ ok: true, state: 'ClosedNotControlled', quoteIds: [] })
    seed('OfficerReview')
    expect(await signRoute(CASE, 'C', '')).toEqual({ error: 'There is no classification to sign' })
  })
})

describe('quotes', () => {
  const quote = { id: id(1001), case_id: CASE, item: 'individual', amount: 80000, status: 'shown', approved_by: null, approved_at: null }
  beforeEach(() => seed('RouteQuote', { quotes: [quote] }))

  it('client_member and analysts cannot approve', async () => {
    for (const u of [U.member, U.analyst]) {
      as(u)
      expect(await approveQuote(quote.id)).toMatchObject({ error: expect.stringContaining('admin or approver') })
    }
  })
  it('Review Focus 1: two concurrent approvals -> exactly one succeeds', async () => {
    as(U.approver)
    const results = await Promise.all([approveQuote(quote.id), approveQuote(quote.id)])
    expect(results.filter((r) => 'ok' in r)).toHaveLength(1)
    expect(results.filter((r) => 'error' in r)).toHaveLength(1)
    expect(caseState()).toBe('RouteInProgress')
    expect(audits('approve_quote')).toHaveLength(1)
  })
  it('decline closes the case; other org gets not found', async () => {
    as(U.outsider)
    expect(await declineQuote(quote.id)).toEqual({ error: 'Quote not found' })
    as(U.admin)
    expect(await declineQuote(quote.id)).toEqual({ ok: true, state: 'Closed' })
  })
  it('askAboutQuote: member asks the analyst; viewer cannot', async () => {
    as(U.viewer)
    expect(await askAboutQuote(quote.id, 'Why?')).toEqual({ error: 'Your role cannot ask about quotes' })
    as(U.member)
    expect(await askAboutQuote(quote.id, 'Why?')).toMatchObject({ ok: true })
    expect(h.db.rows('questions')[0]).toMatchObject({ to_role: 'analyst' })
    expect(caseState()).toBe('RouteQuote')
  })
})

describe('reads', () => {
  const files = [
    { id: id(801), case_id: CASE, type: 'spec', name: 'spec.txt', size_bytes: 10, sensitivity: 'official_sensitive', storage_path: 'a', hash: 'a' },
    { id: id(802), case_id: CASE, type: 'bom', name: 'ct.txt', size_bytes: 10, sensitivity: 'controlled_technology', storage_path: 'b', hash: 'b' },
  ]
  it('Review Focus 2: unassigned analyst gets 404 and the attempt is audited', async () => {
    seed('Classifying', { case_files: files })
    as(U.uma)
    await expect(getCaseForUser(CASE)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(audits('access_denied')).toHaveLength(1)
  })
  it('client sees controlled files; the assigned analyst does not (no officer approval)', async () => {
    seed('Classifying', { case_files: files })
    as(U.member)
    expect((await getCaseForUser(CASE)).files).toHaveLength(2)
    as(U.analyst)
    const view = await getCaseForUser(CASE)
    expect(view.files.map((f) => f.name)).toEqual(['spec.txt'])
    expect(view.hiddenFileCount).toBe(1)
    expect(audits('view_case')).toHaveLength(2)
  })
  it('listCasesForUser and deskQueue scope by org and assignment', async () => {
    seed('Classifying')
    as(U.member)
    expect(await listCasesForUser()).toMatchObject([{ id: CASE, clientAction: 'WAIT' }])
    as(U.outsider)
    expect(await listCasesForUser()).toEqual([])
    as(U.uma)
    expect(await listCasesForUser()).toEqual([])
    expect(await deskQueue()).toMatchObject([{ id: CASE, assignedToMe: false, orgName: 'Skyline Drones Ltd' }])
    as(U.member)
    expect(await deskQueue()).toEqual([])
  })
})
