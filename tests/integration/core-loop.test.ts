// Full Phase 1 loop against the live dev Supabase project, acting as seeded users through the act_as
// cookie. Skipped unless RUN_INTEGRATION=1. Uses the AI provider configured in .env.local (the real
// gateway when AI_PROVIDER=anthropic, ~25 s). Each run uses unique names, so reruns never collide.
import { describe, expect, it, vi } from 'vitest'

const RUN = process.env.RUN_INTEGRATION === '1'
if (RUN) process.loadEnvFile('.env.local')

const h = vi.hoisted(() => ({ actAs: '' }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'act_as' && h.actAs ? { name: n, value: h.actAs } : undefined) }),
}))
vi.mock('next/cache', () => ({ refresh: () => {}, revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: null }), currentUser: async () => null }))

const U = {
  member: '00000000-0000-0000-0000-000000000102',
  approver: '00000000-0000-0000-0000-000000000103',
  analyst: '00000000-0000-0000-0000-000000000201',
  officer: '00000000-0000-0000-0000-000000000202',
  uma: '00000000-0000-0000-0000-000000000206', // never claims the case: Review Focus 2
}
const as = (id: string) => (h.actAs = id)
const tag = `it-${Date.now().toString(36)}`

describe.skipIf(!RUN)('core loop against the live dev DB', () => {
  const s = { caseId: '', possibleId: '', quoteId: '' }

  it('client opens a case; screening flags the near-match consignee as possible', async () => {
    vi.stubEnv('SCREENING_PROVIDER', 'fixture')
    const { createCase } = await import('@/server/cases')
    const f = new FormData()
    f.set('destination', 'UA')
    f.set('end_use', `Agricultural field survey (${tag})`)
    const parties: [string, string][] = [
      ['buyer', `Kalyna Agro Systems ${tag} TOV`],
      ['end_user', `Polissia Field Survey ${tag} TOV`],
      ['consignee', 'Nordline Freight Services TOV'], // unchanged: must stay a near match
    ]
    for (const [type, name] of parties) {
      f.append('party_type', type)
      f.append('party_name', name)
      f.append('party_country', 'UA')
    }
    const spec = `Run ${tag}. Quadcopter UAV, 55 min endurance, gimbal thermal camera: uncooled microbolometer 640 x 512 at 30 Hz. Command link AES-256 encrypted.`
    for (const [name, body, type] of [['spec.txt', spec, 'spec'], ['order.txt', `PO ${tag}: 200 units`, 'order']]) {
      f.append('file', new File([body], name, { type: 'text/plain' }))
      f.append('file_type', type)
      f.append('file_sensitivity', 'official_sensitive')
    }
    as(U.member)
    const res = await createCase(f)
    expect(res).toMatchObject({ state: 'SanctionsReview', missing: [] })
    s.caseId = (res as { caseId: string }).caseId

    const { db } = await import('@/server/db')
    const { data: results } = await db().from('screening_results').select('*, parties(name, type)').eq('case_id', s.caseId)
    const consignee = results!.find((r) => r.parties?.type === 'consignee')
    expect(consignee.result).toBe('possible')
    expect(results!.filter((r) => r.result !== 'clear')).toHaveLength(1)
    expect(consignee.list_versions).toBeTruthy()
    s.possibleId = consignee.id
  })

  it('an unassigned analyst gets 404; analyst and officer claim the case', async () => {
    const { getCaseForUser } = await import('@/server/queries')
    const { claimCase } = await import('@/server/cases')
    as(U.uma)
    await expect(getCaseForUser(s.caseId)).rejects.toThrow('NEXT_NOT_FOUND')
    as(U.analyst)
    expect(await claimCase(s.caseId)).toEqual({ ok: true })
    as(U.officer)
    expect(await claimCase(s.caseId)).toEqual({ ok: true })
  })

  it('analyst proposes clear; officer clears; case moves to Classifying', async () => {
    const { proposeClearMatch, decideMatch } = await import('@/server/desk')
    as(U.analyst)
    expect(await decideMatch(s.possibleId, 'cleared', 'x')).toMatchObject({ error: expect.any(String) })
    expect(await proposeClearMatch(s.possibleId, 'Different registration number and address')).toEqual({ ok: true })
    as(U.officer)
    expect(await decideMatch(s.possibleId, 'cleared', 'Registration number differs from the listed entity')).toEqual({
      ok: true,
      state: 'Classifying',
    })
  })

  it('AI first pass runs and stores suggestions', { timeout: 180_000 }, async () => {
    const { runAiFirstPass } = await import('@/server/desk')
    as(U.analyst)
    const res = await runAiFirstPass(s.caseId)
    expect(res).toMatchObject({ ok: true })
    const { db } = await import('@/server/db')
    const { data } = await db().from('cases').select('state, ai_status, ai_result').eq('id', s.caseId).single()
    expect(data).toMatchObject({ state: 'Classifying', ai_status: 'done' })
    expect(Array.isArray(data!.ai_result.suggestions)).toBe(true)
  })

  it('analyst saves the classification; officer signs route C; a quote is shown', async () => {
    const { saveClassification, signRoute } = await import('@/server/desk')
    as(U.analyst)
    expect(
      await saveClassification(s.caseId, {
        listEntries: ['6A003.b.4'],
        reasoning: 'Uncooled microbolometer 640 x 512 at 30 Hz meets 6A003.b.4.',
        rulebookRefs: ['RB-THERMAL-1'],
        confidence: 0.8,
      }),
    ).toMatchObject({ ok: true })
    as(U.analyst)
    expect(await signRoute(s.caseId, 'C', 'x')).toEqual({ error: 'Only an officer can sign' })
    as(U.officer)
    const signed = await signRoute(s.caseId, 'C', 'Individual licence required')
    expect(signed).toMatchObject({ ok: true, state: 'RouteQuote' })
    s.quoteId = (signed as { quoteIds: string[] }).quoteIds[0]
    expect(s.quoteId).toBeTruthy()
  })

  it('Review Focus 1: member cannot approve; two concurrent approvals give exactly one', async () => {
    const { approveQuote } = await import('@/server/quotes')
    as(U.member)
    expect(await approveQuote(s.quoteId)).toMatchObject({ error: expect.stringContaining('admin or approver') })
    as(U.approver)
    const results = await Promise.all([approveQuote(s.quoteId), approveQuote(s.quoteId)])
    expect(results.filter((r) => 'ok' in r)).toHaveLength(1)
    expect(results.filter((r) => 'error' in r)).toHaveLength(1)
    expect(await approveQuote(s.quoteId)).toMatchObject({ error: expect.any(String) })

    const { db } = await import('@/server/db')
    const { data: quote } = await db().from('quotes').select('*').eq('id', s.quoteId).single()
    expect(quote).toMatchObject({ status: 'approved', approved_by: U.approver })
    const { data: c } = await db().from('cases').select('state').eq('id', s.caseId).single()
    expect(c!.state).toBe('RouteInProgress')
  })

  it('every step is in the audit log', async () => {
    const { db } = await import('@/server/db')
    const { data: events } = await db()
      .from('audit_events')
      .select('action, actor_id')
      .in('object_id', [s.caseId, s.quoteId, s.possibleId])
    const actions = events!.map((e) => e.action)
    for (const a of [
      'open_case', 'submit_case', 'screened:possible', 'access_denied', 'claim_case', 'propose_clear_match',
      'decide_match:cleared', 'ai_first_pass', 'sign_route:C', 'approve_quote',
    ]) {
      expect(actions, a).toContain(a)
    }
    expect(actions.filter((a) => a === 'approve_quote')).toHaveLength(1)
    expect(events!.find((e) => e.action === 'access_denied')!.actor_id).toBe(U.uma)
  })
})
